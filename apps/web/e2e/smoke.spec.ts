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
        body: JSON.stringify({ status: 'ok', migration: 4 }),
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
    await page.route('**/ledger/accounts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 10, code: 'CASH_GUL-01', name: 'Cash - Gulshan Branch', type: 'asset' },
        ]),
      });
    });
  });

  test('loads page and verifies header, API status and migration number', async ({ page }) => {
    await page.goto('/');

    // Check title and branding
    await expect(page).toHaveTitle(/AR Option/);
    const title = page.locator('h1');
    await expect(title).toHaveText('AR Option');

    // Check presence of API status and migration indicators
    const apiStatus = page.locator('[data-testid="api-status"]');
    await expect(apiStatus).toBeVisible();

    const migrationNumber = page.locator('[data-testid="migration-number"]');
    await expect(migrationNumber).toBeVisible();
    await expect(migrationNumber).toHaveText(/v\d+/);
    await expect(apiStatus).toContainText('ok');
  });

  test('navigates to POS terminal and verifies search-first catalog and cart', async ({ page }) => {
    await page.goto('/');

    // Click visible POS nav button (handles mobile bottom tabs, tablet rail, or desktop sidebar)
    const posNav = page.locator('[data-testid$="-pos"]:visible').first();
    await posNav.click();

    // Verify Point of Sale screen is active
    await expect(page.locator('text=Point of Sale')).toBeVisible();

    // Verify search input is present
    const searchInput = page.locator('input[placeholder*="Search by product name"]');
    await expect(searchInput).toBeVisible();

    // Verify catalog item appears from mocked stock-by-shop
    await expect(page.locator('text=Classic Polo Shirt')).toBeVisible();
  });

  test('navigates to Daily Expenses screen and verifies record button', async ({ page }) => {
    await page.goto('/');

    const expensesNav = page.locator('[data-testid$="-expenses"]:visible').first();
    await expensesNav.click();

    await expect(page.locator('text=Shop Daily Expenses')).toBeVisible();
    await expect(page.locator('button:has-text("Record New Expense")')).toBeVisible();
  });

  test('navigates to Products & Stock and toggles between Grid and Bulk Import', async ({ page }) => {
    await page.goto('/');

    const productsNav = page.locator('[data-testid$="-products"]:visible').first();
    await productsNav.click();

    await expect(page.locator('text=Products & Inventory')).toBeVisible();
    await expect(page.locator('button:has-text("Stock Grid")')).toBeVisible();
    await expect(page.locator('button:has-text("Bulk Import")')).toBeVisible();

    // Switch to Bulk Import
    await page.click('button:has-text("Bulk Import")');
    await expect(page.locator('text=Bulk Product Import')).toBeVisible();
    await expect(page.locator('button:has-text("Load Sample Apparel Data")')).toBeVisible();
  });
});
