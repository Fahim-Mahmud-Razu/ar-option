import { Injectable, Inject, BadRequestException, ConflictException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { AppSettings } from '@ar-option/shared-types';

@Injectable()
export class SettingsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getSettings(db: Pool | PoolClient = this.pool): Promise<AppSettings> {
    const res = await db.query('SELECT key, value FROM settings');
    const map = new Map<string, string>(res.rows.map((r) => [r.key, r.value]));
    return {
      use_sizes: map.get('use_sizes') === 'true',
      manual_return_approval_limit: Number(map.get('manual_return_approval_limit') ?? 0),
    };
  }

  async useSizes(db: Pool | PoolClient = this.pool): Promise<boolean> {
    const res = await db.query("SELECT value FROM settings WHERE key = 'use_sizes'");
    return res.rows[0]?.value === 'true';
  }

  async updateSettings(dto: Partial<AppSettings>): Promise<AppSettings> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      if (dto.use_sizes !== undefined) {
        if (typeof dto.use_sizes !== 'boolean') {
          throw new BadRequestException('use_sizes must be true or false.');
        }
        if (!dto.use_sizes) {
          // Hiding sizes while stock is split by size would hide which size is where.
          const multi = await client.query(
            `SELECT COUNT(*)::int AS n FROM (
               SELECT pv.product_id FROM product_variations pv
               JOIN products p ON p.id = pv.product_id AND p.is_active = true
               WHERE pv.is_active = true
               GROUP BY pv.product_id HAVING COUNT(*) > 1
             ) m`
          );
          const n = multi.rows[0].n;
          if (n > 0) {
            throw new ConflictException(
              `${n} product(s) have more than one size. Sizes can be turned off only when every product has one size.`
            );
          }
        }
        await this.write(client, 'use_sizes', String(dto.use_sizes));
      }
      if (dto.manual_return_approval_limit !== undefined) {
        const limit = Number(dto.manual_return_approval_limit);
        if (!Number.isFinite(limit) || limit < 0) {
          throw new BadRequestException('The manual return limit must be zero or more.');
        }
        await this.write(client, 'manual_return_approval_limit', (Math.round(limit * 100) / 100).toFixed(2));
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getSettings();
  }

  private async write(client: PoolClient, key: string, value: string): Promise<void> {
    await client.query(
      `INSERT INTO settings (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );
  }
}
