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
  'sale_payments',
  'sale_items',
  'sales',
  'contacts',
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

test('POS complete flow: customer creation, SKU scan, park & resume, MultiPay split, and balanced books', async ({
  page,
  request,
}) => {
  await page.goto('/');

  // 1. Initial admin signup
  await page.getByLabel('Full Name').fill('Owner');
  await page.getByLabel('Email').fill('owner@aroption.com');
  await page.getByLabel('Password').fill('owner-password');
  await page.getByRole('button', { name: 'Create Account' }).click();
  await expect(page.locator('[data-testid="shop-chip"]')).toBeVisible();

  const token = await page.evaluate(() => localStorage.getItem('ar_option_token'));
  const headers = { authorization: `Bearer ${token}` };

  // 2. Create Shop
  const shop = await (
    await request.post(`${API}/shops`, { headers, data: { name: 'POS Main Shop', code: 'POS-01' } })
  ).json();

  // Create additional Card account for shop to allow MultiPay (Cash + Card)
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    `INSERT INTO accounts (code, name, type, location_id, is_active, payment_method)
     VALUES ('CARD_POS-01', 'Card - POS Main Shop', 'asset', $1, true, 'card')
     ON CONFLICT (code) DO NOTHING`,
    [shop.id]
  );
  await client.end();

  // 3. Create Product with 2 sizes
  const product = await (
    await request.post(`${API}/products`, {
      headers,
      data: {
        name: 'Premium Silk Panjabi',
        code: 'PAN-SILK',
        variations: [
          { size: 'M', sku: 'PAN-M-01', cost_price: 600, selling_price: 1500 },
          { size: 'L', sku: 'PAN-L-01', cost_price: 700, selling_price: 1800 },
        ],
      },
    })
  ).json();

  const varM = product.variations.find((v: { size: string }) => v.size === 'M');
  const varL = product.variations.find((v: { size: string }) => v.size === 'L');

  // 4. Seed initial stock: 5 units of M, 5 units of L
  await request.post(`${API}/products/initial-stock`, {
    headers,
    data: { variation_id: varM.id, location_id: shop.id, quantity: 5 },
  });
  await request.post(`${API}/products/initial-stock`, {
    headers,
    data: { variation_id: varL.id, location_id: shop.id, quantity: 5 },
  });

  // 5. Select active shop & navigate to POS
  await page.reload();
  await page.locator('[data-testid="shop-chip"]').click();
  await page.getByRole('button', { name: /POS Main Shop/ }).click();
  await page.locator('[data-testid="desktop-nav-pos"]').click();

  await expect(page.locator('text=Point of Sale')).toBeVisible();

  // 6. Verify Till chip in POS strip
  await expect(page.locator('[data-testid="pos-till-chip"]')).toBeVisible();

  // 7. Add Customer via "+ New" button in header
  await page.getByRole('button', { name: 'New' }).click();
  await expect(page.getByTestId('add-customer-modal')).toBeVisible();
  await page.getByLabel(/Customer Name/).fill('Karim Chowdhury');
  await page.getByLabel(/Mobile Number/).fill('01711223344');
  await page.getByRole('button', { name: /Save & Select Customer/ }).click();

  // Customer should be selected in the header
  await expect(page.getByText('Karim Chowdhury')).toBeVisible();

  // 8. One-tap add: Click the size card for M
  await page.getByRole('heading', { name: 'Premium Silk Panjabi' }).first().click();
  await expect(page.getByText('Current Order (1 item)')).toBeVisible();

  // 9. Barcode / SKU scanner: Type exact SKU into Enter SKU input
  const skuInput = page.getByLabel('Enter SKU');
  await skuInput.fill('PAN-L-01');
  await skuInput.press('Enter');

  // Cart now has 2 items: 1500 + 1800 = 3300
  await expect(page.getByText('Current Order (2 items)')).toBeVisible();
  await expect(page.getByText('৳3,300.00').first()).toBeVisible();

  // 10. Park / Suspend Cart (F8)
  await page.getByRole('button', { name: /Park/ }).click();
  await expect(page.getByText('Current Order (0 items)')).toBeVisible();
  await expect(page.locator('[data-testid="pos-suspended-chip"]')).toContainText('Parked (1)');

  // Resume the parked cart
  await page.locator('[data-testid="pos-suspended-chip"]').click();
  await expect(page.getByTestId('suspended-carts-modal')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();

  // Verify cart restored
  await expect(page.getByText('Current Order (2 items)')).toBeVisible();
  await expect(page.getByText('Karim Chowdhury')).toBeVisible();

  // 11. MultiPay Checkout (F4)
  await page.getByRole('button', { name: /MultiPay/ }).click();
  const multiModal = page.getByTestId('multipay-modal');
  await expect(multiModal).toBeVisible();
  await expect(multiModal.getByText('৳3,300.00').first()).toBeVisible();

  // Split: Change first row (Cash) to 2000, add row for Card 1300
  const firstAmountInput = multiModal.locator('input[type="number"]').first();
  await firstAmountInput.fill('2000');

  await multiModal.getByRole('button', { name: /Add.*Payment Method/ }).click();

  // Select Card account for the second row
  const secondRow = multiModal.locator('[data-testid="multipay-row"]').nth(1);
  const secondSelect = secondRow.locator('select');
  await secondSelect.selectOption({ index: 1 });
  const secondAmountInput = secondRow.locator('input[type="number"]');
  await secondAmountInput.fill('1300');

  // Submit MultiPay
  await multiModal.getByTestId('complete-multipay-button').click();

  // 12. Verify 80mm Thermal Receipt Modal
  await expect(page.getByText('RECEIPT #POS-01-000001')).toBeVisible();
  await expect(page.getByText('Karim Chowdhury')).toBeVisible();
  await expect(page.getByText('01711223344')).toBeVisible();
  await expect(page.getByText('Payment breakdown:')).toBeVisible();
  await expect(page.getByText(/2,000\.00/)).toBeVisible();
  await expect(page.getByText(/1,300\.00/)).toBeVisible();

  // 13. Verify books & ledger balance
  const trialBalance = await (await request.get(`${API}/ledger/trial-balance`, { headers })).json();
  expect(trialBalance.isBalanced).toBe(true);

  // Stock reduced: M has 4 left, L has 4 left
  const stock = await (await request.get(`${API}/reports/stock-by-shop`, { headers })).json();
  const rowM = stock.find((item: { variation_id: number }) => item.variation_id === varM.id);
  const rowL = stock.find((item: { variation_id: number }) => item.variation_id === varL.id);
  expect(rowM.stocks.find((s: { location_id: number }) => s.location_id === shop.id).qty).toBe(4);
  expect(rowL.stocks.find((s: { location_id: number }) => s.location_id === shop.id).qty).toBe(4);
});

test('POS phone layout fits 320px and 360px without horizontal scroll', async ({ browser, request }) => {
  const tokenRes = await request.post(`${API}/auth/login`, {
    data: { email: 'owner@aroption.com', password: 'owner-password' },
  });
  if (!tokenRes.ok()) return; // skip if previous test didn't run
  const { token } = await tokenRes.json();
  const headers = { authorization: `Bearer ${token}` };
  const shops = await (await request.get(`${API}/shops`, { headers })).json();
  if (shops.length === 0) return;
  const shop = shops[0];

  for (const width of [320, 360]) {
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
    await page.locator('[data-testid="mobile-nav-pos"]').click();
    await expect(page.locator('text=Point of Sale')).toBeVisible();

    // Verify no sideways scroll on phone viewport
    const noSidewaysScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(noSidewaysScroll).toBe(true);

    // Sticky bottom bar should be visible on phone
    await expect(page.getByRole('button', { name: /View Cart/ })).toBeVisible();
    await context.close();
  }
});

