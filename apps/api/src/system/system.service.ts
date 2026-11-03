import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { BackupFile, ResetDto, SystemResult } from '@ar-option/shared-types';
import {
  BACKUP_TABLES,
  BACKUP_SEQUENCES,
  TRANSACTION_TABLES,
  CATALOG_TABLES,
  DEFAULT_EXPENSE_CATEGORIES,
  RESET_CONFIRM,
} from './tables';

/** The same lock the catalog and import use, so no product write runs during a restore or reset. */
const SKU_LOCK_KEY = 'catalog_sku';

/**
 * Backup, restore and reset. These are the only paths that remove posted ledger lines.
 * They are admin-only and run in one transaction each (agent.md Rule 3 exception).
 */
@Injectable()
export class SystemService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async backup(): Promise<BackupFile> {
    const client = await this.pool.connect();
    try {
      // One snapshot for every table, so the file is consistent even while the shops sell.
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
      const tables: BackupFile['tables'] = {};
      for (const table of BACKUP_TABLES) {
        // Postgres writes the JSON, so dates, numerics and JSONB keep their exact text.
        const res = await client.query(
          `SELECT COALESCE(json_agg(t), '[]'::json) AS rows FROM (SELECT * FROM ${table} ORDER BY 1) t`
        );
        tables[table] = res.rows[0].rows;
      }
      const sequences: Record<string, number> = {};
      for (const seq of BACKUP_SEQUENCES) {
        const res = await client.query(`SELECT last_value, is_called FROM ${seq}`);
        sequences[seq] = Number(res.rows[0].last_value) - (res.rows[0].is_called ? 0 : 1);
      }
      const schemaVersion = await this.schemaVersion(client);
      await client.query('COMMIT');
      return {
        app: 'ar-option',
        schema_version: schemaVersion,
        created_at: new Date().toISOString(),
        tables,
        sequences,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** Replaces every business table with the file's rows. All or nothing. */
  async restore(file: BackupFile): Promise<SystemResult> {
    if (!file || file.app !== 'ar-option' || typeof file.tables !== 'object' || file.tables === null) {
      throw new BadRequestException('This is not an AR Option backup file.');
    }
    for (const table of BACKUP_TABLES) {
      if (!Array.isArray(file.tables[table])) {
        throw new BadRequestException(`The backup file has no '${table}' table. Nothing was restored.`);
      }
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [SKU_LOCK_KEY]);
      const current = await this.schemaVersion(client);
      if (Number(file.schema_version) !== current) {
        throw new BadRequestException(
          `The backup was made at database version ${file.schema_version}, and this database is at version ${current}. Nothing was restored.`
        );
      }

      await client.query(`TRUNCATE ${BACKUP_TABLES.join(', ')} RESTART IDENTITY`);

      const counts: Record<string, number> = {};
      for (const table of BACKUP_TABLES) {
        const rows = file.tables[table];
        counts[table] = rows.length;
        if (rows.length === 0) continue;
        // Foreign keys are checked at the end of each statement, so a self-reference
        // (a sub-category and its parent) loads in one insert whatever the row order.
        await client.query(
          `INSERT INTO ${table} SELECT * FROM json_populate_recordset(NULL::${table}, $1::json)`,
          [JSON.stringify(rows)]
        );
      }

      await this.syncIdSequences(client);
      for (const seq of BACKUP_SEQUENCES) {
        const last = Number(file.sequences?.[seq]);
        await this.setSequence(client, seq, Number.isFinite(last) ? last : 0);
      }

      await client.query('COMMIT');
      return { counts };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async reset(dto: ResetDto, adminId: number): Promise<SystemResult> {
    const level = dto?.level;
    if (level !== 'transactions' && level !== 'factory') {
      throw new BadRequestException("Reset level must be 'transactions' or 'factory'.");
    }
    if ((dto.confirm || '').trim() !== RESET_CONFIRM[level]) {
      throw new BadRequestException(`Type ${RESET_CONFIRM[level]} to confirm.`);
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [SKU_LOCK_KEY]);

      const counts: Record<string, number> = {};
      const countRows = async (table: string) => {
        const res = await client.query(`SELECT COUNT(*)::int AS n FROM ${table}`);
        counts[table] = res.rows[0].n;
      };

      // One TRUNCATE for every table, because Postgres refuses to truncate a parent
      // (contacts, products) in a separate statement from its children (sales, stock).
      // No CASCADE: if a new table points at one of these, the reset fails instead of
      // quietly emptying a table nobody listed.
      const tables: string[] = [...TRANSACTION_TABLES];
      if (level === 'factory') tables.push(...CATALOG_TABLES, 'expense_categories');
      for (const table of tables) await countRows(table);
      await client.query(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY`);
      await client.query('ALTER SEQUENCE import_batch_seq RESTART WITH 1');

      if (level === 'factory') {
        await client.query('ALTER SEQUENCE product_sku_seq RESTART WITH 100001');
        await client.query(
          'INSERT INTO expense_categories (name) SELECT unnest($1::text[])',
          [DEFAULT_EXPENSE_CATEGORIES]
        );

        counts.user_locations = (await client.query('DELETE FROM user_locations')).rowCount ?? 0;
        counts.users = (await client.query('DELETE FROM users WHERE id <> $1', [adminId])).rowCount ?? 0;
        counts.accounts = (
          await client.query(
            'DELETE FROM accounts WHERE location_id IN (SELECT id FROM locations WHERE is_system = false)'
          )
        ).rowCount ?? 0;
        counts.locations = (await client.query('DELETE FROM locations WHERE is_system = false')).rowCount ?? 0;
      }

      await this.syncIdSequences(client);
      await client.query('COMMIT');
      return { level, counts };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  private async schemaVersion(db: Pool | PoolClient): Promise<number> {
    const res = await db.query('SELECT COALESCE(MAX(version), 0) AS v FROM schema_migrations');
    return Number(res.rows[0].v);
  }

  /** Points each id sequence at the highest id still in its table, so the next insert never clashes. */
  private async syncIdSequences(client: PoolClient): Promise<void> {
    const res = await client.query(
      `SELECT table_name, pg_get_serial_sequence(quote_ident(table_name), 'id') AS seq
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND column_name = 'id' AND table_name = ANY($1::text[])`,
      [[...BACKUP_TABLES]]
    );
    for (const { table_name, seq } of res.rows) {
      if (!seq) continue;
      const maxRes = await client.query(`SELECT COALESCE(MAX(id), 0) AS m FROM ${table_name}`);
      await this.setSequence(client, seq, Number(maxRes.rows[0].m));
    }
  }

  /** last = 0 means "never used": the next value is the sequence's start. */
  private async setSequence(client: PoolClient, seq: string, last: number): Promise<void> {
    if (last > 0) {
      await client.query('SELECT setval($1::regclass, $2, true)', [seq, last]);
    } else {
      await client.query(`ALTER SEQUENCE ${seq} RESTART`);
    }
  }
}
