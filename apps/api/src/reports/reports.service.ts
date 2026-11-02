import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { DashboardKpis, StockByShopGridItem } from '@ar-option/shared-types';

@Injectable()
export class ReportsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Section 5.4: Shop-level reporting: Reports and the dashboard must apply the shop filter in SQL.
   */
  async getDashboardKpis(shopId?: number): Promise<DashboardKpis> {
    // 1. Total active real shops count
    const shopCountRes = await this.pool.query(
      'SELECT COUNT(*) AS total FROM locations WHERE is_system = false AND is_active = true'
    );
    const totalShops = parseInt(shopCountRes.rows[0].total, 10);

    // 2. Stock value (qty * cost_price)
    let stockSql = `
      SELECT COALESCE(SUM(s.qty_available * pv.cost_price), 0) AS total_value
      FROM stock s
      JOIN product_variations pv ON s.product_variation_id = pv.id
      JOIN products p ON pv.product_id = p.id
      JOIN locations l ON s.location_id = l.id
      WHERE s.qty_available > 0
    `;
    const stockParams: any[] = [];
    if (shopId) {
      stockParams.push(shopId);
      stockSql += ` AND s.location_id = $${stockParams.length}`;
    } else {
      // All shops: include real shops + system locations per Rule 1:
      // "System locations never appear in shop pickers and can never sell stock, but their stock value still counts in the Balance Sheet."
      stockSql += ` AND l.is_active = true`;
    }
    const stockRes = await this.pool.query(stockSql, stockParams);
    const stockValue = parseFloat(stockRes.rows[0].total_value);

    // 3. Total sales (credit to SALES_REVENUE)
    let salesSql = `
      SELECT COALESCE(SUM(t.amount), 0) AS total_sales
      FROM account_transactions t
      JOIN accounts a ON t.account_id = a.id
      WHERE a.code = 'SALES_REVENUE' AND t.direction = 'credit'
    `;
    const salesParams: any[] = [];
    if (shopId) {
      salesParams.push(shopId);
      salesSql += ` AND t.location_id = $${salesParams.length}`;
    }
    const salesRes = await this.pool.query(salesSql, salesParams);
    const totalSales = parseFloat(salesRes.rows[0].total_sales);

    // 4. Pending transfers in transit
    let transferSql = `
      SELECT COUNT(*) AS total
      FROM stock_transfers
      WHERE status = 'in_transit'
    `;
    const transferParams: any[] = [];
    if (shopId) {
      transferParams.push(shopId);
      transferSql += ` AND (from_location_id = $${transferParams.length} OR to_location_id = $${transferParams.length})`;
    }
    const transferRes = await this.pool.query(transferSql, transferParams);
    const pendingTransfers = parseInt(transferRes.rows[0].total, 10);

    // 5. Check if ledger is balanced
    const tbRes = await this.pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0) as total_debit,
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0) as total_credit
      FROM account_transactions
    `);
    const debit = parseFloat(tbRes.rows[0].total_debit);
    const credit = parseFloat(tbRes.rows[0].total_credit);
    const isBalanced = Math.abs(debit - credit) < 0.001;

    return {
      total_shops: totalShops,
      total_sales: totalSales,
      stock_value: stockValue,
      pending_transfers: pendingTransfers,
      is_trial_balance_balanced: isBalanced,
    };
  }

  /**
   * Stock by Shop Grid per DESIGN.md:
   * Rows are products/sizes, columns are shops.
   */
  async getStockByShopGrid(): Promise<StockByShopGridItem[]> {
    // 1. Get all active locations
    const locRes = await this.pool.query(
      'SELECT id, name, code, is_system FROM locations WHERE is_active = true ORDER BY is_system ASC, id ASC'
    );
    const locations = locRes.rows;

    // 2. Get all product variations
    const varRes = await this.pool.query(`
      SELECT 
        p.id AS product_id,
        p.name AS product_name,
        p.code AS product_code,
        pv.cost_price,
        pv.selling_price,
        pv.id AS variation_id,
        pv.size,
        pv.sku
      FROM product_variations pv
      JOIN products p ON pv.product_id = p.id
      WHERE p.is_active = true AND pv.is_active = true
      ORDER BY p.name ASC, pv.id ASC
    `);

    // 3. Get all stock counts
    const stockRes = await this.pool.query(`
      SELECT product_variation_id, location_id, qty_available
      FROM stock
    `);
    const stockLookup = new Map<string, number>();
    for (const row of stockRes.rows) {
      stockLookup.set(`${row.product_variation_id}-${row.location_id}`, Number(row.qty_available));
    }

    return varRes.rows.map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      product_code: row.product_code,
      variation_id: row.variation_id,
      size: row.size,
      sku: row.sku,
      cost_price: Number(row.cost_price),
      selling_price: Number(row.selling_price),
      stocks: locations.map((loc) => ({
        location_id: loc.id,
        location_name: loc.name,
        location_code: loc.code,
        is_system: loc.is_system,
        qty: stockLookup.get(`${row.variation_id}-${loc.id}`) || 0,
      })),
    }));
  }
}

