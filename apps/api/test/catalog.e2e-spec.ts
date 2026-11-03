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

describe('Catalog: per-size prices, SKUs and opening stock (e2e)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let shopId: number;
  let adminToken: string;
  let cashierToken: string;

  const auth = () => ({ authorization: `Bearer ${adminToken}` });

  const createProduct = (payload: object, token = adminToken) =>
    app.inject({
      method: 'POST',
      url: '/products',
      headers: { authorization: `Bearer ${token}` },
      payload,
    });

  const trialBalance = async () =>
    JSON.parse(
      (await app.inject({ method: 'GET', url: '/ledger/trial-balance', headers: auth() })).payload
    );

  const inventoryNet = async () => {
    const tb = await trialBalance();
    return tb.items.find((i: { account_code: string }) => i.account_code === 'INVENTORY').net_balance;
  };

  const stockValue = async () =>
    Number(
      (await pool.query(
        `SELECT COALESCE(SUM(s.qty_available * pv.cost_price), 0) AS v
         FROM stock s JOIN product_variations pv ON pv.id = s.product_variation_id`
      )).rows[0].v
    );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    pool = app.get<Pool>(PG_POOL);
    // These tests build products with several sizes.
    await pool.query("UPDATE settings SET value = 'true' WHERE key = 'use_sizes'");

    for (const table of [
      'till_movements', 'till_sessions', 'daily_cash_closings', 'courier_parcel_items', 'courier_parcels', 'courier_settlements',
      'return_items', 'returns', 'sale_items', 'sales', 'expenses', 'stock_transfer_items',
      'stock_transfers', 'stock_movements', 'stock', 'product_variations', 'products',
      'categories', 'brands', 'account_transactions', 'user_locations', 'users',
    ]) {
      await pool.query(`DELETE FROM ${table}`);
    }
    await pool.query("DELETE FROM accounts WHERE code LIKE 'CASH_%'");
    await pool.query('DELETE FROM locations WHERE is_system = false');

    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { name: 'Admin', email: 'admin.cat@aroption.com', password: 'admin-password', role: 'admin' },
    });
    adminToken = JSON.parse(
      (await app.inject({
        method: 'POST', url: '/auth/login',
        payload: { email: 'admin.cat@aroption.com', password: 'admin-password' },
      })).payload
    ).token;

    shopId = JSON.parse(
      (await app.inject({
        method: 'POST', url: '/shops', headers: auth(), payload: { name: 'Catalog Shop', code: 'CAT-01' },
      })).payload
    ).id;

    await app.inject({
      method: 'POST', url: '/auth/register', headers: auth(),
      payload: { name: 'Cashier', email: 'cashier.cat@aroption.com', password: 'cashier-password', role: 'cashier', shop_ids: [shopId] },
    });
    cashierToken = JSON.parse(
      (await app.inject({
        method: 'POST', url: '/auth/login',
        payload: { email: 'cashier.cat@aroption.com', password: 'cashier-password' },
      })).payload
    ).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives each size its own price and takes the next automatic code', async () => {
    const res = await createProduct({
      name: 'Slim Chino',
      category_name: 'Pants',
      brand_name: 'AR Option',
      variations: [
        { size: '30', cost_price: 700, selling_price: 1500 },
        { size: '32', cost_price: 720, selling_price: 1550 },
      ],
    });
    expect(res.statusCode).toBe(201);
    const product = JSON.parse(res.payload);
    expect(product.code).toMatch(/^\d{6}$/);
    expect(Number(product.code)).toBeGreaterThanOrEqual(100001);
    expect(product.variations.map((v: { selling_price: number }) => v.selling_price)).toEqual([1500, 1550]);
    expect(product.category_name).toBe('Pants');
    expect(product.brand_name).toBe('AR Option');
  });

  it('reuses a category and brand by name, ignoring case', async () => {
    await createProduct({ name: 'Second Chino', category_name: 'pants', brand_name: 'ar option', sizes: ['M'] });
    expect((await pool.query('SELECT COUNT(*) AS n FROM categories')).rows[0].n).toBe('1');
    expect((await pool.query('SELECT COUNT(*) AS n FROM brands')).rows[0].n).toBe('1');
  });

  it('shows the next code without using it up', async () => {
    const peek = () => app.inject({ method: 'GET', url: '/products/next-sku', headers: auth() });
    const first = JSON.parse((await peek()).payload).sku;
    const second = JSON.parse((await peek()).payload).sku;
    expect(second).toBe(first);
    const created = JSON.parse((await createProduct({ name: 'Peek Test', sizes: ['M'] })).payload);
    expect(created.code).toBe(first);
  });

  it('shares one code namespace between products and sizes', async () => {
    await createProduct({ name: 'Namespace Shirt', code: 'NS-1', sizes: ['M'] });

    const size = await app.inject({
      method: 'GET', url: '/products/sku-available?code=ns-1-m', headers: auth(),
    });
    expect(JSON.parse(size.payload)).toEqual({
      available: false,
      owner: { product_name: 'Namespace Shirt', size: 'M' },
    });

    const clash = await createProduct({ name: 'Other', code: 'NS-1-M', sizes: ['L'] });
    expect(clash.statusCode).toBe(400);
    expect(JSON.parse(clash.payload).message).toContain('Namespace Shirt');

    const free = await app.inject({ method: 'GET', url: '/products/sku-available?code=NS-2', headers: auth() });
    expect(JSON.parse(free.payload).available).toBe(true);
  });

  it('rejects the same size twice and negative prices', async () => {
    expect((await createProduct({ name: 'Dup', variations: [{ size: 'M' }, { size: 'm' }] })).statusCode).toBe(400);
    expect((await createProduct({ name: 'Neg', cost_price: -1, sizes: ['M'] })).statusCode).toBe(400);
  });

  it('keeps the ledger equal to the stock value when opening stock is added', async () => {
    const before = await inventoryNet();
    const res = await createProduct({
      name: 'Opening Tee',
      variations: [
        { size: 'M', cost_price: 300, selling_price: 700, opening_stock: [{ shop_id: shopId, quantity: 10 }] },
        { size: 'L', cost_price: 310, selling_price: 720, opening_stock: [{ shop_id: shopId, quantity: 5 }] },
      ],
    });
    expect(res.statusCode).toBe(201);

    expect(await inventoryNet()).toBe(before + 10 * 300 + 5 * 310);
    expect((await trialBalance()).isBalanced).toBe(true);
    expect(await inventoryNet()).toBe(await stockValue());
  });

  it('rolls everything back when one size has bad opening stock', async () => {
    const productsBefore = (await pool.query('SELECT COUNT(*) AS n FROM products')).rows[0].n;
    const stockBefore = await stockValue();
    const res = await createProduct({
      name: 'Half Saved',
      variations: [
        { size: 'M', cost_price: 100, opening_stock: [{ shop_id: shopId, quantity: 3 }] },
        { size: 'L', cost_price: 100, opening_stock: [{ shop_id: shopId, quantity: 0 }] },
      ],
    });
    expect(res.statusCode).toBe(400);
    expect((await pool.query('SELECT COUNT(*) AS n FROM products')).rows[0].n).toBe(productsBefore);
    expect(await stockValue()).toBe(stockBefore);
  });

  it('refuses opening stock in a system location', async () => {
    const courier = await pool.query("SELECT id FROM locations WHERE code = 'LOC-COURIER'");
    const res = await createProduct({
      name: 'System Stock',
      variations: [{ size: 'M', opening_stock: [{ shop_id: courier.rows[0].id, quantity: 1 }] }],
    });
    expect(res.statusCode).toBe(400);
  });

  it('adds stock to a saved size at that size\'s cost, with a ledger entry', async () => {
    const product = JSON.parse(
      (await createProduct({ name: 'Later Stock', variations: [{ size: 'M', cost_price: 200, selling_price: 500 }] })).payload
    );
    const before = await inventoryNet();
    const res = await app.inject({
      method: 'POST', url: '/products/initial-stock', headers: auth(),
      payload: { variation_id: product.variations[0].id, location_id: shopId, quantity: 4 },
    });
    expect(res.statusCode).toBe(201);
    expect(await inventoryNet()).toBe(before + 800);
    expect(await inventoryNet()).toBe(await stockValue());
  });

  it('lets a cashier read the catalog but not change it', async () => {
    const read = await app.inject({
      method: 'GET', url: '/products/categories', headers: { authorization: `Bearer ${cashierToken}` },
    });
    expect(read.statusCode).toBe(200);
    const write = await app.inject({
      method: 'POST', url: '/products/brands', headers: { authorization: `Bearer ${cashierToken}` },
      payload: { name: 'Nope' },
    });
    expect(write.statusCode).toBe(403);
  });

  it('lets the POS sell a size at its own price', async () => {
    const product = JSON.parse(
      (await createProduct({
        name: 'Priced Polo',
        variations: [
          { size: 'M', cost_price: 400, selling_price: 900, opening_stock: [{ shop_id: shopId, quantity: 5 }] },
          { size: 'XL', cost_price: 450, selling_price: 1000, opening_stock: [{ shop_id: shopId, quantity: 5 }] },
        ],
      })).payload
    );
    const xl = product.variations.find((v: { size: string }) => v.size === 'XL');
    const cash = (await pool.query("SELECT id FROM accounts WHERE code = 'CASH_CAT_01'")).rows[0].id;
    const sale = await app.inject({
      method: 'POST', url: '/pos/sales',
      headers: { ...auth(), 'x-shop-id': String(shopId) },
      payload: { payment_account_id: cash, items: [{ product_variation_id: xl.id, quantity: 2 }] },
    });
    expect(sale.statusCode).toBe(201);
    const body = JSON.parse(sale.payload);
    expect(body.total_amount).toBe(2000);
    expect(body.items[0].unit_cost).toBe(450);
    expect((await trialBalance()).isBalanced).toBe(true);
    expect(await inventoryNet()).toBe(await stockValue());
  });
});

describe('Catalog edit (e2e)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let shopId: number;
  let adminToken: string;
  let cashierToken: string;

  const auth = () => ({ authorization: `Bearer ${adminToken}` });
  const edit = (id: number, payload: object, token = adminToken) =>
    app.inject({ method: 'PUT', url: `/products/${id}`, headers: { authorization: `Bearer ${token}` }, payload });
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
  const create = async (payload: object) =>
    JSON.parse((await app.inject({ method: 'POST', url: '/products', headers: auth(), payload })).payload);

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    pool = app.get<Pool>(PG_POOL);
    // These tests build products with several sizes.
    await pool.query("UPDATE settings SET value = 'true' WHERE key = 'use_sizes'");

    for (const table of [
      'till_movements', 'till_sessions', 'daily_cash_closings', 'courier_parcel_items', 'courier_parcels', 'courier_settlements',
      'return_items', 'returns', 'sale_items', 'sales', 'expenses', 'stock_transfer_items',
      'stock_transfers', 'stock_movements', 'stock', 'product_variations', 'products',
      'categories', 'brands', 'account_transactions', 'user_locations', 'users',
    ]) {
      await pool.query(`DELETE FROM ${table}`);
    }
    await pool.query("DELETE FROM accounts WHERE code LIKE 'CASH_%'");
    await pool.query('DELETE FROM locations WHERE is_system = false');

    await app.inject({
      method: 'POST', url: '/auth/register',
      payload: { name: 'Admin', email: 'admin.ed@aroption.com', password: 'admin-password', role: 'admin' },
    });
    adminToken = JSON.parse(
      (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'admin.ed@aroption.com', password: 'admin-password' } })).payload
    ).token;
    shopId = JSON.parse(
      (await app.inject({ method: 'POST', url: '/shops', headers: auth(), payload: { name: 'Edit Shop', code: 'EDT-01' } })).payload
    ).id;
    await app.inject({
      method: 'POST', url: '/auth/register', headers: auth(),
      payload: { name: 'Cashier', email: 'cashier.ed@aroption.com', password: 'cashier-password', role: 'cashier', shop_ids: [shopId] },
    });
    cashierToken = JSON.parse(
      (await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'cashier.ed@aroption.com', password: 'cashier-password' } })).payload
    ).token;
  });

  afterAll(async () => {
    await app.close();
  });

  it('changes a price with no ledger entry', async () => {
    const p = await create({ name: 'Price Tee', variations: [{ size: 'M', cost_price: 100, selling_price: 250, opening_stock: [{ shop_id: shopId, quantity: 4 }] }] });
    const before = await inventoryNet();
    const res = await edit(p.id, { variations: [{ id: p.variations[0].id, selling_price: 300 }] });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).variations[0].selling_price).toBe(300);
    expect(await inventoryNet()).toBe(before);
  });

  it('revalues stock in every location when the cost changes, keeping ledger = stock value', async () => {
    const p = await create({
      name: 'Revalue Shirt',
      variations: [
        { size: 'M', cost_price: 100, selling_price: 250, opening_stock: [{ shop_id: shopId, quantity: 10 }] },
        { size: 'L', cost_price: 100, selling_price: 250, opening_stock: [{ shop_id: shopId, quantity: 5 }] },
      ],
    });
    // Park 3 units in a system location, which must be valued too.
    const transit = (await pool.query("SELECT id FROM locations WHERE code = 'LOC-TRANSIT'")).rows[0].id;
    await pool.query('UPDATE stock SET qty_available = qty_available - 3 WHERE product_variation_id = $1 AND location_id = $2', [p.variations[0].id, shopId]);
    await pool.query('INSERT INTO stock (product_variation_id, location_id, qty_available) VALUES ($1, $2, 3)', [p.variations[0].id, transit]);

    const before = await inventoryNet();
    const res = await edit(p.id, { variations: [{ id: p.variations[0].id, cost_price: 120 }] });
    expect(res.statusCode).toBe(200);
    expect(await inventoryNet()).toBe(before + 20 * 10);
    expect((await trialBalance()).isBalanced).toBe(true);
    expect(await inventoryNet()).toBe(await stockValue());

    const down = await edit(p.id, { variations: [{ id: p.variations[0].id, cost_price: 90 }] });
    expect(down.statusCode).toBe(200);
    expect(await inventoryNet()).toBe(await stockValue());
    expect((await trialBalance()).isBalanced).toBe(true);
  });

  it('adds a size with its own price and opening stock', async () => {
    const p = await create({ name: 'Grow Tee', variations: [{ size: 'M', cost_price: 50, selling_price: 120 }] });
    const before = await inventoryNet();
    const res = await edit(p.id, { variations: [{ size: 'XL', cost_price: 60, selling_price: 140, opening_stock: [{ shop_id: shopId, quantity: 2 }] }] });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.payload).variations).toHaveLength(2);
    expect(await inventoryNet()).toBe(before + 120);
    expect(await inventoryNet()).toBe(await stockValue());
  });

  it('adds stock to a saved size at its new cost, after restating what is already held', async () => {
    const p = await create({ name: 'Top Up Tee', variations: [{ size: 'M', cost_price: 100, selling_price: 250, opening_stock: [{ shop_id: shopId, quantity: 10 }] }] });
    const before = await inventoryNet();
    const res = await edit(p.id, { variations: [{ id: p.variations[0].id, cost_price: 110, opening_stock: [{ shop_id: shopId, quantity: 5 }] }] });
    expect(res.statusCode).toBe(200);
    expect(await inventoryNet()).toBe(before + 10 * 10 + 5 * 110);
    expect(await inventoryNet()).toBe(await stockValue());
    expect((await trialBalance()).isBalanced).toBe(true);
  });

  it('rejects a duplicate size, a foreign size id, and an unknown product', async () => {
    const a = await create({ name: 'A Tee', sizes: ['M'] });
    const b = await create({ name: 'B Tee', sizes: ['M'] });
    expect((await edit(a.id, { variations: [{ size: 'm' }] })).statusCode).toBe(400);
    expect((await edit(a.id, { variations: [{ id: b.variations[0].id, cost_price: 5 }] })).statusCode).toBe(404);
    expect((await edit(999999, { name: 'x' })).statusCode).toBe(404);
  });

  it('saves nothing when one part of the edit is bad', async () => {
    const p = await create({ name: 'Atomic Tee', variations: [{ size: 'M', cost_price: 10, selling_price: 20 }] });
    const res = await edit(p.id, { name: 'Renamed', variations: [{ id: p.variations[0].id, selling_price: 99 }, { size: 'M' }] });
    expect(res.statusCode).toBe(400);
    const after = JSON.parse((await app.inject({ method: 'GET', url: `/products/${p.id}`, headers: auth() })).payload);
    expect(after.name).toBe('Atomic Tee');
    expect(after.variations[0].selling_price).toBe(20);
  });

  it('lets a cashier read but not edit', async () => {
    const p = await create({ name: 'Locked Tee', sizes: ['M'] });
    expect((await edit(p.id, { name: 'Hacked' }, cashierToken)).statusCode).toBe(403);
  });
});
