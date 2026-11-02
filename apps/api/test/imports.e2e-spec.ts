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
import { createFastifyAdapter } from '../src/adapter';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { Pool } from 'pg';

type Row = Record<string, string>;

describe('Catalog import (e2e)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let shopA: number;
  let shopB: number;
  let adminToken: string;
  let cashierToken: string;
  let refCounter = 0;

  const auth = (token = adminToken) => ({ authorization: `Bearer ${token}` });
  const preview = async (rows: Row[], active: number | null = shopA, token = adminToken) =>
    app.inject({
      method: 'POST', url: '/imports/products/preview', headers: auth(token),
      payload: { rows, file_name: 'test.csv', active_shop_id: active },
    });
  const commit = async (rows: Row[], active: number | null = shopA, ref = `ref-${++refCounter}`, token = adminToken) =>
    app.inject({
      method: 'POST', url: '/imports/products/commit', headers: auth(token),
      payload: { rows, file_name: 'test.csv', active_shop_id: active, client_ref: ref },
    });
  const previewOf = async (rows: Row[], active: number | null = shopA) => JSON.parse((await preview(rows, active)).payload);
  const only = async (row: Row, active: number | null = shopA) => (await previewOf([row], active)).rows[0];

  const trialBalance = async () =>
    JSON.parse((await app.inject({ method: 'GET', url: '/ledger/trial-balance', headers: auth() })).payload);
  const inventoryNet = async () =>
    (await trialBalance()).items.find((i: { account_code: string }) => i.account_code === 'INVENTORY').net_balance;
  const stockValue = async () =>
    Number(
      (await pool.query(
        `SELECT COALESCE(SUM(s.qty_available * pv.cost_price), 0) AS v
         FROM stock s JOIN product_variations pv ON pv.id = s.product_variation_id`
      )).rows[0].v
    );
  const counts = async () =>
    JSON.stringify([
      (await pool.query('SELECT COUNT(*) FROM products')).rows[0].count,
      (await pool.query('SELECT COUNT(*) FROM product_variations')).rows[0].count,
      (await pool.query('SELECT COUNT(*) FROM stock_movements')).rows[0].count,
      (await pool.query('SELECT COUNT(*) FROM account_transactions')).rows[0].count,
    ]);

  const polo = (over: Row = {}): Row => ({
    'Product Name': 'Import Polo', Size: 'M', SKU: '', Category: 'Polos', Brand: 'AR Option',
    'Cost Price': '300', 'Selling Price': '700', 'Add Stock': '', ...over,
  });

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(createFastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    pool = app.get<Pool>(PG_POOL);

    for (const table of [
      'till_movements', 'till_sessions', 'daily_cash_closings', 'courier_parcel_items', 'courier_parcels', 'courier_settlements',
      'return_items', 'returns', 'sale_items', 'sales', 'expenses', 'stock_transfer_items',
      'stock_transfers', 'stock_movements', 'stock', 'product_variations', 'products',
      'categories', 'brands', 'import_batches', 'account_transactions', 'user_locations', 'users',
    ]) {
      await pool.query(`DELETE FROM ${table}`);
    }
    await pool.query("DELETE FROM accounts WHERE code LIKE 'CASH_%'");
    await pool.query('DELETE FROM locations WHERE is_system = false');

    await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { name: 'Admin', email: 'admin.imp@aroption.com', password: 'admin-password', role: 'admin' },
    });
    adminToken = JSON.parse(
      (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'admin.imp@aroption.com', password: 'admin-password' } })).payload
    ).token;
    shopA = JSON.parse((await app.inject({ method: 'POST', url: '/shops', headers: auth(), payload: { name: 'Alpha Shop', code: 'ALP-01' } })).payload).id;
    shopB = JSON.parse((await app.inject({ method: 'POST', url: '/shops', headers: auth(), payload: { name: 'Beta Shop', code: 'BET-01' } })).payload).id;
    await app.inject({
      method: 'POST', url: '/auth/register', headers: auth(),
      payload: { name: 'Cashier', email: 'cashier.imp@aroption.com', password: 'cashier-password', role: 'cashier', shop_ids: [shopA] },
    });
    cashierToken = JSON.parse(
      (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'cashier.imp@aroption.com', password: 'cashier-password' } })).payload
    ).token;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Access', () => {
    it('rejects anonymous and cashier callers', async () => {
      expect((await app.inject({ method: 'POST', url: '/imports/products/preview', payload: { rows: [{}] } })).statusCode).toBe(401);
      expect((await preview([polo()], shopA, cashierToken)).statusCode).toBe(403);
      expect((await app.inject({ method: 'GET', url: '/imports/products/export', headers: auth(cashierToken) })).statusCode).toBe(403);
    });

    it('refuses a shop outside the user\'s shops', async () => {
      await pool.query("INSERT INTO role_permissions (role, permission) VALUES ('cashier', 'products.import') ON CONFLICT DO NOTHING");
      const res = await preview([polo()], shopB, cashierToken);
      await pool.query("DELETE FROM role_permissions WHERE role = 'cashier' AND permission = 'products.import'");
      expect(res.statusCode).toBe(403);
    });

    it('stops a file that is empty or too long', async () => {
      expect((await preview([])).statusCode).toBe(400);
      expect((await preview(Array.from({ length: 2001 }, () => polo()))).statusCode).toBe(400);
    });
  });

  describe('Row classification', () => {
    it('reads the new product, then its extra size, then a repeat as an update', async () => {
      const p = await previewOf([
        polo({ Size: 'M' }), polo({ Size: 'L' }),
      ]);
      expect(p.rows.map((r: { action: string }) => r.action)).toEqual(['new_product', 'new_size']);
      expect(p.totals).toMatchObject({ new_products: 1, new_sizes: 1, errors: 0 });
    });

    it('needs category, brand and a selling price for something new', async () => {
      expect((await only(polo({ Category: '' }))).message).toContain('Category');
      expect((await only(polo({ Brand: '' }))).message).toContain('Brand');
      expect((await only(polo({ 'Selling Price': '' }))).message).toContain('Selling Price');
    });

    it('treats a blank cell as keep, but a zero as a real value', async () => {
      await commit([polo({ 'Product Name': 'Keep Tee' })]);
      const same = await only(polo({ 'Product Name': 'Keep Tee', 'Cost Price': '', 'Selling Price': '', Category: '', Brand: '' }));
      expect(same.action).toBe('unchanged');
      const zeroCost = await only(polo({ 'Product Name': 'Keep Tee', 'Cost Price': '0', 'Add Stock': '2' }));
      expect(zeroCost.action).toBe('error');
      expect(zeroCost.message).toContain('Cost Price above zero');
    });

    it('matches names ignoring case, spacing and Unicode form', async () => {
      await commit([polo({ 'Product Name': 'Bengali Polo পোলো' })]);
      const r = await only(polo({ 'Product Name': '  bengali   POLO  পোলো ', 'Selling Price': '750' }));
      expect(r.action).toBe('update');
      expect(r.message).toContain('Price 700 → 750');
    });

    it('accepts Bengali digits, commas and the taka sign', async () => {
      const r = await only(polo({ 'Product Name': 'Digits Tee', 'Cost Price': '৩০০', 'Selling Price': '৳1,200.50' }));
      expect(r.action).toBe('new_product');
    });

    it('rejects text where a number belongs', async () => {
      expect((await only(polo({ 'Selling Price': 'abc' }))).message).toContain('not a number');
      expect((await only(polo({ 'Add Stock': '2.5' }))).message).toContain('whole number');
      expect((await only(polo({ 'Add Stock': '-1' }))).message).toContain('whole number');
    });

    it('accepts the header names of the reference file, including Branch', async () => {
      const r = await only({
        'Product Name': 'Alias Tee', Size: 'M', Category: 'Tees', Brand: 'AR Option',
        'Cost Price': '10', 'Selling Price': '20', 'Add Stock': '1', Branch: 'ALP-01', 'Image URL': 'x',
      } as Row);
      expect(r.action).toBe('new_product');
      expect(r.shop).toBe('Alpha Shop');
    });
  });

  describe('SKU rules', () => {
    it('repairs a SKU that Excel turned into 100001.0 and rejects scientific notation', async () => {
      const ok = await only(polo({ 'Product Name': 'Excel Tee', SKU: '555001.0' }));
      expect(ok.sku).toBe('555001');
      const bad = await only(polo({ 'Product Name': 'Excel Tee 2', SKU: '1E+05' }));
      expect(bad.action).toBe('error');
      expect(bad.message).toContain('Text');
    });

    it('names the owner when a SKU belongs to another product or size', async () => {
      await commit([polo({ 'Product Name': 'Owner Tee', SKU: '' }), polo({ 'Product Name': 'Owner Tee', Size: 'L' })]);
      const sku = (await pool.query("SELECT pv.sku FROM product_variations pv JOIN products p ON p.id = pv.product_id WHERE p.name = 'Owner Tee' AND pv.size = 'M'")).rows[0].sku;
      const wrongSize = await only(polo({ 'Product Name': 'Owner Tee', SKU: sku, Size: 'L' }));
      expect(wrongSize.action).toBe('error');
      expect(wrongSize.message).toContain('Owner Tee (M)');
      const taken = await only(polo({ 'Product Name': 'Someone Else', SKU: sku }));
      expect(taken.action).toBe('error');
    });

    it('asks for a Size when the product has sizes, and fills Standard for a one-size product', async () => {
      const needs = await only(polo({ 'Product Name': 'Owner Tee', Size: '' }));
      expect(needs.message).toContain('Add the Size');
      const single = await only(polo({ 'Product Name': 'One Size Cap', Size: '' }));
      expect(single.size).toBe('Standard');
    });

    it('stops two products sharing a name when the SKU is missing', async () => {
      await pool.query("INSERT INTO products (name, code) VALUES ('Twin', 'TWIN-1'), ('Twin', 'TWIN-2')");
      await pool.query("INSERT INTO product_variations (product_id, size, sku) SELECT id, 'M', code || '-M' FROM products WHERE name = 'Twin'");
      const twin = await only(polo({ 'Product Name': 'Twin' }));
      expect(twin.message).toContain('More than one product');
    });
  });

  describe('Whole-file checks', () => {
    it('flags the same size twice and a repeated new SKU, on both rows', async () => {
      const p = await previewOf([polo({ 'Product Name': 'Dup Tee' }), polo({ 'Product Name': 'Dup Tee' })]);
      expect(p.rows.map((r: { action: string }) => r.action)).toEqual(['error', 'error']);
      const sku = await previewOf([
        polo({ 'Product Name': 'Sku A', SKU: '777' }), polo({ 'Product Name': 'Sku B', SKU: '777' }),
      ]);
      expect(sku.rows[1].message).toContain('also used in row 2');
    });

    it('allows one size to add stock to two different shops', async () => {
      const p = await previewOf([
        polo({ 'Product Name': 'Spread Tee', 'Add Stock': '5', Shop: 'ALP-01' }),
        polo({ 'Product Name': 'Spread Tee', 'Add Stock': '7', Shop: 'BET-01' }),
      ]);
      expect(p.totals.errors).toBe(0);
      expect(p.totals.stock_added).toBe(12);
    });

    it('flags a product given two different categories', async () => {
      const p = await previewOf([polo({ 'Product Name': 'Split Cat' }), polo({ 'Product Name': 'Split Cat', Size: 'L', Category: 'Other' })]);
      expect(p.rows[1].message).toContain('differs from row 2');
    });
  });

  describe('Shops', () => {
    it('uses the active shop when Shop is blank, and needs one when All shops is active', async () => {
      const row = polo({ 'Product Name': 'Shop Tee', 'Add Stock': '1' });
      expect((await only(row, shopA)).shop).toBe('Alpha Shop');
      expect((await only(row, null)).message).toContain('Choose a shop');
    });

    it('accepts a shop by code or by unique name, and rejects system and unknown shops', async () => {
      const row = (shop: string) => polo({ 'Product Name': 'Shop Tee', 'Add Stock': '1', Shop: shop });
      expect((await only(row('bet-01'))).shop).toBe('Beta Shop');
      expect((await only(row('Beta Shop'))).shop).toBe('Beta Shop');
      expect((await only(row('LOC-COURIER'))).action).toBe('error');
      expect((await only(row('NOPE'))).action).toBe('error');
    });
  });

  describe('Commit', () => {
    it('does nothing at all when any row has an error', async () => {
      const before = await counts();
      const res = await commit([polo({ 'Product Name': 'Good Row' }), polo({ 'Product Name': 'Bad Row', 'Selling Price': '' })]);
      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain('Row 3');
      expect(await counts()).toBe(before);
    });

    it('saves new products, stock and the books together, with a Stock In number', async () => {
      const before = await inventoryNet();
      const res = await commit([
        polo({ 'Product Name': 'Booked Tee', 'Add Stock': '10', Shop: 'ALP-01' }),
        polo({ 'Product Name': 'Booked Tee', Size: 'L', 'Cost Price': '320', 'Add Stock': '4', Shop: 'BET-01' }),
      ]);
      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.payload);
      expect(body.batch_no).toMatch(/^IMP-\d{6}$/);
      expect(body.totals).toMatchObject({ new_products: 1, new_sizes: 1, stock_added: 14 });

      expect(await inventoryNet()).toBe(before + 10 * 300 + 4 * 320);
      expect((await trialBalance()).isBalanced).toBe(true);
      expect(await inventoryNet()).toBe(await stockValue());
      const moves = await pool.query("SELECT COUNT(*) FROM stock_movements WHERE source_id = $1", [body.batch_no]);
      expect(moves.rows[0].count).toBe('2');
    });

    it('adds stock to a saved size and restates its value when the cost changes', async () => {
      await commit([polo({ 'Product Name': 'Restate Tee', 'Add Stock': '10', Shop: 'ALP-01' })]);
      const before = await inventoryNet();
      const res = await commit([polo({ 'Product Name': 'Restate Tee', 'Cost Price': '350', 'Add Stock': '5', Shop: 'ALP-01' })]);
      expect(res.statusCode).toBe(201);
      // 10 held units rise by 50 each, then 5 new units come in at 350.
      expect(await inventoryNet()).toBe(before + 10 * 50 + 5 * 350);
      expect(await inventoryNet()).toBe(await stockValue());
      expect((await trialBalance()).isBalanced).toBe(true);
    });

    it('returns the first result for a retry and changes nothing', async () => {
      const rows = [polo({ 'Product Name': 'Retry Tee', 'Add Stock': '3', Shop: 'ALP-01' })];
      const first = JSON.parse((await commit(rows, shopA, 'same-ref')).payload);
      const before = await counts();
      const second = JSON.parse((await commit(rows, shopA, 'same-ref')).payload);
      expect(second.batch_no).toBe(first.batch_no);
      expect(await counts()).toBe(before);
    });

    it('uses a given SKU as the code of a one-size product', async () => {
      await commit([polo({ 'Product Name': 'Coded Cap', Size: '', SKU: '880001' })]);
      const p = (await pool.query("SELECT code FROM products WHERE name = 'Coded Cap'")).rows[0];
      expect(p.code).toBe('880001');
    });

    it('imports a few hundred rows in one go', async () => {
      const rows = Array.from({ length: 300 }, (_, i) => polo({ 'Product Name': `Bulk Tee ${i}`, 'Add Stock': '2', Shop: 'ALP-01' }));
      const started = Date.now();
      const res = await commit(rows);
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.payload).totals.new_products).toBe(300);
      expect(await inventoryNet()).toBe(await stockValue());
      expect(Date.now() - started).toBeLessThan(25000);
    });
  });

  describe('Export', () => {
    it('writes a file that imports back as unchanged and adds no stock', async () => {
      const res = await app.inject({ method: 'GET', url: '/imports/products/export', headers: auth() });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.payload.charCodeAt(0)).toBe(0xfeff);

      const lines = res.payload.slice(1).trim().split('\r\n');
      const header = lines[0].split(',');
      expect(header).toContain('Current Stock');
      const rows: Row[] = lines.slice(1, 40).map((line) => {
        const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((c) => c.replace(/,$/, '').replace(/^"|"$/g, '').replace(/""/g, '"'));
        return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? '']));
      });
      const p = await previewOf(rows);
      expect(p.totals.errors).toBe(0);
      expect(p.totals.stock_added).toBe(0);
      expect(p.totals.unchanged).toBe(rows.length);
    });

    it('defuses cells that start like a formula', async () => {
      await pool.query("INSERT INTO products (name, code) VALUES ('=HYPERLINK(1)', 'FORM-1')");
      await pool.query("INSERT INTO product_variations (product_id, size, sku) SELECT id, 'M', 'FORM-1-M' FROM products WHERE code = 'FORM-1'");
      const res = await app.inject({ method: 'GET', url: '/imports/products/export', headers: auth() });
      expect(res.payload).toContain("'=HYPERLINK(1)");
    });
  });
});
