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
  for (const table of [
    'till_movements', 'till_sessions', 'daily_cash_closings', 'courier_parcel_items', 'courier_parcels',
    'courier_settlements', 'return_items', 'returns', 'sale_items', 'sales', 'expenses',
    'stock_transfer_items', 'stock_transfers', 'stock_movements', 'stock', 'product_variations',
    'products', 'categories', 'brands', 'account_transactions', 'user_locations', 'users',
  ]) {
    await client.query(`DELETE FROM ${table}`);
  }
  await client.query("DELETE FROM accounts WHERE code LIKE 'CASH_%'");
  await client.query('DELETE FROM locations WHERE is_system = false');
  await client.end();
});

test('open the till, put cash in and out, close with a shortage, and the books balance', async ({ page, request }) => {
  await page.goto('/');
  await page.getByLabel('Full Name').fill('Owner');
  await page.getByLabel('Email').fill('owner@aroption.com');
  await page.getByLabel('Password').fill('owner-password');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('[data-testid="shop-chip"]')).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('ar_option_token'));
  const headers = { authorization: `Bearer ${token}` };
  const shop = await (
    await request.post(`${API}/shops`, { headers, data: { name: 'Till Shop', code: 'TILL-01' } })
  ).json();

  await page.reload();
  await page.locator('[data-testid="shop-chip"]').click();
  await page.getByRole('button', { name: /Till Shop/ }).click();

  // Dashboard card before any session.
  await expect(page.getByTestId('cash-in-hand-card')).toBeVisible();
  await expect(page.getByTestId('cash-in-hand-card').getByText('Till Closed')).toBeVisible();

  await page.locator('[data-testid="desktop-nav-cash-closing"]').click();
  await expect(page.getByTestId('till-badge')).toHaveText('Till Closed');

  // Open with a float of 1,000.
  await page.getByRole('button', { name: 'Open Till' }).click();
  await page.getByLabel('Opening float (৳)').fill('1000');
  await page.getByTestId('open-till-sheet').getByRole('button', { name: 'Open Till' }).click();
  await expect(page.getByTestId('till-badge')).toHaveText('Till Open');
  await expect(page.getByTestId('till-current-cash')).toHaveText('৳1,000.00');

  // Cash in 500.
  await page.getByRole('button', { name: 'Cash In' }).click();
  await page.getByLabel('Amount (৳)').fill('500');
  await page.getByTestId('cash-in-sheet').getByRole('button', { name: 'Add Cash' }).click();
  await expect(page.getByTestId('till-current-cash')).toHaveText('৳1,500.00');

  // Cash out 200 for a shop expense.
  await page.getByRole('button', { name: 'Cash Out' }).click();
  await page.getByLabel('Amount (৳)').fill('200');
  await page.getByTestId('cash-out-sheet').getByRole('button', { name: 'Take Cash Out' }).click();
  await expect(page.getByTestId('till-current-cash')).toHaveText('৳1,300.00');
  await expect(page.getByText('Petty Cash', { exact: true })).toBeVisible();

  // Close: the drawer holds 1,200, so it is 100 short.
  await page.getByRole('button', { name: 'Close & Handover' }).click();
  const sheet = page.getByTestId('close-till-sheet');
  await sheet.locator('#denom-1000').fill('1');
  await sheet.locator('#denom-100').fill('2');
  await expect(page.getByTestId('close-difference')).toHaveText('-৳100.00');
  await expect(sheet.getByRole('button', { name: 'Finish' })).toBeDisabled();
  await sheet.getByLabel(/Reason for the difference/).fill('Coins missing');
  await sheet.getByLabel('Cash collected by owner (৳)').fill('1000');
  await expect(page.getByTestId('close-retained')).toHaveText('৳200.00');
  await sheet.getByRole('button', { name: 'Finish' }).click();

  await expect(page.getByTestId('till-badge')).toHaveText('Till Closed');
  await expect(page.getByTestId('till-current-cash')).toHaveText('৳200.00');

  await page.getByRole('button', { name: 'History' }).click();
  await expect(page.getByText('-৳100.00 short').locator('visible=true').first()).toBeVisible();

  // The server agrees, and the books balance.
  const status = await (await request.get(`${API}/till/status`, { headers: { ...headers, 'x-shop-id': String(shop.id) } })).json();
  expect(status.ledger_cash).toBe(200);
  const tb = await (await request.get(`${API}/ledger/trial-balance`, { headers })).json();
  expect(tb.isBalanced).toBe(true);
  const net = (code: string) => tb.items.find((i: any) => i.account_code === code)?.net_balance;
  expect(net('OWNER_DRAWINGS')).toBe(-1000); // equity is shown credit minus debit
  expect(net('TILL_OVER_SHORT')).toBe(100);
});

for (const width of [320, 360]) {
  test(`the till view and sheets fit a ${width}px phone without sideways scrolling`, async ({ browser, request }) => {
    const login = await request.post(`${API}/auth/login`, {
      data: { email: 'owner@aroption.com', password: 'owner-password' },
    });
    const { token } = await login.json();
    const shopsRes = await request.get(`${API}/shops`, { headers: { authorization: `Bearer ${token}` } });
    const shops = await shopsRes.json();
    const shop = shops[0];

    const context = await browser.newContext({ viewport: { width, height: 640 }, hasTouch: true });
    const page = await context.newPage();
    await page.addInitScript(
      ({ t, s }) => {
        localStorage.setItem('ar_option_token', t);
        if (s) localStorage.setItem('ar_option_shop', String(s));
      },
      { t: token, s: shop?.id }
    );
    await page.goto('/');

    // Navigate to Till via Quick Launch or Cash in Hand card
    await page.locator('[data-testid="quick-nav-cash-closing"]').click();
    await expect(page.getByRole('heading', { name: 'Till', exact: true })).toBeVisible();

    const noSideways = async () => {
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
    };

    await noSideways();

    // Open Till sheet
    await page.getByRole('button', { name: 'Open Till' }).click();
    const openSheet = page.getByTestId('open-till-sheet');
    await expect(openSheet).toBeVisible();
    await noSideways();

    // Android back gesture closes the sheet
    await page.goBack();
    await expect(openSheet).toBeHidden();

    // History tab
    await page.getByRole('button', { name: 'History' }).click();
    await expect(page.locator('table')).toBeHidden(); // Cards on phone, table hidden
    await noSideways();

    await context.close();
  });
}

