import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.test explicitly
const envTestPath = path.resolve(__dirname, '../../../.env.test');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
}

import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { StockMovementService } from '../src/stock/stock-movement.service';
import { AuthService } from '../src/auth/auth.service';
import { LedgerService } from '../src/ledger/ledger.service';

describe('Step 6: Go-Live & Daily Cash Drawer Reconciliation (e2e)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let stockMovementService: StockMovementService;
  let ledgerService: LedgerService;

  let pilotShopId: number;
  let otherShopId: number;
  let testVariationId: number;
  let cashAccountId: number;
  let adminToken: string;
  let cashierToken: string;
  let outsiderToken: string;

  beforeAll(async () => {
    // Rule 10: Protection check against running tests on live production/Neon
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const url = new URL(dbUrl);
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        throw new Error(
          `ABORT: Automated tests must run only on local Docker database. Detected host: ${url.hostname}`
        );
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    pool = app.get<Pool>(PG_POOL);
    stockMovementService = app.get<StockMovementService>(StockMovementService);
    ledgerService = app.get<LedgerService>(LedgerService);

    // Clean test tables in reverse foreign key order
    await pool.query('DELETE FROM daily_cash_closings');
    await pool.query('DELETE FROM courier_parcel_items');
    await pool.query('DELETE FROM courier_parcels');
    await pool.query('DELETE FROM courier_settlements');
    await pool.query('DELETE FROM return_items');
    await pool.query('DELETE FROM returns');
    await pool.query('DELETE FROM sale_items');
    await pool.query('DELETE FROM sales');
    await pool.query('DELETE FROM expenses');
    await pool.query('DELETE FROM stock_transfer_items');
    await pool.query('DELETE FROM stock_transfers');
    await pool.query('DELETE FROM stock_movements');
    await pool.query('DELETE FROM stock');
    await pool.query('DELETE FROM product_variations');
    await pool.query('DELETE FROM products');

    // 1. Setup Pilot Shop and Other Shop
    const shopRes = await pool.query(`
      INSERT INTO locations (name, code, is_system, is_active)
      VALUES 
        ('Pilot Shop - Gulshan', 'PIL-01', false, true),
        ('Other Shop - Dhanmondi', 'OTH-01', false, true)
      ON CONFLICT (code) DO UPDATE SET is_active = true
      RETURNING id, code
    `);
    pilotShopId = shopRes.rows[0].id;
    otherShopId = shopRes.rows[1].id;

    // 2. Setup Admin, Cashier & Outsider Users
    await pool.query(`
      INSERT INTO users (name, email, password_hash, role, is_active)
      VALUES ('Admin User', 'admin@aroption.com', 'dummy_hash', 'admin', true)
      ON CONFLICT (email) DO UPDATE SET is_active = true
    `);

    const cashierRes = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, is_active)
      VALUES ('Pilot Cashier', 'cashier.pilot@aroption.com', 'dummy_hash', 'cashier', true)
      ON CONFLICT (email) DO UPDATE SET is_active = true
      RETURNING id
    `);
    const cashierId = cashierRes.rows[0].id;

    const outsiderRes = await pool.query(`
      INSERT INTO users (name, email, password_hash, role, is_active)
      VALUES ('Other Cashier', 'cashier.other@aroption.com', 'dummy_hash', 'cashier', true)
      ON CONFLICT (email) DO UPDATE SET is_active = true
      RETURNING id
    `);
    const outsiderId = outsiderRes.rows[0].id;

    // Map cashier to pilot shop, outsider to other shop
    await pool.query('INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [cashierId, pilotShopId]);
    await pool.query('INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [outsiderId, otherShopId]);

    // Ensure permissions
    await pool.query(`
      INSERT INTO role_permissions (role, permission)
      VALUES 
        ('cashier', 'cash.reconcile'),
        ('manager', 'cash.reconcile')
      ON CONFLICT DO NOTHING
    `);

    // Setup Cash Account for Pilot Shop
    const cashAccRes = await pool.query(`
      INSERT INTO accounts (code, name, type, location_id)
      VALUES ('CASH_PIL-01', 'Cash - Pilot Shop', 'asset', $1)
      ON CONFLICT (code) DO UPDATE SET location_id = $1
      RETURNING id
    `, [pilotShopId]);
    cashAccountId = cashAccRes.rows[0].id;

    // Setup Expense Account
    await pool.query(`
      INSERT INTO accounts (code, name, type)
      VALUES ('EXP_PETTY', 'Petty Cash Expenses', 'expense')
      ON CONFLICT (code) DO NOTHING
    `);

    // Setup Product for Pilot Shop
    const prodRes = await pool.query(`
      INSERT INTO products (name, code, cost_price, selling_price, is_active)
      VALUES ('Pilot Oxford Shirt', 'SHIRT-PIL-01', 500.00, 1000.00, true)
      RETURNING id
    `);
    const varRes = await pool.query(`
      INSERT INTO product_variations (product_id, size, sku)
      VALUES ($1, 'L', 'SHIRT-PIL-01-L')
      RETURNING id
    `, [prodRes.rows[0].id]);
    testVariationId = varRes.rows[0].id;

    const adminRes = await pool.query(
      "SELECT id FROM users WHERE email = 'admin@aroption.com'"
    );
    const adminId = adminRes.rows[0].id;

    // Add initial stock via stock movement service (Rule 4)
    await stockMovementService.recordMovement({
      product_variation_id: testVariationId,
      to_location_id: pilotShopId,
      quantity: 50,
      movement_type: 'opening_stock',
      notes: 'Pilot initial inventory',
      source_type: 'opening_stock',
      user_id: adminId,
    });

    // Generate tokens
    const authService = app.get<AuthService>(AuthService);
    adminToken = authService.generateToken({ id: adminId, email: 'admin@aroption.com', role: 'admin' });
    cashierToken = authService.generateToken({ id: cashierId, email: 'cashier.pilot@aroption.com', role: 'cashier' });
    outsiderToken = authService.generateToken({ id: outsiderId, email: 'cashier.other@aroption.com', role: 'cashier' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('Step 6.1: Initial Drawer Summary shows 0 expected when no transactions exist', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cash-closing/drawer-summary?shop_id=${pilotShopId}`,
      headers: {
        authorization: `Bearer ${cashierToken}`,
        'x-shop-id': pilotShopId.toString(),
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.shop_id).toBe(pilotShopId);
    expect(body.system_expected_cash).toBe(0);
    expect(body.cash_sales).toBe(0);
    expect(body.cash_expenses).toBe(0);
  });

  it('Step 6.2: Transactions accurately reflect in Drawer Summary via the ledger (Rule 3)', async () => {
    // 1. Post a cash sale of ৳2,000
    await ledgerService.postEntry({
      shop_id: pilotShopId,
      entry_type: 'sale',
      notes: 'Counter cash sale',
      lines: [
        { account_code: 'CASH_PIL-01', amount: 2000, direction: 'debit' },
        { account_code: 'SALES_REVENUE', amount: 2000, direction: 'credit' },
      ],
    });

    // 2. Post a cash petty expense of ৳300
    await ledgerService.postEntry({
      shop_id: pilotShopId,
      entry_type: 'expense',
      notes: 'Shop cleaning supplies',
      lines: [
        { account_code: 'EXP_PETTY', amount: 300, direction: 'debit' },
        { account_code: 'CASH_PIL-01', amount: 300, direction: 'credit' },
      ],
    });

    // 3. Post a cash refund return of ৳200
    await ledgerService.postEntry({
      shop_id: pilotShopId,
      entry_type: 'return',
      notes: 'Customer return cash refund',
      lines: [
        { account_code: 'SALES_RETURNS', amount: 200, direction: 'debit' },
        { account_code: 'CASH_PIL-01', amount: 200, direction: 'credit' },
      ],
    });

    // Expected cash: 0 + 2000 - 300 - 200 = 1,500
    const res = await app.inject({
      method: 'GET',
      url: `/cash-closing/drawer-summary?shop_id=${pilotShopId}`,
      headers: {
        authorization: `Bearer ${cashierToken}`,
        'x-shop-id': pilotShopId.toString(),
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.system_expected_cash).toBe(1500);
    expect(body.cash_sales).toBe(2000);
    expect(body.cash_expenses).toBe(300);
    expect(body.cash_returns).toBe(200);
  });

  it('Step 6.3: Saving cash closing with discrepancy requires explanation', async () => {
    // Physical cash count is ৳1,400 (discrepancy of -৳100 shortage)
    const res = await app.inject({
      method: 'POST',
      url: '/cash-closing',
      headers: {
        authorization: `Bearer ${cashierToken}`,
        'x-shop-id': pilotShopId.toString(),
      },
      payload: {
        location_id: pilotShopId,
        physical_counted_cash: 1400,
        // missing discrepancy_reason
      },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.payload);
    expect(body.message).toContain('An explanation is mandatory before saving');
  });

  it('Step 6.4: Successfully records daily cash closing with explanation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/cash-closing',
      headers: {
        authorization: `Bearer ${cashierToken}`,
        'x-shop-id': pilotShopId.toString(),
      },
      payload: {
        location_id: pilotShopId,
        physical_counted_cash: 1400,
        discrepancy_reason: 'Shortage: Cashier coin change shortage',
        notes: 'End of evening shift drawer reconciliation',
      },
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.payload);
    expect(body.location_id).toBe(pilotShopId);
    expect(body.system_expected_cash).toBe(1500);
    expect(body.physical_counted_cash).toBe(1400);
    expect(body.discrepancy_amount).toBe(-100);
    expect(body.discrepancy_reason).toBe('Shortage: Cashier coin change shortage');
  });

  it('Step 6.5: Lists past daily cash closings with shop filter (Section 5.4)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/cash-closing?shop_id=${pilotShopId}`,
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].location_name).toContain('Pilot Shop');
    expect(body[0].discrepancy_amount).toBe(-100);
  });

  it('Step 6.6: Rule 1 & Rule 5: User from another shop is rejected with 403', async () => {
    // Outsider cashier is assigned only to otherShopId, trying to close pilotShopId
    const res = await app.inject({
      method: 'POST',
      url: '/cash-closing',
      headers: {
        authorization: `Bearer ${outsiderToken}`,
        'x-shop-id': pilotShopId.toString(),
      },
      payload: {
        location_id: pilotShopId,
        physical_counted_cash: 1500,
      },
    });

    expect(res.statusCode).toBe(403);
  });

  it('Step 6.7: Definition of Done: Proves Trial Balance stays balanced (Rule 3)', async () => {
    const tbRes = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END), 0) as total_debit,
        COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0) as total_credit
      FROM account_transactions
    `);
    const totalDebit = parseFloat(tbRes.rows[0].total_debit);
    const totalCredit = parseFloat(tbRes.rows[0].total_credit);

    expect(Math.abs(totalDebit - totalCredit)).toBeLessThan(0.001);
  });

  it('Step 6.8: Definition of Done: Stock movement history matches stock quantity (Rule 4)', async () => {
    const invariant = await stockMovementService.verifyMovementHistoryMatchesStock(testVariationId, pilotShopId);
    expect(invariant.matches).toBe(true);
    expect(invariant.stockQty).toBe(50);
    expect(invariant.calculatedQty).toBe(50);
  });
});
