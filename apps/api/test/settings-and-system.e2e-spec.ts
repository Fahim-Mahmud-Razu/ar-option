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
import { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { createFastifyAdapter } from '../src/adapter';
import { Pool } from 'pg';

describe('Settings, shop rename, backup, restore and reset (e2e)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let shopId: number;
  let adminToken: string;
  let cashierToken: string;

  const as = (token: string) => ({ authorization: `Bearer ${token}` });
  const inject = (method: 'GET' | 'POST' | 'PUT', url: string, payload?: object, token = adminToken) =>
    app.inject({ method, url, headers: as(token), payload });
  const body = (res: { payload: string }) => JSON.parse(res.payload);
  const setSizes = (on: boolean) => pool.query("UPDATE settings SET value = $1 WHERE key = 'use_sizes'", [String(on)]);
  const count = async (table: string) => Number((await pool.query(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);
  const trialBalance = async () => {
    const res = await pool.query(
      `SELECT COALESCE(SUM(amount) FILTER (WHERE direction = 'debit'), 0) AS dr,
              COALESCE(SUM(amount) FILTER (WHERE direction = 'credit'), 0) AS cr
       FROM account_transactions`
    );
    return { dr: Number(res.rows[0].dr), cr: Number(res.rows[0].cr) };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    pool = app.get<Pool>(PG_POOL);
    await setSizes(false);

    for (const table of [
      'till_movements', 'till_sessions', 'daily_cash_closings', 'courier_parcel_items', 'courier_parcels', 'courier_settlements',
      'return_items', 'returns', 'sale_payments', 'sale_items', 'sales', 'expenses', 'stock_transfer_items',
      'stock_transfers', 'stock_movements', 'stock', 'import_batches', 'product_variations', 'products',
      'categories', 'brands', 'account_transactions', 'user_locations', 'users',
    ]) {
      await pool.query(`DELETE FROM ${table}`);
    }
    await pool.query('DELETE FROM accounts WHERE location_id IN (SELECT id FROM locations WHERE is_system = false)');
    await pool.query('DELETE FROM locations WHERE is_system = false');

    await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { name: 'Admin', email: 'admin.sys@aroption.com', password: 'admin-password', role: 'admin' },
    });
    adminToken = body(
      await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'admin.sys@aroption.com', password: 'admin-password' } })
    ).token;
    shopId = body(await inject('POST', '/shops', { name: 'Gulshan', code: 'GUL' })).id;
    await inject('POST', '/auth/register', {
      name: 'Cashier', email: 'cashier.sys@aroption.com', password: 'cashier-password', role: 'cashier', shop_ids: [shopId],
    });
    cashierToken = body(
      await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'cashier.sys@aroption.com', password: 'cashier-password' } })
    ).token;
  });

  afterAll(async () => {
    await setSizes(true);
    await app.close();
  });

  describe('Sizes setting', () => {
    it('lets anyone signed in read settings, and only an admin change them', async () => {
      const res = await inject('GET', '/settings', undefined, cashierToken);
      expect(res.statusCode).toBe(200);
      expect(body(res).use_sizes).toBe(false);
      expect((await inject('PUT', '/settings', { use_sizes: true }, cashierToken)).statusCode).toBe(403);
    });

    it('creates one hidden Standard variation whose SKU is the product code', async () => {
      const res = await inject('POST', '/products', {
        name: 'Plain Panjabi', code: 'PAN-1', cost_price: 400, selling_price: 900,
        variations: [{ size: 'Standard', cost_price: 400, selling_price: 900, opening_stock: [{ shop_id: shopId, quantity: 5 }] }],
      });
      expect(res.statusCode).toBe(201);
      const p = body(res);
      expect(p.variations).toHaveLength(1);
      expect(p.variations[0].size).toBe('Standard');
      expect(p.variations[0].sku).toBe('PAN-1');
    });

    it('rejects several sizes, and adding a size on edit, while sizes are off', async () => {
      const res = await inject('POST', '/products', { name: 'Sized Tee', sizes: ['M', 'L'] });
      expect(res.statusCode).toBe(400);
      const p = body(await inject('POST', '/products', { name: 'One Tee', selling_price: 300 }));
      const edit = await inject('PUT', `/products/${p.id}`, { variations: [{ size: 'XL', selling_price: 300 }] });
      expect(edit.statusCode).toBe(400);
    });

    it('refuses to turn sizes off while a product has more than one size', async () => {
      expect((await inject('PUT', '/settings', { use_sizes: true })).statusCode).toBe(200);
      const multi = body(await inject('POST', '/products', { name: 'Two Size Tee', sizes: ['M', 'L'], selling_price: 300 }));
      const res = await inject('PUT', '/settings', { use_sizes: false });
      expect(res.statusCode).toBe(409);
      expect(body(res).message).toContain('1 product');

      await pool.query('UPDATE products SET is_active = false WHERE id = $1', [multi.id]);
      expect(body(await inject('PUT', '/settings', { use_sizes: false })).use_sizes).toBe(false);
    });

    it('rejects a real size in an import while sizes are off, and accepts a blank one', async () => {
      const bad = await inject('POST', '/imports/products/preview', {
        rows: [{ 'Product Name': 'Import Tee', Size: 'M', Category: 'Tops', Brand: 'AR', 'Selling Price': '500' }],
      });
      expect(body(bad).rows[0].action).toBe('error');
      expect(body(bad).rows[0].message).toContain('Sizes are turned off');

      const good = await inject('POST', '/imports/products/preview', {
        rows: [{ 'Product Name': 'Import Tee', Size: '', Category: 'Tops', Brand: 'AR', 'Selling Price': '500' }],
      });
      expect(body(good).rows[0].action).toBe('new_product');

      const csv = await inject('GET', '/imports/products/export');
      expect(csv.payload.split('\n')[0]).not.toContain('Size');
    });
  });

  describe('Shop rename', () => {
    it('renames the shop and its own accounts, and keeps the code', async () => {
      const res = await inject('PUT', `/shops/${shopId}`, { name: '  Gulshan   Avenue ' });
      expect(res.statusCode).toBe(200);
      expect(body(res).name).toBe('Gulshan Avenue');
      expect(body(res).code).toBe('GUL');
      const accounts = await pool.query('SELECT name FROM accounts WHERE location_id = $1 ORDER BY code', [shopId]);
      expect(accounts.rows.map((r) => r.name)).toEqual(['Gulshan Avenue bKash', 'Gulshan Avenue Card', 'Gulshan Avenue Cash']);
    });

    it('rejects an empty or duplicate name, a system location, and a user without shops.manage', async () => {
      const other = body(await inject('POST', '/shops', { name: 'Dhanmondi', code: 'DHA' }));
      expect((await inject('PUT', `/shops/${other.id}`, { name: '   ' })).statusCode).toBe(400);
      expect((await inject('PUT', `/shops/${other.id}`, { name: 'gulshan avenue' })).statusCode).toBe(400);
      const sys = await pool.query("SELECT id FROM locations WHERE code = 'LOC-TRANSIT'");
      expect((await inject('PUT', `/shops/${sys.rows[0].id}`, { name: 'Road' })).statusCode).toBe(400);
      expect((await inject('PUT', `/shops/${other.id}`, { name: 'Mirpur' }, cashierToken)).statusCode).toBe(403);
    });
  });

  describe('Backup and restore', () => {
    it('only lets an admin back up, restore or reset', async () => {
      expect((await inject('GET', '/system/backup', undefined, cashierToken)).statusCode).toBe(403);
      expect((await inject('POST', '/system/restore', {}, cashierToken)).statusCode).toBe(403);
      expect((await inject('POST', '/system/reset', { level: 'transactions', confirm: 'RESET' }, cashierToken)).statusCode).toBe(403);
    });

    it('restores the exact rows of a backup after later changes', async () => {
      const res = await inject('GET', '/system/backup');
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-disposition']).toContain('ar-option-backup-');
      const file = body(res);
      const before = { products: await count('products'), stock_movements: await count('stock_movements'), account_transactions: await count('account_transactions') };
      expect(file.tables.products).toHaveLength(before.products);

      await inject('POST', '/products', {
        name: 'After Backup', cost_price: 100, selling_price: 200,
        variations: [{ size: 'Standard', cost_price: 100, selling_price: 200, opening_stock: [{ shop_id: shopId, quantity: 2 }] }],
      });
      expect(await count('products')).toBe(before.products + 1);

      const restored = await inject('POST', '/system/restore', file);
      expect(restored.statusCode).toBe(201);
      expect(await count('products')).toBe(before.products);
      expect(await count('stock_movements')).toBe(before.stock_movements);
      expect(await count('account_transactions')).toBe(before.account_transactions);

      // Ids and codes carry on after the restored rows.
      const next = await inject('POST', '/products', { name: 'Next After Restore', selling_price: 200 });
      expect(next.statusCode).toBe(201);
      const tb = await trialBalance();
      expect(tb.dr).toBe(tb.cr);
    });

    it('rejects a backup from another database version or a file that is not a backup', async () => {
      const file = body(await inject('GET', '/system/backup'));
      expect((await inject('POST', '/system/restore', { ...file, schema_version: file.schema_version - 1 })).statusCode).toBe(400);
      expect((await inject('POST', '/system/restore', { hello: 'world' })).statusCode).toBe(400);
    });
  });

  describe('Reset', () => {
    it('needs the typed confirmation', async () => {
      expect((await inject('POST', '/system/reset', { level: 'transactions', confirm: 'reset please' })).statusCode).toBe(400);
      expect((await inject('POST', '/system/reset', { level: 'factory', confirm: 'RESET' })).statusCode).toBe(400);
    });

    it('Clear transactions empties stock and the ledger and keeps products, shops and users', async () => {
      const products = await count('products');
      const users = await count('users');
      expect(await count('account_transactions')).toBeGreaterThan(0);

      const res = await inject('POST', '/system/reset', { level: 'transactions', confirm: 'RESET' });
      expect(res.statusCode).toBe(201);
      expect(await count('account_transactions')).toBe(0);
      expect(await count('stock')).toBe(0);
      expect(await count('stock_movements')).toBe(0);
      expect(await count('products')).toBe(products);
      expect(await count('users')).toBe(users);
      expect(await trialBalance()).toEqual({ dr: 0, cr: 0 });
    });

    it('Factory reset keeps only the calling admin and the system rows', async () => {
      const res = await inject('POST', '/system/reset', { level: 'factory', confirm: 'FACTORY RESET' });
      expect(res.statusCode).toBe(201);
      expect(await count('products')).toBe(0);
      expect(await count('contacts')).toBe(0);
      expect(await count('users')).toBe(1);
      expect(Number((await pool.query('SELECT COUNT(*) AS n FROM locations WHERE is_system = false')).rows[0].n)).toBe(0);
      expect(Number((await pool.query("SELECT COUNT(*) AS n FROM locations WHERE is_system = true")).rows[0].n)).toBeGreaterThanOrEqual(3);
      expect(Number((await pool.query("SELECT COUNT(*) AS n FROM accounts WHERE code IN ('INVENTORY', 'OWNER_EQUITY', 'SALES_REVENUE')")).rows[0].n)).toBe(3);
      expect(await count('expense_categories')).toBe(6);

      // The admin can carry on: a new shop and product start fresh.
      expect((await inject('POST', '/shops', { name: 'Fresh Shop', code: 'FRS' })).statusCode).toBe(201);
      const p = body(await inject('POST', '/products', { name: 'Fresh Product', selling_price: 100 }));
      expect(p.code).toBe('100001');
    });
  });
});
