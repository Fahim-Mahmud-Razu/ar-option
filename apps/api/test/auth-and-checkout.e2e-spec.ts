import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

const envTestPath = path.resolve(__dirname, '../../../.env.test');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
}

// Rule 10 check: Test scripts abort unless DATABASE_URL host is localhost or 127.0.0.1
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('ABORT: DATABASE_URL is not set for test.');
}
const urlObj = new URL(dbUrl);
if (urlObj.hostname !== 'localhost' && urlObj.hostname !== '127.0.0.1') {
  throw new Error(`ABORT: Tests run only against local Docker database. Detected host: ${urlObj.hostname}`);
}

import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { Pool } from 'pg';
import { StockMovementService } from '../src/stock/stock-movement.service';

describe('Auth & Checkout Safety (e2e)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let stockMovementService: StockMovementService;

  let shopId: number;
  let otherShopId: number;
  let cashAccountId: number;
  let adminId: number;
  let cashierId: number;
  let adminToken: string;
  let cashierToken: string;
  let otherCashierToken: string;
  let shirtVarId: number;
  let freeGiftVarId: number;

  const sell = (token: string, payload: object, shop: number = shopId) =>
    app.inject({
      method: 'POST',
      url: '/pos/sales',
      headers: { authorization: `Bearer ${token}`, 'x-shop-id': String(shop) },
      payload: { payment_account_id: cashAccountId, ...payload },
    });

  const login = async (email: string, password: string): Promise<string> => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, password },
    });
    return JSON.parse(res.payload).token;
  };

  const register = (payload: object) =>
    app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: `Bearer ${adminToken}` },
      payload,
    });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    pool = app.get<Pool>(PG_POOL);
    stockMovementService = app.get<StockMovementService>(StockMovementService);

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
    await pool.query('DELETE FROM account_transactions');
    await pool.query('DELETE FROM user_locations');
    await pool.query('DELETE FROM users');
    await pool.query("DELETE FROM accounts WHERE code LIKE 'CASH_%'");
    await pool.query('DELETE FROM locations WHERE is_system = false');

    // A fresh deployment reports that it needs its first admin.
    const statusBefore = await app.inject({ method: 'GET', url: '/auth/setup-status' });
    expect(JSON.parse(statusBefore.payload).needs_setup).toBe(true);

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { name: 'Admin', email: 'admin.ac@aroption.com', password: 'admin-password', role: 'admin' },
    });
    adminToken = await login('admin.ac@aroption.com', 'admin-password');
    adminId = (await pool.query("SELECT id FROM users WHERE email = 'admin.ac@aroption.com'")).rows[0].id;

    const s1 = await app.inject({
      method: 'POST',
      url: '/shops',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Mirpur Shop', code: 'MIR-AC' },
    });
    shopId = JSON.parse(s1.payload).id;
    const s2 = await app.inject({
      method: 'POST',
      url: '/shops',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Uttara Shop', code: 'UTT-AC' },
    });
    otherShopId = JSON.parse(s2.payload).id;

    const accounts = await app.inject({
      method: 'GET',
      url: `/ledger/payment-accounts?shop_id=${shopId}`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    cashAccountId = JSON.parse(accounts.payload)[0].id;

    await register({
      name: 'Cashier',
      email: 'cashier.ac@aroption.com',
      password: 'cashier-password',
      role: 'cashier',
      shop_ids: [shopId],
      discount_limit_percent: 10,
    });
    cashierToken = await login('cashier.ac@aroption.com', 'cashier-password');
    cashierId = (await pool.query("SELECT id FROM users WHERE email = 'cashier.ac@aroption.com'")).rows[0].id;

    await register({
      name: 'Other Cashier',
      email: 'other.ac@aroption.com',
      password: 'other-password',
      role: 'cashier',
      shop_ids: [otherShopId],
    });
    otherCashierToken = await login('other.ac@aroption.com', 'other-password');

    const shirt = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Shirt', code: 'SHIRT-AC', cost_price: 400, selling_price: 1000 },
    });
    shirtVarId = JSON.parse(shirt.payload).variations[0].id;

    const gift = await app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: 'Free Bag', code: 'BAG-AC', cost_price: 0, selling_price: 50 },
    });
    freeGiftVarId = JSON.parse(gift.payload).variations[0].id;

    await stockMovementService.recordMovement({
      product_variation_id: shirtVarId,
      to_location_id: shopId,
      quantity: 100,
      movement_type: 'opening_stock',
    });
    await stockMovementService.recordMovement({
      product_variation_id: freeGiftVarId,
      to_location_id: shopId,
      quantity: 100,
      movement_type: 'opening_stock',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Authentication', () => {
    it('reports that setup is done once a user exists', async () => {
      const res = await app.inject({ method: 'GET', url: '/auth/setup-status' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.payload).needs_setup).toBe(false);
    });

    it('keeps /health public', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      expect(res.statusCode).toBe(200);
    });

    it.each([
      ['GET', '/shops'],
      ['GET', '/reports/stock-by-shop'],
      ['GET', '/pos/sales'],
      ['POST', '/products'],
      ['POST', '/pos/sales'],
      ['POST', '/ledger/entries'],
    ])('rejects anonymous %s %s with 401', async (method, url) => {
      const res = await app.inject({ method: method as 'GET' | 'POST', url, payload: method === 'POST' ? {} : undefined });
      expect(res.statusCode).toBe(401);
    });

    it('ignores a forged x-user-id header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/shops',
        headers: { 'x-user-id': String(adminId) },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects a tampered token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/shops',
        headers: { authorization: `Bearer ${adminToken}x` },
      });
      expect(res.statusCode).toBe(401);
    });

    it('rejects the token of a user who has been deactivated', async () => {
      await pool.query('UPDATE users SET is_active = false WHERE id = $1', [cashierId]);
      const res = await app.inject({
        method: 'GET',
        url: '/shops',
        headers: { authorization: `Bearer ${cashierToken}` },
      });
      await pool.query('UPDATE users SET is_active = true WHERE id = $1', [cashierId]);
      expect(res.statusCode).toBe(401);
    });

    it('still lets an admin create users through the public register route', async () => {
      const res = await register({
        name: 'Staff',
        email: 'staff.ac@aroption.com',
        password: 'staff-password',
        role: 'staff',
      });
      expect(res.statusCode).toBe(201);
    });

    it('stops anyone else creating users once setup is done', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/auth/register',
        payload: { name: 'Intruder', email: 'x@aroption.com', password: 'x', role: 'admin' },
      });
      expect(res.statusCode).toBe(403);
    });

    it('gives admins every permission, including cash.reconcile and ledger.post', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(JSON.parse(res.payload).permissions).toEqual(
        expect.arrayContaining(['cash.reconcile', 'ledger.post', 'pos.sell', 'products.manage'])
      );
    });
  });

  describe('Route permissions', () => {
    it('blocks a cashier from raw ledger posting', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: { authorization: `Bearer ${cashierToken}`, 'x-shop-id': String(shopId) },
        payload: { entry_type: 'sale', lines: [] },
      });
      expect(res.statusCode).toBe(403);
    });

    it('blocks a cashier from creating products', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/products',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: { name: 'X', code: 'X-AC', cost_price: 1, selling_price: 2 },
      });
      expect(res.statusCode).toBe(403);
    });

    it('blocks a sale at a shop outside the user\'s assigned shops', async () => {
      const res = await sell(otherCashierToken, {
        items: [{ product_variation_id: shirtVarId, quantity: 1 }],
      });
      expect(res.statusCode).toBe(403);
    });

    it('lets only an admin change a discount limit', async () => {
      const res = await app.inject({
        method: 'PUT',
        url: `/auth/users/${cashierId}/discount-limit`,
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: { discount_limit_percent: 100 },
      });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('Payment accounts', () => {
    it('lists only accounts that take money in this shop', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/ledger/payment-accounts?shop_id=${shopId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const codes = JSON.parse(res.payload).map((a: { code: string }) => a.code);
      expect(codes).toContain('CASH_MIR_AC');
      expect(codes).not.toContain('CASH_UTT_AC');
      expect(codes).not.toContain('INVENTORY');
      expect(codes).not.toContain('COURIER_RECEIVABLE');
    });

    it('rejects a sale paid into a non-payment asset account', async () => {
      const inventory = await pool.query("SELECT id FROM accounts WHERE code = 'INVENTORY'");
      const res = await sell(adminToken, {
        payment_account_id: inventory.rows[0].id,
        items: [{ product_variation_id: shirtVarId, quantity: 1 }],
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Discount limit (Rule 2)', () => {
    it('allows a cart discount within the limit', async () => {
      const res = await sell(cashierToken, {
        discount_amount: 100,
        items: [{ product_variation_id: shirtVarId, quantity: 1 }],
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.payload).total_amount).toBe(900);
    });

    it('rejects a cart discount over the limit', async () => {
      const res = await sell(cashierToken, {
        discount_amount: 100.01,
        items: [{ product_variation_id: shirtVarId, quantity: 1 }],
      });
      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).message).toContain('over your limit');
    });

    it('adds line and cart discounts together against the limit', async () => {
      const res = await sell(cashierToken, {
        discount_amount: 60,
        items: [{ product_variation_id: shirtVarId, quantity: 1, discount: 60 }],
      });
      expect(res.statusCode).toBe(403);
    });

    it('gives a user with no limit no discount at all', async () => {
      await pool.query('UPDATE users SET discount_limit_percent = 0 WHERE id = $1', [cashierId]);
      const res = await sell(cashierToken, {
        items: [{ product_variation_id: shirtVarId, quantity: 1, discount: 1 }],
      });
      await pool.query('UPDATE users SET discount_limit_percent = 10 WHERE id = $1', [cashierId]);
      expect(res.statusCode).toBe(403);
    });

    it('leaves admins unlimited', async () => {
      const res = await sell(adminToken, {
        discount_amount: 900,
        items: [{ product_variation_id: shirtVarId, quantity: 1 }],
      });
      expect(res.statusCode).toBe(201);
    });

    it.each([
      ['a negative cart discount', { discount_amount: -1, items: [{ quantity: 1 }] }],
      ['a negative line discount', { items: [{ quantity: 1, discount: -1 }] }],
      ['a line discount above the line', { items: [{ quantity: 1, discount: 1001 }] }],
      ['a cart discount above the subtotal', { discount_amount: 1001, items: [{ quantity: 1 }] }],
    ])('rejects %s', async (_name, payload: { items: object[]; discount_amount?: number }) => {
      const res = await sell(adminToken, {
        ...payload,
        items: payload.items.map((i) => ({ ...i, product_variation_id: shirtVarId })),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  describe('Sales that used to fail', () => {
    const trialBalance = async () =>
      JSON.parse(
        (
          await app.inject({
            method: 'GET',
            url: '/ledger/trial-balance',
            headers: { authorization: `Bearer ${adminToken}` },
          })
        ).payload
      );

    it('sells a zero-cost product and keeps the Trial Balance balanced', async () => {
      const res = await sell(adminToken, {
        items: [{ product_variation_id: freeGiftVarId, quantity: 1 }],
      });
      expect(res.statusCode).toBe(201);
      expect((await trialBalance()).isBalanced).toBe(true);
    });

    it('records a fully discounted sale of a zero-cost product with no ledger lines', async () => {
      const res = await sell(adminToken, {
        items: [{ product_variation_id: freeGiftVarId, quantity: 1, discount: 50 }],
      });
      expect(res.statusCode).toBe(201);
      const sale = JSON.parse(res.payload);
      expect(sale.total_amount).toBe(0);
      expect(sale.entry_id).toBeNull();
      expect((await trialBalance()).isBalanced).toBe(true);
    });

    it('rejects the same size twice in one sale', async () => {
      const res = await sell(adminToken, {
        items: [
          { product_variation_id: shirtVarId, quantity: 1 },
          { product_variation_id: shirtVarId, quantity: 1 },
        ],
      });
      expect(res.statusCode).toBe(400);
    });

    it('gives ten parallel sales ten different receipt numbers (Rule 7)', async () => {
      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          sell(adminToken, { items: [{ product_variation_id: shirtVarId, quantity: 1 }] })
        )
      );
      expect(results.map((r) => r.statusCode)).toEqual(Array(10).fill(201));
      const numbers = results.map((r) => JSON.parse(r.payload).invoice_number);
      expect(new Set(numbers).size).toBe(10);
    });
  });

  describe('Ledger rounding (Rule 3)', () => {
    it('rejects an entry that balances only before rounding', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: { authorization: `Bearer ${adminToken}`, 'x-shop-id': String(shopId) },
        payload: {
          entry_type: 'sale',
          lines: [
            { account_code: 'CASH_MIR_AC', direction: 'debit', amount: 100 },
            { account_code: 'SALES_REVENUE', direction: 'credit', amount: 33.333 },
            { account_code: 'SALES_REVENUE', direction: 'credit', amount: 33.333 },
            { account_code: 'SALES_REVENUE', direction: 'credit', amount: 33.334 },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
    });

    it('rejects a line that rounds to zero', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: { authorization: `Bearer ${adminToken}`, 'x-shop-id': String(shopId) },
        payload: {
          entry_type: 'sale',
          lines: [
            { account_code: 'CASH_MIR_AC', direction: 'debit', amount: 0.004 },
            { account_code: 'SALES_REVENUE', direction: 'credit', amount: 0.004 },
          ],
        },
      });
      expect(res.statusCode).toBe(400);
    });
  });
});
