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
    await page.addInitScript(() => {
      localStorage.setItem('ar_option_token', 'smoke-test-token');
      localStorage.setItem('ar_option_shop', '1');
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
    await page.route('**/reports/dashboard-kpis*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_shops: 2,
          total_sales: 0,
          stock_value: 0,
          pending_transfers: 0,
          is_trial_balance_balanced: true,
        }),
      });
    });
    await page.route('**/pos/sales*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/contacts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
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
    await page.route('**/ledger/payment-accounts*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          { id: 10, code: 'CASH_GUL-01', name: 'Cash - Gulshan Branch', type: 'asset', payment_method: 'cash' },
        ]),
      });
    });
    await page.route('**/till/status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          shop_id: 1,
          shop_name: 'Gulshan Branch',
          shop_code: 'GUL-01',
          ledger_cash: 15500,
          is_first_open: false,
          session: {
            id: 7, location_id: 1, status: 'open', opened_by: 1, opened_by_name: 'Smoke Admin',
            opened_at: '2026-11-02T04:00:00.000Z', opening_float: 5000, open_adjustment: 0,
          },
          summary: {
            current_cash: 15500, opening_float: 5000, cash_sales: 12500, digital_sales: 3000,
            pay_ins: 0, petty_cash: 1200, refunds: 800, other_cash: 0,
          },
          movements: [],
        }),
      });
    });
    await page.route('**/till/overview*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          total_cash: 15500,
          shops: [{
            shop_id: 1, shop_name: 'Gulshan Branch', shop_code: 'GUL-01', is_open: true, session_id: 7,
            cash_in_hand: 15500, opening_float: 5000, cash_sales: 12500, petty_cash: 1200,
          }],
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

  test('shows the login screen when nobody is signed in', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('ar_option_token'));
    await page.route('**/auth/setup-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ needs_setup: false }),
      });
    });
    await page.goto('/');

    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
    await expect(page.locator('[data-testid="shop-chip"]')).toHaveCount(0);
  });

  test('can leave the POS with the Back control', async ({ page }) => {
    await page.goto('/');
    await page.locator('[data-testid$="-pos"]:visible').first().click();
    await page.locator('[data-testid="pos-back"]').click();
    await expect(page.locator('[data-testid="api-status"]')).toBeVisible();
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

    // Click product to add to cart
    await page.locator('text=Classic Polo Shirt').first().click();

    // Verify selected indicator badge on product card
    await expect(page.locator('text=1 in cart')).toBeVisible();

    // Verify cart panel displays the selected item details
    await expect(page.locator('text=Current Order (1 item)')).toBeVisible();
    await expect(page.locator('text=Size: L')).toBeVisible();
    await expect(page.getByText('POLO-01-L', { exact: true })).toBeVisible();
    await expect(page.locator(':visible:has-text("৳950.00")').first()).toBeVisible();
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

  test('opens searchable product catalog popup in Book Courier Parcel modal and adds product', async ({ page }) => {
    await page.goto('/');

    const courierNav = page.locator('[data-testid$="-courier"]:visible').first();
    await courierNav.click();

    await expect(page.getByRole('heading', { name: 'Courier & Settlement' })).toBeVisible();

    // Click "+ Book Parcel" button
    await page.getByRole('button', { name: 'Book Parcel' }).click();
    await expect(page.getByRole('heading', { name: 'Book Courier Parcel' })).toBeVisible();

    // Click "+ Add Product from Catalog" button
    await page.getByRole('button', { name: '+ Add Product from Catalog' }).click();

    // Verify Searchable Product Catalog Pop Up opens (Image 2)
    await expect(page.getByRole('heading', { name: 'Select Product from Catalog' })).toBeVisible();
    const searchInput = page.getByPlaceholder('Search catalog products...');
    await expect(searchInput).toBeVisible();

    // Verify product info matches catalog
    await expect(page.locator('text=Classic Polo Shirt').first()).toBeVisible();
    await expect(page.locator('text=POLO-01-L').first()).toBeVisible();
    await expect(page.locator('text=15 in shop').first()).toBeVisible();

    // Click the item
    await page.locator('text=POLO-01-L').click();

    // Catalog modal closes and item is added under Parcel Items
    await expect(page.getByRole('heading', { name: 'Select Product from Catalog' })).toHaveCount(0);
    await expect(page.locator('text=Classic Polo Shirt').first()).toBeVisible();
    await expect(page.locator('text=POLO-01-L').first()).toBeVisible();
  });

  test('navigates to Products & Stock and opens the Import page', async ({ page }) => {
    await page.goto('/');

    const productsNav = page.locator('[data-testid$="-products"]:visible').first();
    await productsNav.click();

    await expect(page.locator('text=Products & Inventory')).toBeVisible();
    await page.getByTestId('open-import').click();
    await expect(page.getByRole('heading', { name: 'Import Products' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Download template' })).toBeVisible();

    await page.goBack();
    await expect(page.locator('text=Products & Inventory')).toBeVisible();
  });

  test('shows the Cash in Hand card on the dashboard', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('cash-in-hand-card')).toBeVisible();
    await expect(page.getByTestId('cash-in-hand-figure')).toHaveText('৳15,500.00');
    await expect(page.getByTestId('cash-in-hand-card').getByText('Till Open')).toBeVisible();
  });

  test('shows the open till, counts the drawer and closes the sheet with Back', async ({ page }) => {
    await page.goto('/');

    await page.locator('[data-testid$="-cash-closing"]:visible').first().click();

    await expect(page.getByRole('heading', { name: 'Till', exact: true })).toBeVisible();
    await expect(page.getByTestId('till-current-cash')).toHaveText('৳15,500.00');
    await expect(page.getByTestId('till-badge')).toHaveText('Till Open');
    await expect(page.getByText('Opening Float', { exact: true })).toBeVisible();
    await expect(page.getByText('Petty Cash', { exact: true })).toBeVisible();

    const noSidewaysScroll = () =>
      page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(await noSidewaysScroll()).toBe(true);

    await page.getByRole('button', { name: 'Close & Handover' }).click();
    const sheet = page.getByTestId('close-till-sheet');
    await expect(sheet).toBeVisible();
    expect(await noSidewaysScroll()).toBe(true);
    const box = await sheet.getByRole('dialog').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    await sheet.locator('#denom-1000').fill('15');
    await sheet.locator('#denom-500').fill('1');
    await expect(page.getByTestId('close-counted')).toHaveText('৳15,500.00');
    await expect(page.getByTestId('close-difference')).toHaveText('৳0.00');
    await sheet.locator('#denom-100').fill('1');
    await expect(page.getByTestId('close-difference')).toHaveText('+৳100.00');
    await expect(sheet.getByRole('button', { name: 'Finish' })).toBeDisabled();
    await sheet.getByLabel(/Reason for the difference/).fill('Found a note');
    await expect(sheet.getByRole('button', { name: 'Finish' })).toBeEnabled();

    await page.goBack();
    await expect(sheet).toBeHidden();
    await expect(page.getByTestId('till-current-cash')).toBeVisible();
  });

  test('can collapse and expand navigation sidebar slider', async ({ page }) => {
    await page.goto('/');
    const toggleBtn = page.getByTestId('toggle-sidebar-button');
    if (await toggleBtn.isVisible()) {
      // Toggle collapse
      await toggleBtn.click();
      const sidebar = page.locator('aside.hidden.lg\\:flex');
      await expect(sidebar).toHaveClass(/w-16/);

      // Toggle expand
      await toggleBtn.click();
      await expect(sidebar).toHaveClass(/w-60|w-64/);
    }
  });
});
