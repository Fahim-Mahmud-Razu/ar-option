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
    await pool.query('DELETE FROM till_movements');
    await pool.query('DELETE FROM till_sessions');
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
    await pool.query('DELETE FROM categories');
    await pool.query('DELETE FROM brands');

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
        ('manager', 'cash.reconcile'),
        ('cashier', 'till.view'), ('cashier', 'till.open'), ('cashier', 'till.cash_in'),
        ('cashier', 'till.cash_out'), ('cashier', 'till.close')
      ON CONFLICT DO NOTHING
    `);

    // Setup Cash Account for Pilot Shop
    const cashAccRes = await pool.query(`
      INSERT INTO accounts (code, name, type, location_id, payment_method)
      VALUES ('CASH_PIL-01', 'Cash - Pilot Shop', 'asset', $1, 'cash')
      ON CONFLICT (code) DO UPDATE SET location_id = $1, payment_method = 'cash'
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
      INSERT INTO product_variations (product_id, size, sku, cost_price, selling_price)
      VALUES ($1, 'L', 'SHIRT-PIL-01-L', 500.00, 1000.00)
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

  const as = (token: string, extra: Record<string, string> = {}) => ({
    authorization: `Bearer ${token}`,
    'x-shop-id': pilotShopId.toString(),
    ...extra,
  });
  const call = async (method: 'GET' | 'POST', url: string, token: string, payload?: any) => {
    const res = await app.inject({ method, url, headers: as(token), ...(payload ? { payload } : {}) });
    return { status: res.statusCode, body: res.payload ? JSON.parse(res.payload) : null };
  };
  const cashBalance = async () => {
    const r = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END), 0) AS b
       FROM account_transactions WHERE account_id = $1`,
      [cashAccountId]
    );
    return parseFloat(r.rows[0].b);
  };
  const accountNet = async (code: string) => {
    const r = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN t.direction = 'debit' THEN t.amount ELSE -t.amount END), 0) AS b
       FROM account_transactions t JOIN accounts a ON a.id = t.account_id WHERE a.code = $1`,
      [code]
    );
    return parseFloat(r.rows[0].b);
  };
  let categoryId: number;
  let firstSessionId: number;

  it('Step 6.1: Opening the till for the first time needs till.setup and posts the starting cash', async () => {
    const equityBefore = await accountNet('OWNER_EQUITY');
    const status0 = await call('GET', '/till/status', cashierToken);
    expect(status0.status).toBe(200);
    expect(status0.body.session).toBeNull();
    expect(status0.body.is_first_open).toBe(true);
    expect(status0.body.ledger_cash).toBe(0);

    const denied = await call('POST', '/till/open', cashierToken, { opening_float: 1000, client_ref: 'open-1' });
    expect(denied.status).toBe(403);
    expect(denied.body.message).toContain('till.setup');

    const opened = await call('POST', '/till/open', adminToken, { opening_float: 1000, client_ref: 'open-1', note: 'Morning' });
    expect(opened.status).toBe(201);
    expect(opened.body.session.status).toBe('open');
    expect(opened.body.session.opening_float).toBe(1000);
    expect(opened.body.ledger_cash).toBe(1000);
    expect(opened.body.summary.current_cash).toBe(1000);
    expect(opened.body.is_first_open).toBe(false);
    firstSessionId = opened.body.session.id;

    // Starting cash is balanced against owner equity (Rule 3).
    expect((await accountNet('OWNER_EQUITY')) - equityBefore).toBe(-1000);

    // Same client_ref again: same session, nothing posted twice (Rule 6).
    const retry = await call('POST', '/till/open', adminToken, { opening_float: 1000, client_ref: 'open-1' });
    expect(retry.status).toBe(201);
    expect(retry.body.session.id).toBe(firstSessionId);
    expect(await cashBalance()).toBe(1000);

    const second = await call('POST', '/till/open', adminToken, { opening_float: 1000, client_ref: 'open-2' });
    expect(second.status).toBe(409);
  });

  it('Step 6.2: Sales, petty cash and refunds show in the till summary from the ledger (Rule 3)', async () => {
    await ledgerService.postEntry({
      shop_id: pilotShopId, entry_type: 'sale', notes: 'Counter cash sale',
      lines: [
        { account_code: 'CASH_PIL-01', amount: 2000, direction: 'debit' },
        { account_code: 'SALES_REVENUE', amount: 2000, direction: 'credit' },
      ],
    });
    await ledgerService.postEntry({
      shop_id: pilotShopId, entry_type: 'expense', notes: 'Shop cleaning supplies',
      lines: [
        { account_code: 'EXP_PETTY', amount: 300, direction: 'debit' },
        { account_code: 'CASH_PIL-01', amount: 300, direction: 'credit' },
      ],
    });
    await ledgerService.postEntry({
      shop_id: pilotShopId, entry_type: 'return', notes: 'Customer return cash refund',
      lines: [
        { account_code: 'SALES_RETURNS', amount: 200, direction: 'debit' },
        { account_code: 'CASH_PIL-01', amount: 200, direction: 'credit' },
      ],
    });

    const status = await call('GET', '/till/status', cashierToken);
    const s = status.body.summary;
    expect(s.current_cash).toBe(2500);
    expect(s.opening_float).toBe(1000);
    expect(s.cash_sales).toBe(2000);
    expect(s.petty_cash).toBe(300);
    expect(s.refunds).toBe(200);
    expect(s.pay_ins).toBe(0);
    expect(s.other_cash).toBe(0);
  });

  it('Step 6.3: Cash in, cash out and owner pull move the ledger once each', async () => {
    const cat = await pool.query(
      "INSERT INTO expense_categories (name) VALUES ('Till Test Tea') ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id"
    );
    categoryId = cat.rows[0].id;

    const payIn = await call('POST', '/till/movements', cashierToken, { kind: 'pay_in', amount: 500, note: 'Change from owner', client_ref: 'mv-1' });
    expect(payIn.status).toBe(201);
    expect(payIn.body.summary.pay_ins).toBe(500);
    expect(payIn.body.summary.current_cash).toBe(3000);
    const payInAgain = await call('POST', '/till/movements', cashierToken, { kind: 'pay_in', amount: 500, client_ref: 'mv-1' });
    expect(payInAgain.status).toBe(201);
    expect(await cashBalance()).toBe(3000);
    expect(payInAgain.body.movements).toHaveLength(1);

    const noCategory = await call('POST', '/till/movements', cashierToken, { kind: 'pay_out', amount: 100, client_ref: 'mv-2' });
    expect(noCategory.status).toBe(400);

    const payOut = await call('POST', '/till/movements', cashierToken, { kind: 'pay_out', amount: 100, category_id: categoryId, note: 'Tea', client_ref: 'mv-3' });
    expect(payOut.status).toBe(201);
    expect(payOut.body.summary.petty_cash).toBe(400);
    expect(payOut.body.summary.current_cash).toBe(2900);
    const expenseRows = await pool.query('SELECT amount FROM expenses WHERE ref_no = $1', ['mv-3']);
    expect(expenseRows.rows).toHaveLength(1);

    const tooMuch = await call('POST', '/till/movements', cashierToken, { kind: 'pay_out', amount: 99999, category_id: categoryId, client_ref: 'mv-4' });
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.message).toContain('Not enough cash');

    const pull = await call('POST', '/till/movements', cashierToken, { kind: 'owner_pull', amount: 400, note: 'Bank deposit', client_ref: 'mv-5' });
    expect(pull.status).toBe(201);
    expect(pull.body.summary.current_cash).toBe(2500);
    expect(pull.body.summary.other_cash).toBe(-400);

    // The lines always add up to the drawer figure.
    const t = pull.body.summary;
    const sum = t.opening_float + t.cash_sales + t.pay_ins - t.petty_cash - t.refunds + t.other_cash;
    expect(sum).toBe(t.current_cash);
    expect(await accountNet('OWNER_DRAWINGS')).toBe(400);
  });

  it('Step 6.4: Closing with a difference needs a reason, posts it, and hands cash to the owner', async () => {
    const noReason = await call('POST', '/till/close', cashierToken, { counted_cash: 2400, client_ref: 'close-1' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.message).toContain('A reason is required');

    const tooMuch = await call('POST', '/till/close', cashierToken, {
      counted_cash: 2400, difference_reason: 'Coins', handover_amount: 2500, client_ref: 'close-1',
    });
    expect(tooMuch.status).toBe(400);

    const closed = await call('POST', '/till/close', cashierToken, {
      counted_cash: 2400, difference_reason: 'Shortage: coin change', handover_amount: 1000, note: 'Evening', client_ref: 'close-1',
    });
    expect(closed.status).toBe(201);
    expect(closed.body.session).toBeNull();
    expect(closed.body.ledger_cash).toBe(1400);

    const row = await pool.query('SELECT * FROM till_sessions WHERE id = $1', [firstSessionId]);
    expect(row.rows[0].status).toBe('closed');
    expect(parseFloat(row.rows[0].expected_cash)).toBe(2500);
    expect(parseFloat(row.rows[0].counted_cash)).toBe(2400);
    expect(parseFloat(row.rows[0].difference)).toBe(-100);
    expect(parseFloat(row.rows[0].handover_amount)).toBe(1000);
    expect(parseFloat(row.rows[0].retained_amount)).toBe(1400);
    expect(await accountNet('TILL_OVER_SHORT')).toBe(100);
    expect(await accountNet('OWNER_DRAWINGS')).toBe(1400);

    const again = await call('POST', '/till/close', cashierToken, {
      counted_cash: 2400, difference_reason: 'Shortage: coin change', handover_amount: 1000, client_ref: 'close-1',
    });
    expect(again.status).toBe(201);
    expect(await cashBalance()).toBe(1400);

    const nothingOpen = await call('POST', '/till/close', cashierToken, { counted_cash: 1400, client_ref: 'close-2' });
    expect(nothingOpen.status).toBe(409);
    const noTill = await call('POST', '/till/movements', cashierToken, { kind: 'pay_in', amount: 10, client_ref: 'mv-6' });
    expect(noTill.status).toBe(409);
  });

  it('Step 6.5: Closing is recorded in the daily closings list (Section 5.4)', async () => {
    const res = await app.inject({
      method: 'GET', url: `/cash-closing?shop_id=${pilotShopId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.length).toBeGreaterThanOrEqual(1);
    expect(body[0].location_name).toContain('Pilot Shop');
    expect(body[0].discrepancy_amount).toBe(-100);
    expect(body[0].system_expected_cash).toBe(2500);
    expect(body[0].cash_sales).toBe(2000);
  });

  it('Step 6.6: A later open pre-fills the books; a different float needs a reason and posts over/short', async () => {
    const status = await call('GET', '/till/status', cashierToken);
    expect(status.body.is_first_open).toBe(false);
    expect(status.body.ledger_cash).toBe(1400);

    const noReason = await call('POST', '/till/open', cashierToken, { opening_float: 1500, client_ref: 'open-3' });
    expect(noReason.status).toBe(400);
    expect(noReason.body.message).toContain('A reason is required');

    const opened = await call('POST', '/till/open', cashierToken, { opening_float: 1500, reason: 'Found 100 in the safe', client_ref: 'open-3' });
    expect(opened.status).toBe(201);
    expect(opened.body.session.open_adjustment).toBe(100);
    expect(await cashBalance()).toBe(1500);
    expect(await accountNet('TILL_OVER_SHORT')).toBe(0);

    // The open adjustment is not counted again as cash movement in this session.
    expect(opened.body.summary.other_cash).toBe(0);
    expect(opened.body.summary.current_cash).toBe(1500);

    const exact = await call('POST', '/till/close', cashierToken, { counted_cash: 1500, client_ref: 'close-3' });
    expect(exact.status).toBe(201);
    expect(await cashBalance()).toBe(1500);

    const reopen = await call('POST', '/till/open', cashierToken, { opening_float: 1500, client_ref: 'open-4' });
    expect(reopen.status).toBe(201);
    expect(reopen.body.session.open_adjustment).toBe(0);
  });

  it('Step 6.7: Overview lists the shop for the dashboard and keeps shops apart (Rule 1 & Rule 5)', async () => {
    const one = await call('GET', '/till/overview', cashierToken);
    expect(one.status).toBe(200);
    expect(one.body.shops).toHaveLength(1);
    expect(one.body.shops[0].is_open).toBe(true);
    expect(one.body.shops[0].cash_in_hand).toBe(1500);
    expect(one.body.total_cash).toBe(1500);

    const outsider = await call('GET', '/till/status', outsiderToken);
    expect(outsider.status).toBe(403);
    const outsiderOpen = await call('POST', '/till/open', outsiderToken, { opening_float: 0, client_ref: 'open-x' });
    expect(outsiderOpen.status).toBe(403);

    const anon = await app.inject({ method: 'GET', url: '/till/status', headers: { 'x-shop-id': pilotShopId.toString() } });
    expect(anon.statusCode).toBe(401);

    const noShop = await app.inject({ method: 'GET', url: '/till/status', headers: { authorization: `Bearer ${adminToken}` } });
    expect(noShop.statusCode).toBe(400);

    const gone = await app.inject({ method: 'POST', url: '/cash-closing', headers: as(cashierToken), payload: {} });
    expect(gone.statusCode).toBe(404);
  });

  it('Step 6.7b: The old drawer summary route no longer exists', async () => {
    const res = await app.inject({ method: 'GET', url: `/cash-closing/drawer-summary?shop_id=${pilotShopId}`, headers: as(cashierToken) });
    expect(res.statusCode).toBe(404);
  });

  it('Step 6.8: Definition of Done: Proves Trial Balance stays balanced (Rule 3)', async () => {
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

  it('Step 6.9: Definition of Done: Stock movement history matches stock quantity (Rule 4)', async () => {
    const invariant = await stockMovementService.verifyMovementHistoryMatchesStock(testVariationId, pilotShopId);
    expect(invariant.matches).toBe(true);
    expect(invariant.stockQty).toBe(50);
    expect(invariant.calculatedQty).toBe(50);
  });
});
