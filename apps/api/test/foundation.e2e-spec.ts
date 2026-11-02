import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.test explicitly
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

describe('Foundation: Ledger, Shop Guard & API Permissions (e2e)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let testShopId: number;
  let secondShopId: number;
  let adminToken: string;
  let cashierToken: string;
  let cashierUserId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    pool = app.get<Pool>(PG_POOL);

    // Clean test tables
    await pool.query('DELETE FROM sale_items');
    await pool.query('DELETE FROM sales');
    await pool.query('DELETE FROM expenses');
    await pool.query('DELETE FROM stock_transfer_items');
    await pool.query('DELETE FROM stock_transfers');
    await pool.query('DELETE FROM stock_movements');
    await pool.query('DELETE FROM stock');
    await pool.query('DELETE FROM product_variations');
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM account_transactions');
    await pool.query('DELETE FROM user_locations');
    await pool.query('DELETE FROM users');
    await pool.query("DELETE FROM accounts WHERE code LIKE 'CASH_%'");
    await pool.query("DELETE FROM locations WHERE is_system = false");

    // Create a real active shop for tests
    const shopRes = await pool.query(
      `INSERT INTO locations (name, code, is_system, is_active)
       VALUES ('Gulshan Shop', 'GUL-01', false, true)
       RETURNING id`
    );
    testShopId = shopRes.rows[0].id;

    // Create a second shop
    const shop2Res = await pool.query(
      `INSERT INTO locations (name, code, is_system, is_active)
       VALUES ('Dhanmondi Shop', 'DHM-01', false, true)
       RETURNING id`
    );
    secondShopId = shop2Res.rows[0].id;

    // Create shop cash accounts
    await pool.query(
      `INSERT INTO accounts (code, name, type, location_id, is_active)
       VALUES ('CASH_GUL', 'Gulshan Cash', 'asset', $1, true),
              ('CASH_DHM', 'Dhanmondi Cash', 'asset', $2, true)
       ON CONFLICT (code) DO NOTHING`,
      [testShopId, secondShopId]
    );

    // 1. Bootstrap initial admin user
    const adminRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Super Admin',
        email: 'admin@aroption.com',
        password: 'admin-secure-password',
        role: 'admin',
      },
    });
    expect(adminRes.statusCode).toBe(201);

    // Login as admin
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'admin@aroption.com',
        password: 'admin-secure-password',
      },
    });
    expect(adminLogin.statusCode).toBe(201);
    adminToken = JSON.parse(adminLogin.payload).token;

    // 2. Create Cashier user assigned ONLY to Gulshan Shop
    const cashierCreate = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: {
        authorization: `Bearer ${adminToken}`,
      },
      payload: {
        name: 'Gulshan Cashier',
        email: 'cashier.gulshan@aroption.com',
        password: 'cashier-password',
        role: 'cashier',
        shop_ids: [testShopId],
      },
    });
    expect(cashierCreate.statusCode).toBe(201);
    cashierUserId = JSON.parse(cashierCreate.payload).id;

    // Login as cashier
    const cashierLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'cashier.gulshan@aroption.com',
        password: 'cashier-password',
      },
    });
    expect(cashierLogin.statusCode).toBe(201);
    cashierToken = JSON.parse(cashierLogin.payload).token;
  });

  afterAll(async () => {
    if (app) {
      if (pool) {
        await pool.end();
      }
      await app.close();
    }
  });

  describe('Rule 1: Every record belongs to a shop & User-to-Shop Mapping', () => {
    it('rejects write requests with 400 when X-Shop-Id is missing (never defaults to shop 1)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          entry_type: 'sale',
          lines: [
            { account_code: 'INVENTORY', direction: 'credit', amount: 100 },
            { account_code: 'COGS', direction: 'debit', amount: 100 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Every write request requires an active shop');
      expect(body.message).toContain('prohibited by Rule 1');
    });

    it('rejects write requests targeting a system location (With Courier / In Transit)', async () => {
      const sysRes = await pool.query("SELECT id FROM locations WHERE code = 'LOC-COURIER' LIMIT 1");
      const systemShopId = sysRes.rows[0]?.id;

      const response = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': systemShopId.toString(),
        },
        payload: {
          entry_type: 'sale',
          lines: [
            { account_code: 'INVENTORY', direction: 'credit', amount: 100 },
            { account_code: 'COGS', direction: 'debit', amount: 100 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('cannot be used as an active shop');
    });

    it('rejects a user attempting to write to a shop outside their assigned shops with 403 Forbidden', async () => {
      // Cashier is assigned to testShopId (Gulshan), NOT secondShopId (Dhanmondi)
      const response = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: {
          authorization: `Bearer ${cashierToken}`,
          'x-shop-id': secondShopId.toString(),
        },
        payload: {
          entry_type: 'sale',
          lines: [
            { account_code: 'INVENTORY', direction: 'credit', amount: 50 },
            { account_code: 'COGS', direction: 'debit', amount: 50 },
          ],
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('outside your assigned shops');
    });

    it('rejects cross-shop account entries (cannot post to Shop B cash account for Shop A)', async () => {
      // Attempt to post for testShopId (Gulshan) using CASH_DHM (linked to Dhanmondi)
      const response = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': testShopId.toString(),
        },
        payload: {
          entry_type: 'sale',
          lines: [
            { account_code: 'CASH_DHM', direction: 'debit', amount: 200 },
            { account_code: 'SALES_REVENUE', direction: 'credit', amount: 200 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Cross-shop account entries are prohibited by Rule 1');
    });
  });

  describe('Rule 3: The ledger is the source of truth & Trial Balance equation', () => {
    it('rejects unbalanced entries where debits != credits', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': testShopId.toString(),
        },
        payload: {
          entry_type: 'sale',
          lines: [
            { account_code: 'SALES_REVENUE', direction: 'credit', amount: 500 },
            { account_code: 'COGS', direction: 'debit', amount: 300 }, // diff = 200
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Unbalanced ledger entry');
    });

    it('rejects entries with non-existent account codes (no hardcoded fallbacks per Rule 3)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': testShopId.toString(),
        },
        payload: {
          entry_type: 'sale',
          lines: [
            { account_code: 'NON_EXISTENT_ACC', direction: 'credit', amount: 500 },
            { account_code: 'COGS', direction: 'debit', amount: 500 },
          ],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Hardcoded fallbacks are prohibited by Rule 3');
    });

    it('successfully posts balanced entries and maintains Trial Balance equality', async () => {
      const clientRef = `test-sale-${Date.now()}`;

      // Balanced entry: Dr CASH_GUL 500, Cr SALES_REVENUE 500
      const postRes = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': testShopId.toString(),
        },
        payload: {
          entry_type: 'sale',
          client_ref: clientRef,
          lines: [
            { account_code: 'CASH_GUL', direction: 'debit', amount: 500 },
            { account_code: 'SALES_REVENUE', direction: 'credit', amount: 500 },
          ],
        },
      });

      expect(postRes.statusCode).toBe(201);
      const postBody = JSON.parse(postRes.payload);
      expect(postBody.entry_id).toBeDefined();
      expect(postBody.lines_posted).toBe(2);

      // Verify Trial Balance stays balanced (Sum debits == Sum credits)
      const tbRes = await app.inject({
        method: 'GET',
        url: '/ledger/trial-balance',
      });

      expect(tbRes.statusCode).toBe(200);
      const tbBody = JSON.parse(tbRes.payload);
      expect(tbBody.isBalanced).toBe(true);
      expect(tbBody.totalDebit).toEqual(tbBody.totalCredit);
      expect(tbBody.totalDebit).toBe(500);
    });

    it('supports idempotent retries using client_ref (Rule 6)', async () => {
      const clientRef = `idempotent-test-${Date.now()}`;

      // First call
      const res1 = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': testShopId.toString(),
        },
        payload: {
          entry_type: 'cogs',
          client_ref: clientRef,
          lines: [
            { account_code: 'COGS', direction: 'debit', amount: 150 },
            { account_code: 'INVENTORY', direction: 'credit', amount: 150 },
          ],
        },
      });

      const body1 = JSON.parse(res1.payload);
      expect(body1.lines_posted).toBe(2);

      // Retry with same client_ref
      const res2 = await app.inject({
        method: 'POST',
        url: '/ledger/entries',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': testShopId.toString(),
        },
        payload: {
          entry_type: 'cogs',
          client_ref: clientRef,
          lines: [
            { account_code: 'COGS', direction: 'debit', amount: 150 },
            { account_code: 'INVENTORY', direction: 'credit', amount: 150 },
          ],
        },
      });

      const body2 = JSON.parse(res2.payload);
      expect(body2.entry_id).toEqual(body1.entry_id);
      expect(body2.lines_posted).toBe(0); // Idempotent: did not duplicate lines!
    });
  });

  describe('Rule 5: Permissions are enforced by the API', () => {
    it('rejects POST /shops without permission key (cashier role) with 403 Forbidden', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/shops',
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
        payload: {
          name: 'Unauthorized Shop',
          code: 'UNAUTH-01',
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Missing required permission');
    });

    it('allows admin superuser to create shop and verifies auto-created shop cash account', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/shops',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          name: 'Uttara Shop',
          code: 'UTT-01',
        },
      });

      expect(response.statusCode).toBe(201);
      const newShop = JSON.parse(response.payload);
      expect(newShop.id).toBeDefined();
      expect(newShop.code).toBe('UTT-01');

      // Verify that shop cash account was automatically configured (Rule 1 & Rule 3)
      const accRes = await pool.query(
        "SELECT * FROM accounts WHERE code = 'CASH_UTT_01'"
      );
      expect(accRes.rows.length).toBe(1);
      expect(accRes.rows[0].location_id).toBe(newShop.id);
    });
  });

  describe('Authentication & Profile API (/auth/me)', () => {
    it('returns user profile, assigned shops, and full permissions for admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.user.email).toBe('admin@aroption.com');
      expect(body.user.role).toBe('admin');
      expect(body.permissions).toContain('shops.manage');
      expect(body.permissions).toContain('pos.edit_price');
    });

    it('returns assigned shops and cashier permissions for cashier', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: {
          authorization: `Bearer ${cashierToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.user.email).toBe('cashier.gulshan@aroption.com');
      expect(body.user.role).toBe('cashier');
      expect(body.user.assigned_shops.length).toBe(1);
      expect(body.user.assigned_shops[0].id).toBe(testShopId);
      expect(body.permissions).toContain('returns.create');
      expect(body.permissions).not.toContain('shops.manage');
    });
  });
});
