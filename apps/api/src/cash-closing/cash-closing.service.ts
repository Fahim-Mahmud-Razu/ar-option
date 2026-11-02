import { Injectable, BadRequestException, NotFoundException, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import {
  DailyCashClosing,
  CreateCashClosingDto,
  CashDrawerSummary,
} from '@ar-option/shared-types';

@Injectable()
export class CashClosingService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Calculates the current cash drawer summary for a given shop from the double-entry ledger.
   * Rule 1: Every record belongs to a shop.
   * Rule 3: The ledger is the source of truth.
   */
  async getCashDrawerSummary(shopId: number): Promise<CashDrawerSummary> {
    if (!shopId) {
      throw new BadRequestException('Shop ID is required to calculate cash drawer balance.');
    }

    // 1. Fetch shop info
    const shopRes = await this.pool.query(
      'SELECT id, name, code, is_system, is_active FROM locations WHERE id = $1',
      [shopId]
    );
    if (shopRes.rows.length === 0) {
      throw new NotFoundException(`Shop #${shopId} not found.`);
    }
    const shop = shopRes.rows[0];
    if (shop.is_system) {
      throw new BadRequestException('System locations do not have physical cash drawers.');
    }

    // 2. Locate shop's cash account
    const expectedCode = `CASH_${shop.code}`;
    let accRes = await this.pool.query(
      'SELECT id, code, name FROM accounts WHERE code = $1 LIMIT 1',
      [expectedCode]
    );

    if (accRes.rows.length === 0) {
      // Fallback: look for an asset cash account linked to this location
      accRes = await this.pool.query(
        "SELECT id, code, name FROM accounts WHERE location_id = $1 AND type = 'asset' AND (code LIKE 'CASH_%' OR LOWER(name) LIKE '%cash%') LIMIT 1",
        [shopId]
      );
    }

    if (accRes.rows.length === 0) {
      throw new BadRequestException(
        `Shop '${shop.name}' does not have a configured cash account (${expectedCode}). Rule 3 requires explicit account configuration.`
      );
    }

    const cashAccount = accRes.rows[0];

    // 3. Compute total ledger balance (Debits - Credits for asset account)
    const balanceRes = await this.pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END), 0.00) AS balance
       FROM account_transactions
       WHERE account_id = $1`,
      [cashAccount.id]
    );
    const systemExpectedCash = parseFloat(balanceRes.rows[0].balance);

    // 4. Compute today's cash movements (Bangalore/Dhaka timezone current date)
    const todayRes = await this.pool.query(
      `SELECT 
        COALESCE(SUM(CASE WHEN direction = 'debit' AND entry_type = 'sale' THEN amount ELSE 0 END), 0.00) AS cash_sales,
        COALESCE(SUM(CASE WHEN direction = 'credit' AND entry_type = 'expense' THEN amount ELSE 0 END), 0.00) AS cash_expenses,
        COALESCE(SUM(CASE WHEN entry_type IN ('return', 'manual_return') THEN 
          CASE WHEN direction = 'credit' THEN amount ELSE -amount END 
        ELSE 0 END), 0.00) AS cash_returns
       FROM account_transactions
       WHERE account_id = $1 AND created_at >= CURRENT_DATE`,
      [cashAccount.id]
    );

    const cashSales = parseFloat(todayRes.rows[0].cash_sales);
    const cashExpenses = parseFloat(todayRes.rows[0].cash_expenses);
    const cashReturns = parseFloat(todayRes.rows[0].cash_returns);

    // Opening cash is balance at start of today = current balance - (today's cash debits - today's cash credits)
    const todayNetChange = cashSales - cashExpenses - cashReturns;
    const openingCash = systemExpectedCash - todayNetChange;

    return {
      shop_id: shop.id,
      shop_name: shop.name,
      shop_code: shop.code,
      cash_account_code: cashAccount.code,
      opening_cash: Math.max(0, openingCash),
      cash_sales: cashSales,
      cash_expenses: cashExpenses,
      cash_returns: cashReturns,
      system_expected_cash: systemExpectedCash,
    };
  }

  /**
   * Records a physical cash drawer count and reconciles against the system ledger.
   * Mandatory explanation required if physical != system expected.
   */
  async createCashClosing(
    dto: CreateCashClosingDto,
    userId: number
  ): Promise<DailyCashClosing> {
    if (!dto.location_id) {
      throw new BadRequestException('Shop ID (location_id) is required.');
    }
    if (dto.physical_counted_cash === undefined || dto.physical_counted_cash === null || dto.physical_counted_cash < 0) {
      throw new BadRequestException('Physical counted cash cannot be negative.');
    }

    const summary = await this.getCashDrawerSummary(dto.location_id);
    const discrepancy = Number(dto.physical_counted_cash) - Number(summary.system_expected_cash);

    // If there is a discrepancy (> ৳0.01), require an explanation
    if (Math.abs(discrepancy) > 0.01) {
      if (!dto.discrepancy_reason || !dto.discrepancy_reason.trim()) {
        throw new BadRequestException(
          `Discrepancy of ৳${discrepancy.toFixed(2)} detected between physical drawer (৳${Number(dto.physical_counted_cash).toFixed(2)}) and system ledger (৳${summary.system_expected_cash.toFixed(2)}). An explanation is mandatory before saving.`
        );
      }
    }

    const insertRes = await this.pool.query(
      `INSERT INTO daily_cash_closings (
        location_id,
        user_id,
        closing_date,
        opening_cash,
        cash_sales,
        cash_expenses,
        cash_returns,
        system_expected_cash,
        physical_counted_cash,
        discrepancy_amount,
        discrepancy_reason,
        notes
      ) VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        dto.location_id,
        userId,
        summary.opening_cash,
        summary.cash_sales,
        summary.cash_expenses,
        summary.cash_returns,
        summary.system_expected_cash,
        dto.physical_counted_cash,
        discrepancy,
        dto.discrepancy_reason?.trim() || null,
        dto.notes?.trim() || null,
      ]
    );

    const row = insertRes.rows[0];

    // Fetch user and shop names for response
    const metaRes = await this.pool.query(
      `SELECT u.name AS user_name, l.name AS location_name, l.code AS location_code
       FROM users u, locations l
       WHERE u.id = $1 AND l.id = $2`,
      [userId, dto.location_id]
    );

    return {
      id: row.id,
      location_id: row.location_id,
      location_name: metaRes.rows[0]?.location_name,
      location_code: metaRes.rows[0]?.location_code,
      user_id: row.user_id,
      user_name: metaRes.rows[0]?.user_name,
      closing_date: row.closing_date,
      opening_cash: parseFloat(row.opening_cash),
      cash_sales: parseFloat(row.cash_sales),
      cash_expenses: parseFloat(row.cash_expenses),
      cash_returns: parseFloat(row.cash_returns),
      system_expected_cash: parseFloat(row.system_expected_cash),
      physical_counted_cash: parseFloat(row.physical_counted_cash),
      discrepancy_amount: parseFloat(row.discrepancy_amount),
      discrepancy_reason: row.discrepancy_reason,
      notes: row.notes,
      created_at: row.created_at,
    };
  }

  /**
   * Lists past daily cash closings with shop and cashier details.
   * Section 5.4: Supports single shop or All shops.
   */
  async listDailyCashClosings(shopId?: number): Promise<DailyCashClosing[]> {
    let sql = `
      SELECT 
        c.*,
        l.name AS location_name,
        l.code AS location_code,
        u.name AS user_name
      FROM daily_cash_closings c
      JOIN locations l ON c.location_id = l.id
      JOIN users u ON c.user_id = u.id
    `;
    const params: any[] = [];
    if (shopId) {
      params.push(shopId);
      sql += ` WHERE c.location_id = $${params.length}`;
    }
    sql += ` ORDER BY c.created_at DESC LIMIT 100`;

    const res = await this.pool.query(sql, params);
    return res.rows.map((row) => ({
      id: row.id,
      location_id: row.location_id,
      location_name: row.location_name,
      location_code: row.location_code,
      user_id: row.user_id,
      user_name: row.user_name,
      closing_date: row.closing_date,
      opening_cash: parseFloat(row.opening_cash),
      cash_sales: parseFloat(row.cash_sales),
      cash_expenses: parseFloat(row.cash_expenses),
      cash_returns: parseFloat(row.cash_returns),
      system_expected_cash: parseFloat(row.system_expected_cash),
      physical_counted_cash: parseFloat(row.physical_counted_cash),
      discrepancy_amount: parseFloat(row.discrepancy_amount),
      discrepancy_reason: row.discrepancy_reason,
      notes: row.notes,
      created_at: row.created_at,
    }));
  }
}

