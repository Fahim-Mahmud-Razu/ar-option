import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const API = 'http://localhost:3001';

const wipeTables = [
  'till_movements',
  'till_sessions',
  'daily_cash_closings',
  'courier_parcel_items',
  'courier_parcels',
  'courier_settlements',
  'return_items',
  'returns',
  'sale_items',
  'sales',
  'expenses',
  'stock_transfer_items',
  'stock_transfers',
  'stock_movements',
  'stock',
  'product_variations',
  'products',
  'categories',
  'brands',
  'account_transactions',
  'user_locations',
  'users',
];

test.beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL || '';
  const { hostname } = new URL(databaseUrl);
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(`ABORT: Tests run only against local Docker database. Detected host: ${hostname}`);
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  for (const table of wipeTables) {
    await client.query(`DELETE FROM ${table}`);
  }
  await client.query("DELETE FROM accounts WHERE code LIKE 'CASH_%' OR code LIKE 'CARD_%' OR code LIKE 'BKASH_%'");
  await client.query('DELETE FROM locations WHERE is_system = false');
  await client.end();
});

test('first admin signs up, sells from the browser, and the books balance', async ({ page, request }) => {
  await page.goto('/');

  // Fresh database: the login screen creates the first admin.
  await page.getByLabel('Full Name').fill('Owner');
  await page.getByLabel('Email').fill('owner@aroption.com');
  await page.getByLabel('Password').fill('owner-password');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('[data-testid="shop-chip"]')).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('ar_option_token'));
  const headers = { authorization: `Bearer ${token}` };

  const shop = await (
    await request.post(`${API}/shops`, { headers, data: { name: 'Real Shop', code: 'REAL-01' } })
  ).json();
  const product = await (
    await request.post(`${API}/products`, {
      headers,
      data: { name: 'Real Panjabi', code: 'REAL-PAN', cost_price: 500, selling_price: 1200 },
    })
  ).json();
  const variationId = product.variations[0].id;
  await request.post(`${API}/products/initial-stock`, {
    headers,
    data: { variation_id: variationId, location_id: shop.id, quantity: 5 },
  });

  // A session survives a reload.
  await page.reload();
  await page.locator('[data-testid="shop-chip"]').click();
  await page.getByRole('button', { name: /Real Shop/ }).click();
  await page.locator('[data-testid="desktop-nav-pos"]').click();

  await page.getByRole('heading', { name: 'Real Panjabi' }).click();
  await page.getByRole('button', { name: 'Proceed to Checkout' }).click();
  await page.getByRole('button', { name: /Complete Sale/ }).click();

  await expect(page.getByText('RECEIPT #REAL-01-000001')).toBeVisible();

  const stock = await (await request.get(`${API}/reports/stock-by-shop`, { headers })).json();
  const row = stock.find((item: { variation_id: number }) => item.variation_id === variationId);
  const here = row.stocks.find((s: { location_id: number }) => s.location_id === shop.id);
  expect(here.qty).toBe(4);

  const trialBalance = await (await request.get(`${API}/ledger/trial-balance`, { headers })).json();
  expect(trialBalance.isBalanced).toBe(true);
  // 2,500 opening stock (5 at cost 500) + 1,200 sale + 500 cost of goods.
  expect(trialBalance.totalDebit).toBe(4200);
});
