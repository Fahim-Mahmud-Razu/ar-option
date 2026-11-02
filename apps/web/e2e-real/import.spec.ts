import { test, expect } from '@playwright/test';
import { Client } from 'pg';
import * as path from 'path';
import { fileURLToPath } from 'url';

const API = 'http://localhost:3001';
const here = path.dirname(fileURLToPath(import.meta.url));

const header = 'Product Name,Size,SKU,Category,Brand,Cost Price,Selling Price,Add Stock,Shop\r\n';
const csv = (body: string) => ({ name: 'catalog.csv', mimeType: 'text/csv', buffer: Buffer.from('﻿' + header + body) });

test.beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL || '';
  const { hostname } = new URL(databaseUrl);
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(`ABORT: Tests run only against local Docker database. Detected host: ${hostname}`);
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  for (const t of [
    'daily_cash_closings', 'courier_parcel_items', 'courier_parcels', 'courier_settlements',
    'return_items', 'returns', 'sale_items', 'sales', 'expenses', 'stock_transfer_items',
    'stock_transfers', 'stock_movements', 'stock', 'product_variations', 'products',
    'categories', 'brands', 'import_batches', 'account_transactions', 'user_locations', 'users',
  ]) {
    await client.query(`DELETE FROM ${t}`);
  }
  await client.query('ALTER SEQUENCE import_batch_seq RESTART');
  await client.query("DELETE FROM accounts WHERE code LIKE 'CASH_%'");
  await client.query('DELETE FROM locations WHERE is_system = false');
  await client.end();
});

test('import: errors block the commit, a fixed CSV and a real XLSX import, and the books balance', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Full Name').fill('Owner');
  await page.getByLabel('Email').fill('owner@aroption.com');
  await page.getByLabel('Password').fill('owner-password');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('[data-testid="shop-chip"]')).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('ar_option_token'));
  const headers = { authorization: `Bearer ${token}` };
  await request.post(`${API}/shops`, { headers, data: { name: 'Import Shop', code: 'XLS-01' } });

  await page.reload();
  await page.locator('[data-testid="shop-chip"]').click();
  await page.getByRole('button', { name: /Import Shop/ }).click();
  await page.locator('[data-testid="desktop-nav-products"]').click();
  await page.getByTestId('open-import').click();
  await expect(page.getByRole('heading', { name: 'Import Products' })).toBeVisible();

  // A bad row turns Import off and says why.
  await page.getByTestId('import-file').setInputFiles(
    csv('Import Tee,M,,Tees,AR Option,100,250,5,\r\nBroken Tee,M,,Tees,AR Option,100,,5,\r\n')
  );
  await expect(page.getByRole('status').filter({ hasText: 'Import is off' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Import \d+ Rows Now/ })).toBeDisabled();
  await page.locator('table').getByText('A new size needs a Selling Price above zero.').waitFor();

  // Tapping the Errors tile shows only the bad row.
  await page.getByRole('button', { name: /Errors/ }).click();
  await expect(page.locator('table tbody tr')).toHaveCount(1);

  // A fixed file imports. Rows with no Shop use the shop in the top bar.
  await page.getByTestId('import-file').setInputFiles(
    csv('Import Tee,M,,Tees,AR Option,100,250,5,\r\nImport Tee,L,,Tees,AR Option,100,250,3,\r\n')
  );
  await expect(page.getByText('All 2 rows passed')).toBeVisible();
  await page.getByRole('button', { name: 'Import 2 Rows Now' }).click();
  await expect(page.getByText('Catalog imported')).toBeVisible();
  await expect(page.getByText('IMP-000001')).toBeVisible();

  const net = async () => {
    const tb = await (await request.get(`${API}/ledger/trial-balance`, { headers })).json();
    return { inventory: tb.items.find((i: { account_code: string }) => i.account_code === 'INVENTORY').net_balance, balanced: tb.isBalanced };
  };
  expect(await net()).toEqual({ inventory: 800, balanced: true });

  // A real Excel file, with a number-typed SKU and Bengali text.
  await page.getByRole('button', { name: 'Import Another File' }).click();
  await page.getByTestId('import-file').setInputFiles(path.join(here, 'fixtures', 'catalog.xlsx'));
  await expect(page.getByText('All 3 rows passed')).toBeVisible();
  await expect(page.locator('table').getByText('এক্সেল পাঞ্জাবি').first()).toBeVisible();
  await page.getByRole('button', { name: 'Import 3 Rows Now' }).click();
  await expect(page.getByText('IMP-000002')).toBeVisible();

  const products = await (await request.get(`${API}/products`, { headers })).json();
  expect(products.find((p: { code: string }) => p.code === '555123').name).toBe('Sheet Cap');
  expect(products.some((p: { name: string }) => p.name === 'এক্সেল পাঞ্জাবি')).toBe(true);
  expect(await net()).toEqual({ inventory: 800 + 6 * 900 + 4 * 900 + 10 * 120, balanced: true });

  // The same file again changes nothing.
  await page.getByRole('button', { name: 'Import Another File' }).click();
  await page.getByTestId('import-file').setInputFiles(path.join(here, 'fixtures', 'catalog.xlsx'));
  await expect(page.getByText('All 3 rows passed')).toBeVisible();
  await expect(page.getByRole('button', { name: /Unchanged/ })).toContainText('0');

  // Back leaves the page and the stock list shows the new products.
  await page.getByTestId('import-back').click();
  await expect(page.getByText('Products & Inventory')).toBeVisible();
  await expect(page.locator('table').getByText('Sheet Cap').first()).toBeVisible();
});

test('a damaged file and a legacy .xls give plain messages', async ({ page, request }) => {
  const login = await request.post(`${API}/auth/login`, { data: { email: 'owner@aroption.com', password: 'owner-password' } });
  const { token } = await login.json();
  await page.addInitScript((t) => localStorage.setItem('ar_option_token', t), token);
  await page.goto('/');
  await page.locator('[data-testid="desktop-nav-products"]').click();
  await page.getByTestId('open-import').click();

  await page.getByTestId('import-file').setInputFiles({ name: 'old.xls', mimeType: 'application/vnd.ms-excel', buffer: Buffer.from('x') });
  await expect(page.getByRole('alert')).toContainText('Old .xls files are not supported');

  await page.getByTestId('import-file').setInputFiles({ name: 'latin.csv', mimeType: 'text/csv', buffer: Buffer.from([0x50, 0x72, 0xe9, 0x2c, 0x0a, 0x31]) });
  await expect(page.getByRole('alert')).toContainText('CSV UTF-8');
});

for (const width of [320, 360]) {
  test(`the import preview fits a ${width}px phone, with cards instead of a table`, async ({ browser, request }) => {
    const { token } = await (await request.post(`${API}/auth/login`, { data: { email: 'owner@aroption.com', password: 'owner-password' } })).json();
    const context = await browser.newContext({ viewport: { width, height: 640 }, hasTouch: true });
    const page = await context.newPage();
    await page.addInitScript((t) => localStorage.setItem('ar_option_token', t), token);
    await page.goto('/');
    await page.locator('[data-testid="mobile-nav-products"]').click();
    await page.getByTestId('open-import').click();
    await page.getByTestId('import-file').setInputFiles(
      csv('A Very Long Product Name That Wraps Across Several Lines Tee,M,,Tees,AR Option,100,250,5,\r\nBroken,M,,Tees,AR Option,100,,5,\r\n')
    );

    await expect(page.getByRole('list', { name: 'Preview rows' })).toBeVisible();
    await expect(page.locator('table')).toBeHidden();
    await expect(page.getByRole('button', { name: /Import \d+ Rows Now/ })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await page.goBack();
    await expect(page.getByTestId('open-import')).toBeVisible();
    await context.close();
  });
}
