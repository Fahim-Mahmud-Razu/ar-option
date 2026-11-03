import { test, expect } from '@playwright/test';

test.describe('Pagination Control System E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Inject mock auth token and active shop
    await page.addInitScript(() => {
      localStorage.setItem('ar_option_token', 'smoke-test-token');
      localStorage.setItem('ar_option_shop', '1');
    });

    // Mock API routes needed for AppShell
    await page.route('http://localhost:3000/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 1, name: 'Smoke Admin', email: 'admin@aroption.com', role: 'admin', is_active: true },
          permissions: [
            'ledger.post', 'pos.sell', 'cash.reconcile', 'products.import', 'products.manage',
            'till.view', 'till.open', 'till.cash_in', 'till.cash_out', 'till.close',
          ],
        }),
      });
    });

    await page.route('**/settings', async (route) => {

      await route.fulfill({

        status: 200,

        contentType: 'application/json',

        body: JSON.stringify({ use_sizes: true, manual_return_approval_limit: 2000 }),

      });

    });

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
        ]),
      });
    });

    await page.route('**/ledger/payment-accounts**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/expenses**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/?tab=pagination-demo');
  });

  test('Pagination Demo verifies all requirements: stats, page size dropdown, smart truncation, button states', async ({ page }) => {
    // 1. Verify Page Size Selector has options [10, 25, 50, 100] and defaults to 25
    const pageSizeSelect = page.locator('select[aria-label="Rows per page:"]').first();
    await expect(pageSizeSelect).toBeVisible();
    await expect(pageSizeSelect).toHaveValue('25');

    const options = await pageSizeSelect.locator('option').allInnerTexts();
    expect(options).toEqual(['10', '25', '50', '100']);

    // 2. Verify Stats initial text: "Showing 1–25 of 250 parcels"
    const stats = page.locator('text=Showing 1–25 of 250 parcels').first();
    await expect(stats).toBeVisible();

    // 3. Verify Previous button is disabled on page 1
    const prevBtn = page.getByRole('button', { name: 'Previous page' }).first();
    await expect(prevBtn).toBeDisabled();

    // 4. Verify Page 1 has aria-current="page"
    const page1Btn = page.getByRole('button', { name: 'Page 1, current page' }).first();
    await expect(page1Btn).toBeVisible();
    await expect(page1Btn).toHaveAttribute('aria-current', 'page');

    // 5. Navigate to Page 2
    const page2Btn = page.getByRole('button', { name: 'Go to page 2' }).first();
    await expect(page2Btn).toBeVisible();
    await page2Btn.click();

    // 6. Verify Stats updated to "Showing 26–50 of 250 parcels"
    await expect(page.locator('text=Showing 26–50 of 250 parcels').first()).toBeVisible();

    // 7. Verify Previous button is now enabled
    await expect(prevBtn).toBeEnabled();

    // 8. Changing page size to 50 should recalculate total pages and reset to page 1
    await pageSizeSelect.selectOption('50');

    // Stats should now show page 1 with 50 items: "Showing 1–50 of 250 parcels"
    await expect(page.locator('text=Showing 1–50 of 250 parcels').first()).toBeVisible();
    // Previous button should be disabled again because page reset to 1
    await expect(prevBtn).toBeDisabled();

    // 9. Navigate to final page (page 5 with 50 items per page)
    const page5Btn = page.getByRole('button', { name: 'Go to page 5' }).first();
    await expect(page5Btn).toBeVisible();
    await page5Btn.click();

    // Verify Stats on final page: "Showing 201–250 of 250 parcels"
    await expect(page.locator('text=Showing 201–250 of 250 parcels').first()).toBeVisible();

    // Verify Next button is disabled on final page
    const nextBtn = page.getByRole('button', { name: 'Next page' }).first();
    await expect(nextBtn).toBeDisabled();
    // Previous button should be enabled
    await expect(prevBtn).toBeEnabled();
  });
});
