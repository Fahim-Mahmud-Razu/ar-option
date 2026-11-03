import { test, expect } from '@playwright/test';
import { Client } from 'pg';

const API = 'http://localhost:3001';

test.beforeAll(async () => {
  const databaseUrl = process.env.DATABASE_URL || '';
  const { hostname } = new URL(databaseUrl);
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    throw new Error(`ABORT: Tests run only against local Docker database. Detected host: ${hostname}`);
  }
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  for (const t of [
    'till_movements', 'till_sessions', 'daily_cash_closings', 'courier_parcel_items', 'courier_parcels', 'courier_settlements',
    'return_items', 'returns', 'sale_payments', 'sale_items', 'sales', 'expenses', 'stock_transfer_items',
    'stock_transfers', 'stock_movements', 'stock', 'import_batches', 'product_variations', 'products',
    'categories', 'brands', 'account_transactions', 'user_locations', 'users',
  ]) {
    await client.query(`DELETE FROM ${t}`);
  }
  await client.query('DELETE FROM accounts WHERE location_id IN (SELECT id FROM locations WHERE is_system = false)');
  await client.query('DELETE FROM locations WHERE is_system = false');
  // The client's business: no sizes.
  await client.query("UPDATE settings SET value = 'false' WHERE key = 'use_sizes'");
  await client.end();
});

test('with sizes off, a product has one price and sells with no size anywhere; a shop can be renamed; a reset backs up first', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Full Name').fill('Owner');
  await page.getByLabel('Email').fill('owner.settings@aroption.com');
  await page.getByLabel('Password').fill('owner-password');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('[data-testid="shop-chip"]')).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('ar_option_token'));
  const headers = { authorization: `Bearer ${token}` };
  await request.post(`${API}/shops`, { headers, data: { name: 'Gulshan', code: 'GUL' } });

  // Add Product shows one Price and Stock group, with no size chips or size table.
  await page.reload();
  await page.locator('[data-testid="shop-chip"]').click();
  await page.getByRole('button', { name: 'Gulshan GUL' }).click();
  await page.locator('[data-testid="desktop-nav-products"]').click();
  await page.getByTestId('add-product').click();
  await expect(page.getByRole('heading', { name: 'Price and Stock' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sizes and Prices' })).toBeHidden();
  await expect(page.getByRole('group', { name: 'Add a size' })).toBeHidden();

  await page.getByLabel('Product Name').fill('Plain Panjabi');
  await page.getByRole('button', { name: '+ New category' }).click();
  await page.getByLabel('New category name').fill('Panjabi');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: '+ New brand' }).click();
  await page.getByLabel('New brand name').fill('AR Option');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByLabel('Cost', { exact: true }).fill('500');
  await page.getByLabel('Selling price', { exact: true }).fill('1200');
  await page.getByLabel('Opening stock in Gulshan').fill('5');
  await page.getByRole('button', { name: 'Save Product' }).click();
  await expect(page.getByText('Products & Inventory')).toBeVisible();
  await expect(page.locator('table').getByText('Standard')).toHaveCount(0);

  const list = await (await request.get(`${API}/products`, { headers })).json();
  const product = list.find((p: { name: string }) => p.name === 'Plain Panjabi');
  expect(product.variations).toHaveLength(1);
  expect(product.variations[0].sku).toBe(product.code);

  // Rename the active shop. The chip shows the new name without a reload.
  await page.locator('[data-testid="desktop-nav-settings"]').click();
  await page.getByRole('button', { name: 'Edit Gulshan' }).click();
  await page.getByLabel('Shop Name').fill('Gulshan Avenue');
  await page.getByTestId('edit-shop-sheet').getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText("Shop renamed to 'Gulshan Avenue'.")).toBeVisible();
  await expect(page.locator('[data-testid="shop-chip"]')).toContainText('Gulshan Avenue');

  // Sell it. No size badge on the card, the cart or the receipt.
  await page.locator('[data-testid="desktop-nav-pos"]').click();
  await page.getByRole('heading', { name: 'Plain Panjabi' }).click();
  await expect(page.getByText(/Size:/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Cash ৳1,200.00' }).click();
  await expect(page.getByText('RECEIPT #GUL-000001')).toBeVisible();
  await expect(page.getByText('Item [Size]')).toHaveCount(0);
  await expect(page.getByText('[Standard]')).toHaveCount(0);
  await page.goto('/?tab=settings');

  // Clear transactions: a backup downloads first, then stock and sales are gone and the product stays.
  await page.getByTestId('reset-transactions').click();
  const confirm = page.getByTestId('confirm-reset');
  await expect(confirm).toBeDisabled();
  await page.getByLabel(/to confirm/).fill('RESET');
  const download = page.waitForEvent('download');
  await confirm.click();
  expect((await download).suggestedFilename()).toMatch(/^ar-option-backup-.*\.json$/);
  await page.waitForURL(/\/$/);

  const tb = await (await request.get(`${API}/ledger/trial-balance`, { headers })).json();
  expect(tb.totalDebit).toBe(0);
  expect(tb.totalCredit).toBe(0);
  const after = await (await request.get(`${API}/products`, { headers })).json();
  expect(after.map((p: { name: string }) => p.name)).toContain('Plain Panjabi');
});
