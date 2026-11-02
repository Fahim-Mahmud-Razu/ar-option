import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.test explicitly
const envTestPath = path.resolve(__dirname, '../../../.env.test');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
}

// Rule 10 check: Test scripts abort unless DATABASE_URL host is localhost or 127.0.0.1
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error('ABORT: DATABASE_URL is not set for test.');
}
const urlObj = new URL(dbUrl);
if (urlObj.hostname !== 'localhost' && urlObj.hostname !== '127.0.0.1') {
  throw new Error(`ABORT: Tests run only against local Docker database. Detected host: ${urlObj.hostname}`);
}

import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { Pool } from 'pg';
import { StockMovementService } from '../src/stock/stock-movement.service';

describe('Step 3: Daily Screens (POS, Expenses & Bulk Import) e2e', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let stockMovementService: StockMovementService;

  let gulshanShopId: number;
  let dhanmondiShopId: number;
  let gulshanCashAccountId: number;
  let dhanmondiCashAccountId: number;
  let expenseCategoryId: number;

  let adminToken: string;
  let cashierToken: string;

  let panjabiProductId: number;
  let panjabiSize40VarId: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter()
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    pool = app.get<Pool>(PG_POOL);
    stockMovementService = app.get<StockMovementService>(StockMovementService);

    // Clean test tables
    await pool.query('DELETE FROM sale_items');
    await pool.query('DELETE FROM sales');
    await pool.query('DELETE FROM expenses');
    await pool.query('DELETE FROM stock_transfer_items');
    await pool.query('DELETE FROM stock_transfers');
    await pool.query('DELETE FROM stock_movements');
    await pool.query('DELETE FROM stock');
    await pool.query('DELETE FROM product_variations');
    await pool.query('DELETE FROM products');
    await pool.query('DELETE FROM account_transactions');
    await pool.query('DELETE FROM user_locations');
    await pool.query('DELETE FROM users');
    await pool.query("DELETE FROM accounts WHERE code LIKE 'CASH_%'");
    await pool.query("DELETE FROM locations WHERE is_system = false");

    // 1. Create Shops
    const s1 = await pool.query(
      "INSERT INTO locations (name, code, is_system, is_active) VALUES ('Gulshan Shop', 'GUL-DS', false, true) RETURNING id"
    );
    gulshanShopId = s1.rows[0].id;

    const s2 = await pool.query(
      "INSERT INTO locations (name, code, is_system, is_active) VALUES ('Dhanmondi Shop', 'DHM-DS', false, true) RETURNING id"
    );
    dhanmondiShopId = s2.rows[0].id;

    // 2. Create Shop Cash Accounts
    const a1 = await pool.query(
      "INSERT INTO accounts (code, name, type, location_id, is_active) VALUES ('CASH_GUL_DS', 'Gulshan Cash', 'asset', $1, true) RETURNING id",
      [gulshanShopId]
    );
    gulshanCashAccountId = a1.rows[0].id;

    const a2 = await pool.query(
      "INSERT INTO accounts (code, name, type, location_id, is_active) VALUES ('CASH_DHM_DS', 'Dhanmondi Cash', 'asset', $1, true) RETURNING id",
      [dhanmondiShopId]
    );
    dhanmondiCashAccountId = a2.rows[0].id;

    // 3. Fetch an Expense Category
    const catRes = await pool.query('SELECT id FROM expense_categories LIMIT 1');
    expenseCategoryId = catRes.rows[0].id;

    // 4. Create Users
    // Admin
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Super Admin',
        email: 'admin.ds@aroption.com',
        password: 'admin-password',
        role: 'admin',
      },
    });
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin.ds@aroption.com', password: 'admin-password' },
    });
    adminToken = JSON.parse(adminLogin.payload).token;

    // Cashier (no pos.edit_price permission)
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Gulshan Cashier',
        email: 'cashier.ds@aroption.com',
        password: 'cashier-password',
        role: 'cashier',
        shop_ids: [gulshanShopId],
      },
    });
    const cashierLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'cashier.ds@aroption.com', password: 'cashier-password' },
    });
    cashierToken = JSON.parse(cashierLogin.payload).token;

    // 5. Create Product with size 40 and add initial stock of 10 in Gulshan
    const prodRes = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'Cotton Panjabi',
        code: 'PAN-COTTON-01',
        cost_price: 1000,
        selling_price: 2200,
        sizes: ['40', '42'],
      },
    });
    const prod = JSON.parse(prodRes.payload);
    panjabiProductId = prod.id;
    panjabiSize40VarId = prod.variations.find((v: any) => v.size === '40').id;

    await app.inject({
      method: 'POST',
      url: '/products/initial-stock',
      payload: {
        variation_id: panjabiSize40VarId,
        location_id: gulshanShopId,
        quantity: 10,
      },
    });
  });

  afterAll(async () => {
    if (app) {
      if (pool) {
        await pool.end();
      }
      await app.close();
    }
  });

  describe('Shop-Linked Expenses (Rule 1 & Rule 3)', () => {
    it('rejects recording an expense without an active shop with 400 Bad Request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/expenses',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          category_id: expenseCategoryId,
          amount: 500,
          payment_account_id: gulshanCashAccountId,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Every write request requires an active shop');
    });

    it('rejects cross-shop payment account for an expense (Rule 1)', async () => {
      // Trying to pay Gulshan expense using Dhanmondi cash account
      const response = await app.inject({
        method: 'POST',
        url: '/expenses',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': gulshanShopId.toString(),
        },
        payload: {
          category_id: expenseCategoryId,
          amount: 500,
          payment_account_id: dhanmondiCashAccountId, // Belongs to Dhanmondi!
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Cross-shop expenses are prohibited by Rule 1');
    });

    it('successfully records expense, updates ledger, and keeps Trial Balance balanced', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/expenses',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': gulshanShopId.toString(),
        },
        payload: {
          category_id: expenseCategoryId,
          amount: 750,
          payment_account_id: gulshanCashAccountId,
          notes: 'Shop light bulbs replacement',
        },
      });

      expect(response.statusCode).toBe(201);
      const exp = JSON.parse(response.payload);
      expect(exp.id).toBeDefined();
      expect(exp.amount).toBe(750);
      expect(exp.entry_id).toBeDefined();

      // Verify Trial Balance: Dr OPERATING_EXPENSES 750, Cr CASH_GUL_DS 750
      const tbRes = await app.inject({ method: 'GET', url: '/ledger/trial-balance' });
      const tb = JSON.parse(tbRes.payload);
      expect(tb.isBalanced).toBe(true);
      expect(tb.totalDebit).toBe(750);
      expect(tb.totalCredit).toBe(750);
    });

    it('filters expenses by shop in SQL (Section 5.4)', async () => {
      const gRes = await app.inject({
        method: 'GET',
        url: `/expenses?shop_id=${gulshanShopId}`,
      });
      const gList = JSON.parse(gRes.payload);
      expect(gList.length).toBe(1);

      const dRes = await app.inject({
        method: 'GET',
        url: `/expenses?shop_id=${dhanmondiShopId}`,
      });
      const dList = JSON.parse(dRes.payload);
      expect(dList.length).toBe(0);
    });
  });

  describe('POS Counter Sales (Rule 1, Rule 2, Rule 3, Rule 4, Rule 6, Rule 7)', () => {
    it('rejects sale without active shop with 400 Bad Request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/pos/sales',
        headers: { authorization: `Bearer ${cashierToken}` },
        payload: {
          payment_account_id: gulshanCashAccountId,
          items: [{ product_variation_id: panjabiSize40VarId, quantity: 1 }],
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Every write request requires an active shop');
    });

    it('rejects overselling on counter sale (Rule 4)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/pos/sales',
        headers: {
          authorization: `Bearer ${cashierToken}`,
          'x-shop-id': gulshanShopId.toString(),
        },
        payload: {
          payment_account_id: gulshanCashAccountId,
          items: [{ product_variation_id: panjabiSize40VarId, quantity: 20 }], // Available: 10
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Insufficient stock');
    });

    it('rejects unauthorized price override for user without pos.edit_price (Rule 2)', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/pos/sales',
        headers: {
          authorization: `Bearer ${cashierToken}`, // Cashier has no pos.edit_price
          'x-shop-id': gulshanShopId.toString(),
        },
        payload: {
          payment_account_id: gulshanCashAccountId,
          items: [
            {
              product_variation_id: panjabiSize40VarId,
              quantity: 1,
              override_price: 1800, // Catalog price is 2200
            },
          ],
        },
      });

      expect(response.statusCode).toBe(403);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain("Price override on 'Cotton Panjabi' requires 'pos.edit_price' permission");
    });

    it('successfully completes counter sale with full double-entry ledger & stock movement', async () => {
      const clientRef = `pos-sale-${Date.now()}`;

      // Sell 2 units: catalog price 2200 each = 4400, cart discount 400 = Net 4000
      // Cost: 1000 each = 2000 total cost
      const response = await app.inject({
        method: 'POST',
        url: '/pos/sales',
        headers: {
          authorization: `Bearer ${cashierToken}`,
          'x-shop-id': gulshanShopId.toString(),
        },
        payload: {
          client_ref: clientRef,
          customer_name: 'Tanvir Ahmed',
          discount_amount: 400,
          payment_account_id: gulshanCashAccountId,
          items: [{ product_variation_id: panjabiSize40VarId, quantity: 2 }],
        },
      });

      expect(response.statusCode).toBe(201);
      const sale = JSON.parse(response.payload);
      expect(sale.id).toBeDefined();
      expect(sale.invoice_number).toMatch(/^GUL-DS-\d{6}$/); // Rule 7: Sequential receipt number per shop
      expect(sale.subtotal).toBe(4400);
      expect(sale.discount_amount).toBe(400);
      expect(sale.total_amount).toBe(4000);
      expect(sale.paid_amount).toBe(4000);

      // Verify Stock reduction: was 10, now 8
      const stockCheck = await stockMovementService.verifyMovementHistoryMatchesStock(
        panjabiSize40VarId,
        gulshanShopId
      );
      expect(stockCheck.matches).toBe(true);
      expect(stockCheck.stockQty).toBe(8);

      // Verify Trial Balance:
      // Earlier expense: Dr OPERATING_EXPENSES 750, Cr CASH 750
      // Sale revenue: Dr CASH 4000, Cr SALES_REVENUE 4000
      // COGS: Dr COGS 2000, Cr INVENTORY 2000
      // Total debits = 750 + 4000 + 2000 = 6750 == Total credits 6750!
      const tbRes = await app.inject({ method: 'GET', url: '/ledger/trial-balance' });
      const tb = JSON.parse(tbRes.payload);
      expect(tb.isBalanced).toBe(true);
      expect(tb.totalDebit).toBe(6750);
      expect(tb.totalCredit).toBe(6750);
    });

    it('supports idempotent retry via client_ref without duplicate stock or ledger lines (Rule 6)', async () => {
      const clientRef = `idempotent-pos-${Date.now()}`;

      // Call 1
      const res1 = await app.inject({
        method: 'POST',
        url: '/pos/sales',
        headers: {
          authorization: `Bearer ${cashierToken}`,
          'x-shop-id': gulshanShopId.toString(),
        },
        payload: {
          client_ref: clientRef,
          payment_account_id: gulshanCashAccountId,
          items: [{ product_variation_id: panjabiSize40VarId, quantity: 1 }],
        },
      });
      const sale1 = JSON.parse(res1.payload);

      // Call 2 with identical client_ref
      const res2 = await app.inject({
        method: 'POST',
        url: '/pos/sales',
        headers: {
          authorization: `Bearer ${cashierToken}`,
          'x-shop-id': gulshanShopId.toString(),
        },
        payload: {
          client_ref: clientRef,
          payment_account_id: gulshanCashAccountId,
          items: [{ product_variation_id: panjabiSize40VarId, quantity: 1 }],
        },
      });
      const sale2 = JSON.parse(res2.payload);

      expect(sale2.id).toBe(sale1.id);
      expect(sale2.invoice_number).toBe(sale1.invoice_number);

      // Stock was decremented only ONCE (from 8 to 7, not 6!)
      const stockCheck = await stockMovementService.verifyMovementHistoryMatchesStock(
        panjabiSize40VarId,
        gulshanShopId
      );
      expect(stockCheck.matches).toBe(true);
      expect(stockCheck.stockQty).toBe(7);
    });
  });

  describe('Bulk Product & Stock Import (Rule 1 & Rule 4)', () => {
    it('imports products with sizes and shop-stamped initial stock', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/products/bulk-import',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          items: [
            {
              name: 'Formal White Shirt',
              code: 'SHIRT-WHT-01',
              category_name: 'Shirts',
              brand_name: 'AR Option',
              cost_price: 800,
              selling_price: 1800,
              sizes: ['M', 'L', 'XL'],
              initial_stock: [
                { shop_code: 'GUL-DS', size: 'M', quantity: 15 },
                { shop_code: 'DHM-DS', size: 'M', quantity: 10 },
              ],
            },
          ],
        },
      });

      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.payload);
      expect(body.imported_count).toBe(1);

      // Verify stock was created via movement service in both shops
      const importedProd = body.items[0];
      const mVarId = importedProd.variations.find((v: any) => v.size === 'M').id;

      const gCheck = await stockMovementService.verifyMovementHistoryMatchesStock(
        mVarId,
        gulshanShopId
      );
      expect(gCheck.matches).toBe(true);
      expect(gCheck.stockQty).toBe(15);

      const dCheck = await stockMovementService.verifyMovementHistoryMatchesStock(
        mVarId,
        dhanmondiShopId
      );
      expect(dCheck.matches).toBe(true);
      expect(dCheck.stockQty).toBe(10);
    });
  });
});

