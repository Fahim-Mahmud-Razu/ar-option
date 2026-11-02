import { test, expect } from '@playwright/test';

// Rule 10 check: Test scripts abort unless DATABASE_URL host is localhost or 127.0.0.1
test.beforeAll(() => {
  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    const parsed = new URL(dbUrl);
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
      throw new Error(`ABORT: Tests run only against local Docker database. Detected host: ${parsed.hostname}`);
    }
  }
});

test.describe('App Shell Smoke Test', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept API routes with mock data for standalone web verification
    await page.route('**/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', migration: 5 }),
      });
    });
    await page.route('**/shops', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Gulshan Branch', code: 'GUL-01', is_active: true },
          { id: 2, name: 'Dhanmondi Branch', code: 'DHM-01', is_active: true },
        ]),
      });
    });
    await page.route('**/ledger/trial-balance*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], totalDebit: 0, totalCredit: 0, isBalanced: true }),
      });
    });
    await page.route('**/reports/stock-by-shop', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            product_id: 1,
            product_name: 'Classic Polo Shirt',
            product_code: 'POLO-01',
            variation_id: 10,
            size: 'L',
            sku: 'POLO-01-L',
            cost_price: 500,
            selling_price: 950,
            stocks: [
              { location_id: 1, location_name: 'Gulshan Branch', location_code: 'GUL-01', is_system: false, qty: 15 },
              { location_id: 2, location_name: 'Dhanmondi Branch', location_code: 'DHM-01', is_system: false, qty: 5 },
            ],
          },
        ]),
      });
    });
    await page.route('**/expenses/categories', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Rent', is_active: true },
          { id: 2, name: 'Utilities', is_active: true },
        ]),
      });
    });
    await page.route('**/expenses*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/returns*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/courier/summary*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          money_with_couriers: 4500,
          delivered_unpaid_count: 2,
          out_now_count: 3,
          returned_count: 1,
        }),
      });
    });
    await page.route('**/courier/parcels*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            parcel_code: 'PAR-GUL-000001',
            location_id: 1,
            customer_name: 'Sadman Sakib',
            customer_phone: '01711223344',
            customer_address: 'House 5, Road 2, Gulshan, Dhaka',
            courier_name: 'Steadfast',
            tracking_number: 'ST-10029',
            order_value: 2000,
            advance_amount: 300,
            collectible_amount: 1700,
            delivery_charge: 100,
            delivery_status: 'delivered',
            payment_status: 'unpaid',
            created_at: new Date().toISOString(),
          },
        ]),
      });
    });
    await page.route('**/courier/settlements*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/ledger/accounts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 10, code: 'CASH_GUL-01', name: 'Cash - Gulshan Branch', type: 'asset' },
        ]),
      });
    });
    await page.route('**/cash-closing/drawer-summary*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shop_id: 1,
          shop_name: 'Gulshan Branch',
          shop_code: 'GUL-01',
          cash_account_code: 'CASH_GUL-01',
          opening_cash: 5000,
          cash_sales: 12500,
          cash_expenses: 1200,
          cash_returns: 800,
          system_expected_cash: 15500,
        }),
      });
    });
    await page.route('**/cash-closing*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
  });

  test('loads page and verifies header, API status and migration number', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/AR Option/);
    const title = page.locator('h1');
    await expect(title).toHaveText('AR Option');

    const apiStatus = page.locator('[data-testid="api-status"]');
    await expect(apiStatus).toBeVisible();

    const migrationNumber = page.locator('[data-testid="migration-number"]');
    await expect(migrationNumber).toBeVisible();
    await expect(migrationNumber).toHaveText(/v\d+/);
    await expect(apiStatus).toContainText('ok');
  });

  test('navigates to POS terminal and verifies search-first catalog and cart', async ({ page }) => {
    await page.goto('/');

    const posNav = page.locator('[data-testid$="-pos"]:visible').first();
    await posNav.click();

    await expect(page.locator('text=Point of Sale')).toBeVisible();
    const searchInput = page.locator('input[placeholder*="Search by product name"]');
    await expect(searchInput).toBeVisible();
    await expect(page.locator('text=Classic Polo Shirt')).toBeVisible();
  });

  test('navigates to Return & Exchange screen and verifies 3-step net calculation', async ({ page }) => {
    await page.goto('/');

    const returnsNav = page.locator('[data-testid$="-returns"]:visible').first();
    await returnsNav.click();

    await expect(page.getByRole('heading', { name: 'Return & Exchange' })).toBeVisible();
    await expect(page.locator(':visible:has-text("Net Amount")').first()).toBeVisible();
  });

  test('navigates to Courier & Settlement screen and verifies Two Tracks Rule badges', async ({ page }) => {
    await page.goto('/');

    const courierNav = page.locator('[data-testid$="-courier"]:visible').first();
    await courierNav.click();

    await expect(page.getByRole('heading', { name: 'Courier & Settlement' })).toBeVisible();
    await expect(page.locator('text=Money with Couriers')).toBeVisible();
    await expect(page.locator(':visible:has-text("PAR-GUL-000001")').first()).toBeVisible();
    await expect(page.locator(':visible:has-text("delivered")').first()).toBeVisible();
    await expect(page.locator(':visible:has-text("unpaid")').first()).toBeVisible();
  });

  test('navigates to Products & Stock and toggles between Grid and Bulk Import', async ({ page }) => {
    await page.goto('/');

    const productsNav = page.locator('[data-testid$="-products"]:visible').first();
    await productsNav.click();

    await expect(page.locator('text=Products & Inventory')).toBeVisible();
    await expect(page.locator('button:has-text("Stock Grid")')).toBeVisible();
    await expect(page.locator('button:has-text("Bulk Import")')).toBeVisible();

    await page.click('button:has-text("Bulk Import")');
    await expect(page.locator('text=Bulk Product Import')).toBeVisible();
    await expect(page.locator('button:has-text("Load Sample Apparel Data")')).toBeVisible();
  });

  test('navigates to Daily Cash Closing screen and verifies drawer reconciliation', async ({ page }) => {
    await page.goto('/');

    const cashNav = page.locator('[data-testid$="-cash-closing"]:visible').first();
    await cashNav.click();

    await expect(page.getByRole('heading', { name: 'Daily Cash Closing' })).toBeVisible();
    await expect(page.locator('text=Physical Drawer Cash Count')).toBeVisible();
    await expect(page.locator(':visible:has-text("System Expected")').first()).toBeVisible();
    await expect(page.locator(':visible:has-text("৳15500.00")').first()).toBeVisible();
  });
});
