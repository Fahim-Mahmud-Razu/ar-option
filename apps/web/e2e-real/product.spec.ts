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
    'return_items', 'returns', 'sale_items', 'sales', 'expenses', 'stock_transfer_items',
    'stock_transfers', 'stock_movements', 'stock', 'product_variations', 'products',
    'categories', 'brands', 'account_transactions', 'user_locations', 'users',
  ]) {
    await client.query(`DELETE FROM ${t}`);
  }
  await client.query("DELETE FROM accounts WHERE code LIKE 'CASH_%' OR code LIKE 'CARD_%' OR code LIKE 'BKASH_%'");
  await client.query('DELETE FROM locations WHERE is_system = false');
  await client.end();
});

test('admin adds a product with sizes and stock, then edits a cost and the books follow', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Full Name').fill('Owner');
  await page.getByLabel('Email').fill('owner@aroption.com');
  await page.getByLabel('Password').fill('owner-password');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('[data-testid="shop-chip"]')).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('ar_option_token'));
  const headers = { authorization: `Bearer ${token}` };
  await request.post(`${API}/shops`, { headers, data: { name: 'Form Shop', code: 'FRM-01' } });

  await page.reload();
  await page.locator('[data-testid="desktop-nav-products"]').click();
  await page.getByTestId('add-product').click();

  // Leaving with unsaved input asks first, and Cancel keeps the form.
  await page.getByLabel('Product Name').fill('Form Polo');
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByTestId('product-back').click();
  await expect(page.getByLabel('Product Name')).toHaveValue('Form Polo');

  // Missing category and brand are reported next to the fields.
  await page.getByRole('button', { name: 'Save Product' }).click();
  await expect(page.getByText('Choose a category.')).toBeVisible();
  await expect(page.getByText('Choose a brand.')).toBeVisible();

  await page.getByRole('button', { name: '+ New category' }).click();
  await page.getByLabel('New category name').fill('Polo Shirts');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await page.getByRole('button', { name: '+ New brand' }).click();
  await page.getByLabel('New brand name').fill('AR Option');
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  const table = page.locator('table');
  await table.getByLabel('Cost for M').fill('400');
  await table.getByLabel('Margin for M').fill('50');
  await expect(table.getByLabel('Selling price for M')).toHaveValue('600');
  await page.getByRole('button', { name: 'Copy first row to all' }).click();
  await expect(table.getByLabel('Selling price for XL')).toHaveValue('600');
  await table.getByLabel('Opening stock of M in Form Shop').fill('10');
  await table.getByLabel('Opening stock of L in Form Shop').fill('5');

  await page.getByRole('button', { name: 'Save Product' }).click();
  await expect(page.getByText('Products & Inventory')).toBeVisible();
  await expect(page.locator('table').getByText('Form Polo').first()).toBeVisible();

  const list = await (await request.get(`${API}/products`, { headers })).json();
  const product = list.find((p: { name: string }) => p.name === 'Form Polo');
  expect(product.code).toMatch(/^\d{6}$/);
  expect(product.variations.map((v: { size: string }) => v.size)).toEqual(['M', 'L', 'XL']);

  const net = async () => {
    const tb = await (await request.get(`${API}/ledger/trial-balance`, { headers })).json();
    return tb.items.find((i: { account_code: string }) => i.account_code === 'INVENTORY').net_balance;
  };
  expect(await net()).toBe(15 * 400);

  // Edit: raising the cost of M shows the stock value impact before saving.
  await page.getByRole('button', { name: 'Edit Form Polo' }).first().click();
  await expect(page.getByLabel('Product Name')).toHaveValue('Form Polo');
  await expect(page.locator('table').getByLabel('SKU for M')).toBeDisabled();
  await page.locator('table').getByLabel('Cost for M').fill('420');
  await expect(page.getByRole('status')).toContainText('+৳200.00');
  await page.getByRole('button', { name: 'Save Changes' }).click();
  await expect(page.getByText('Products & Inventory')).toBeVisible();

  expect(await net()).toBe(15 * 400 + 10 * 20);
  const tb = await (await request.get(`${API}/ledger/trial-balance`, { headers })).json();
  expect(tb.isBalanced).toBe(true);
});

for (const width of [320, 360]) {
  test(`the product form fits a ${width}px phone without sideways scrolling`, async ({ browser, request }) => {
    const login = await request.post(`${API}/auth/login`, {
      data: { email: 'owner@aroption.com', password: 'owner-password' },
    });
    const { token } = await login.json();

    const context = await browser.newContext({ viewport: { width, height: 640 }, hasTouch: true });
    const page = await context.newPage();
    await page.addInitScript((t) => localStorage.setItem('ar_option_token', t), token);
    await page.goto('/');
    await page.locator('[data-testid="mobile-nav-products"]').click();
    await page.getByTestId('add-product').click();

    // Phone shows size cards, not the table.
    await expect(page.locator('table')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Save Product' })).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // Back with the system back gesture leaves the form.
    await page.goBack();
    await expect(page.getByTestId('add-product')).toBeVisible();
    await context.close();
  });
}
