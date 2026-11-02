import { test, expect } from '@playwright/test';

test.describe('POS Selected Products and Cart UX', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('ar_option_token', 'pos-test-token');
      localStorage.setItem('ar_option_shop', '1');
    });

    await page.route('**/health', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', migration: 12 }),
      });
    });

    await page.route('**/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: { id: 1, name: 'Manager Razu', role: 'admin', shop_id: 1, is_active: true },
          permissions: ['pos.sell', 'pos.edit_price', 'pos.discount'],
        }),
      });
    });

    await page.route('**/shops', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Gulshan Flagship', code: 'GUL', is_warehouse: false, is_active: true },
          { id: 2, name: 'Dhanmondi Outlet', code: 'DHA', is_warehouse: false, is_active: true },
        ]),
      });
    });

    await page.route('**/stock/grid*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            variation_id: 101,
            product_id: 1,
            product_name: 'Premium Silk Panjabi',
            product_code: 'PAN-SILK-01',
            size: '38',
            sku: 'PAN-SILK-01-38',
            selling_price: 2800,
            unit_cost: 1500,
            category_name: 'Panjabi',
            brand_name: 'AR Option',
            stocks: [{ location_id: 1, qty: 15, is_system: false }],
          },
          {
            variation_id: 102,
            product_id: 1,
            product_name: 'Premium Silk Panjabi',
            product_code: 'PAN-SILK-01',
            size: '40',
            sku: 'PAN-SILK-01-40',
            selling_price: 2800,
            unit_cost: 1500,
            category_name: 'Panjabi',
            brand_name: 'AR Option',
            stocks: [{ location_id: 1, qty: 20, is_system: false }],
          },
        ]),
      });
    });

    await page.route('**/accounts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 1, name: 'Gulshan Cash Drawer', shop_id: 1, payment_method: 'cash', balance: 5000 },
          { id: 2, name: 'Gulshan POS Card', shop_id: 1, payment_method: 'card', balance: 10000 },
          { id: 3, name: 'Gulshan bKash Merchant', shop_id: 1, payment_method: 'bkash', balance: 8000 },
        ]),
      });
    });

    await page.route('**/tills/active*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 1,
          shop_id: 1,
          opened_at: new Date().toISOString(),
          opening_float: 5000,
          current_cash: 7800,
          cashier_id: 1,
        }),
      });
    });

    // Fallback catch-all for any other requests
    await page.route('**/reports/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] }),
      });
    });
  });

  test('clicking product shows selected badge on card and displays item properly in cart', async ({ page }) => {
    await page.goto('/');

    const posNav = page.locator('[data-testid$="-pos"]:visible').first();
    await posNav.click();

    await expect(page.locator('text=Point of Sale')).toBeVisible();

    // Verify initial state: cart is empty
    await expect(page.locator('text=Cart is empty')).toBeVisible();

    // Find and click on the Panjabi Size 38 card
    const card38 = page.locator('div:has-text("PAN-SILK-01-38")').last();
    await card38.click();

    // In the Product Grid: the card should now show "1 in cart" badge
    await expect(page.locator('text=1 in cart')).toBeVisible();

    // In the Cart: the item card should display Size: 38 and title and price
    await expect(page.locator('text=Current Order (1 item)')).toBeVisible();
    await expect(page.locator('text=Size: 38')).toBeVisible();
    await expect(page.locator('text=PAN-SILK-01-38')).toBeVisible();

    // Grand total should be ৳2,800.00
    await expect(page.locator(':visible:has-text("৳2,800.00")').first()).toBeVisible();

    // Click again to increment to 2
    await card38.click();
    await expect(page.locator('text=2 in cart')).toBeVisible();
    await expect(page.locator('text=Current Order (2 items)')).toBeVisible();

    // Click Panjabi Size 40
    const card40 = page.locator('div:has-text("PAN-SILK-01-40")').last();
    await card40.click();

    // Now both cards have selected indicators
    await expect(page.locator('text=Size: 40')).toBeVisible();
    await expect(page.locator('text=Current Order (3 items)')).toBeVisible();
  });
});
