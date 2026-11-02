import { Injectable, BadRequestException, ConflictException, Inject } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { PostEntryDto, TrialBalanceItem, Account } from '@ar-option/shared-types';
import { randomUUID } from 'crypto';

@Injectable()
export class LedgerService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Rule 3: One posting function writes every ledger line.
   * Strictly verifies debits == credits in transaction.
   * Rule 6: Idempotency support via client_ref.
   */
  async postEntry(
    entry: PostEntryDto,
    userId?: number,
    externalClient?: PoolClient
  ): Promise<{ entry_id: string; lines_posted: number }> {
    const client = externalClient || (await this.pool.connect());
    const isOwner = !externalClient;

    try {
      if (isOwner) {
        await client.query('BEGIN');
      }

      // Rule 6: Idempotency check via client_ref
      if (entry.client_ref) {
        const existing = await client.query(
          'SELECT entry_id FROM account_transactions WHERE client_ref = $1 LIMIT 1',
          [entry.client_ref]
        );
        if (existing.rows.length > 0) {
          if (isOwner) await client.query('COMMIT');
          return {
            entry_id: existing.rows[0].entry_id,
            lines_posted: 0,
          };
        }
      }

      // Check lines exist
      if (!entry.lines || entry.lines.length < 2) {
        throw new BadRequestException('A ledger entry must contain at least 2 balanced lines.');
      }

      // Calculate totals
      let totalDebit = 0;
      let totalCredit = 0;

      for (const line of entry.lines) {
        if (!line.amount || line.amount <= 0) {
          throw new BadRequestException(`Line amount must be greater than zero. Got: ${line.amount}`);
        }
        if (line.direction === 'debit') {
          totalDebit += Number(line.amount);
        } else if (line.direction === 'credit') {
          totalCredit += Number(line.amount);
        } else {
          throw new BadRequestException(`Invalid direction: ${line.direction}. Must be debit or credit.`);
        }
      }

      // Rule 3: Debits must equal credits
      const diff = Math.abs(totalDebit - totalCredit);
      if (diff > 0.001) {
        throw new BadRequestException(
          `Unbalanced ledger entry: Total Debits (${totalDebit.toFixed(2)}) != Total Credits (${totalCredit.toFixed(2)})`
        );
      }

      // Collect all account codes
      const codes = Array.from(new Set(entry.lines.map((l) => l.account_code)));
      const accountsRes = await client.query(
        'SELECT id, code, location_id FROM accounts WHERE code = ANY($1)',
        [codes]
      );
      const accountMap = new Map<string, { id: number; location_id: number | null }>();
      for (const acc of accountsRes.rows) {
        accountMap.set(acc.code, { id: acc.id, location_id: acc.location_id });
      }

      // Validate shop / location
      const locationId = entry.shop_id || null;

      // Ensure all accounts exist and validate shop-linking (Rule 1 & Rule 3)
      for (const line of entry.lines) {
        const account = accountMap.get(line.account_code);
        if (!account) {
          throw new BadRequestException(
            `Account code '${line.account_code}' not found. Hardcoded fallbacks are prohibited by Rule 3.`
          );
        }
        if (
          account.location_id !== null &&
          locationId !== null &&
          account.location_id !== locationId
        ) {
          throw new BadRequestException(
            `Account '${line.account_code}' belongs to shop ID ${account.location_id}, which does not match entry shop ID ${locationId}. Cross-shop account entries are prohibited by Rule 1.`
          );
        }
      }

      const entryId = randomUUID();

      // Insert all lines
      for (const line of entry.lines) {
        const account = accountMap.get(line.account_code)!;
        // If line has specific shop, use it; else use entry shop
        const lineLocationId = account.location_id || locationId;

        await client.query(
          `INSERT INTO account_transactions (
            entry_id,
            account_id,
            location_id,
            direction,
            amount,
            entry_type,
            source_type,
            source_id,
            client_ref,
            notes,
            created_by
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            entryId,
            account.id,
            lineLocationId,
            line.direction,
            line.amount,
            entry.entry_type,
            entry.source_type || null,
            entry.source_id || null,
            entry.client_ref || null,
            line.notes || entry.notes || null,
            userId || null,
          ]
        );
      }

      if (isOwner) {
        await client.query('COMMIT');
      }

      return {
        entry_id: entryId,
        lines_posted: entry.lines.length,
      };
    } catch (err) {
      if (isOwner) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      if (isOwner) {
        client.release();
      }
    }
  }

  /**
   * Retrieves Trial Balance and verifies balanced equation
   */
  async getTrialBalance(shopId?: number): Promise<{
    items: TrialBalanceItem[];
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
  }> {
    let sql = `
      SELECT 
        a.code as account_code,
        a.name as account_name,
        a.type as account_type,
        COALESCE(SUM(CASE WHEN t.direction = 'debit' THEN t.amount ELSE 0 END), 0) as total_debit,
        COALESCE(SUM(CASE WHEN t.direction = 'credit' THEN t.amount ELSE 0 END), 0) as total_credit
      FROM accounts a
      LEFT JOIN account_transactions t ON a.id = t.account_id
    `;
    const params: any[] = [];

    if (shopId) {
      params.push(shopId);
      sql += ` AND t.location_id = $${params.length}`;
    }

    sql += ` GROUP BY a.id, a.code, a.name, a.type ORDER BY a.type, a.code`;

    const result = await this.pool.query(sql, params);

    let totalDebit = 0;
    let totalCredit = 0;

    const items: TrialBalanceItem[] = result.rows.map((row) => {
      const debit = parseFloat(row.total_debit);
      const credit = parseFloat(row.total_credit);
      totalDebit += debit;
      totalCredit += credit;

      // Net balance depends on normal account balance (Asset/Expense = Debit, Liability/Equity/Revenue = Credit)
      let net = 0;
      if (row.account_type === 'asset' || row.account_type === 'expense') {
        net = debit - credit;
      } else {
        net = credit - debit;
      }

      return {
        account_code: row.account_code,
        account_name: row.account_name,
        account_type: row.account_type,
        total_debit: debit,
        total_credit: credit,
        net_balance: net,
      };
    });

    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.001;

    return {
      items,
      totalDebit,
      totalCredit,
      isBalanced,
    };
  }

  /**
   * Lists active accounts, optionally filtered by shop (Rule 1 & Rule 3: shop-linked accounts)
   */
  async getAccounts(shopId?: number): Promise<Account[]> {
    let sql = 'SELECT id, code, name, type, location_id, is_active FROM accounts WHERE is_active = true';
    const params: any[] = [];
    if (shopId) {
      sql += ' AND (location_id IS NULL OR location_id = $1)';
      params.push(shopId);
    }
    sql += ' ORDER BY type, name';
    const result = await this.pool.query(sql, params);
    return result.rows;
  }
}
