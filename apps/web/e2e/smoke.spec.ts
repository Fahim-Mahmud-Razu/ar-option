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
  test('loads placeholder page and verifies header and layout', async ({ page }) => {
    // Intercept health and shops if backend is not running during standalone web tests
    await page.route('**/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', migration: 2 }),
      });
    });
    await page.route('**/shops', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 1, name: 'Main Branch', code: 'MAIN' }]),
      });
    });
    await page.route('**/ledger/trial-balance', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], totalDebit: 0, totalCredit: 0, isBalanced: true }),
      });
    });

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
});

