import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { DailyCashClosing } from '@ar-option/shared-types';

/** Read-only history. A closing is written when a till session is closed (see TillService). */
@Injectable()
export class CashClosingService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

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

