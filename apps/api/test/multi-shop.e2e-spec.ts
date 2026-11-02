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

describe('Multi-Shop, Transfers & Stock Movement (e2e)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let stockMovementService: StockMovementService;

  let gulshanShopId: number;
  let dhanmondiShopId: number;
  let transitLocationId: number;

  let adminToken: string;
  let gulshanUserToken: string;
  let dhanmondiUserToken: string;
  let unassignedUserToken: string;

  let productId: number;
  let size40VariationId: number;

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
    await pool.query('DELETE FROM courier_parcel_items');
    await pool.query('DELETE FROM courier_parcels');
    await pool.query('DELETE FROM courier_settlements');
    await pool.query('DELETE FROM return_items');
    await pool.query('DELETE FROM returns');
    await pool.query('DELETE FROM daily_cash_closings');
    await pool.query('DELETE FROM courier_parcel_items');
    await pool.query('DELETE FROM courier_parcels');
    await pool.query('DELETE FROM courier_settlements');
    await pool.query('DELETE FROM return_items');
    await pool.query('DELETE FROM returns');
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

    // Fetch transit location ID
    const transitRes = await pool.query("SELECT id FROM locations WHERE code = 'LOC-TRANSIT'");
    transitLocationId = transitRes.rows[0].id;

    // 1. Create shops
    const s1 = await pool.query(
      "INSERT INTO locations (name, code, is_system, is_active) VALUES ('Gulshan Shop', 'GUL-MS1', false, true) RETURNING id"
    );
    gulshanShopId = s1.rows[0].id;

    const s2 = await pool.query(
      "INSERT INTO locations (name, code, is_system, is_active) VALUES ('Dhanmondi Shop', 'DHM-MS2', false, true) RETURNING id"
    );
    dhanmondiShopId = s2.rows[0].id;

    // 2. Create Admin user
    const adminRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: {
        name: 'Admin User',
        email: 'admin.ms@aroption.com',
        password: 'admin-password-123',
        role: 'admin',
      },
    });
    const adminLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin.ms@aroption.com', password: 'admin-password-123' },
    });
    adminToken = JSON.parse(adminLogin.payload).token;

    // 3. Create Gulshan Manager (assigned to Gulshan)
    const gUserRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Gulshan Staff',
        email: 'gulshan.staff@aroption.com',
        password: 'staff-password',
        role: 'manager',
        shop_ids: [gulshanShopId],
      },
    });
    const gLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'gulshan.staff@aroption.com', password: 'staff-password' },
    });
    gulshanUserToken = JSON.parse(gLogin.payload).token;

    // 4. Create Dhanmondi Staff (assigned to Dhanmondi)
    const dUserRes = await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Dhanmondi Staff',
        email: 'dhanmondi.staff@aroption.com',
        password: 'staff-password',
        role: 'manager',
        shop_ids: [dhanmondiShopId],
      },
    });
    const dLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'dhanmondi.staff@aroption.com', password: 'staff-password' },
    });
    dhanmondiUserToken = JSON.parse(dLogin.payload).token;

    // 5. Create Cashier with no transfer permissions
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        name: 'Cashier User',
        email: 'cashier.no.transfer@aroption.com',
        password: 'cashier-password',
        role: 'cashier',
        shop_ids: [gulshanShopId],
      },
    });
    const unLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'cashier.no.transfer@aroption.com', password: 'cashier-password' },
    });
    unassignedUserToken = JSON.parse(unLogin.payload).token;

    // 6. Create product with size variations
    const prodRes = await app.inject({
      method: 'POST',
      url: '/products',
      payload: {
        name: 'Premium Silk Panjabi',
        code: 'PAN-SILK-01',
        category_name: 'Panjabi',
        brand_name: 'AR Option',
        cost_price: 1500,
        selling_price: 2800,
        sizes: ['38', '40', '42'],
      },
    });
    expect(prodRes.statusCode).toBe(201);
    const prodData = JSON.parse(prodRes.payload);
    productId = prodData.id;
    const var40 = prodData.variations.find((v: any) => v.size === '40');
    size40VariationId = var40.id;

    // 7. Add initial stock of 50 units to Gulshan Shop
    const stockInit = await app.inject({
      method: 'POST',
      url: '/products/initial-stock',
      payload: {
        variation_id: size40VariationId,
        location_id: gulshanShopId,
        quantity: 50,
      },
    });
    expect(stockInit.statusCode).toBe(201);
  });

  afterAll(async () => {
    if (app) {
      if (pool) {
        await pool.end();
      }
      await app.close();
    }
  });

  describe('Rule 4: Stock Movement & History Invariant Proof (DoD)', () => {
    it('proves that movement history exactly matches stock quantity available', async () => {
      const check = await stockMovementService.verifyMovementHistoryMatchesStock(
        size40VariationId,
        gulshanShopId
      );
      expect(check.matches).toBe(true);
      expect(check.stockQty).toBe(50);
      expect(check.calculatedQty).toBe(50);
    });

    it('rejects overselling or moving more stock than available with 400 Bad Request', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/transfers',
        headers: {
          authorization: `Bearer ${gulshanUserToken}`,
          'x-shop-id': gulshanShopId.toString(),
        },
        payload: {
          to_location_id: dhanmondiShopId,
          items: [{ product_variation_id: size40VariationId, qty_sent: 100 }], // Available: 50
        },
      });

      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.payload);
      expect(body.message).toContain('Insufficient stock');
    });
  });

  describe('Two-Step Transfers: Step 1 (Sent)', () => {
    let transferId: number;

    it('rejects sending transfers without transfers.send permission with 403 Forbidden', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/transfers',
        headers: {
          authorization: `Bearer ${unassignedUserToken}`, // Cashier has no transfers.send
          'x-shop-id': gulshanShopId.toString(),
        },
        payload: {
          to_location_id: dhanmondiShopId,
          items: [{ product_variation_id: size40VariationId, qty_sent: 5 }],
        },
      });

      expect(response.statusCode).toBe(403);
    });

    it('successfully sends 20 units from Gulshan to In Transit and updates stock correctly', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/transfers',
        headers: {
          authorization: `Bearer ${gulshanUserToken}`,
          'x-shop-id': gulshanShopId.toString(),
        },
        payload: {
          to_location_id: dhanmondiShopId,
          notes: 'Transfer 20 panjabis for Eid collection',
          items: [{ product_variation_id: size40VariationId, qty_sent: 20 }],
        },
      });

      expect(response.statusCode).toBe(201);
      const data = JSON.parse(response.payload);
      expect(data.id).toBeDefined();
      expect(data.status).toBe('in_transit');
      expect(data.items.length).toBe(1);
      expect(data.items[0].qty_sent).toBe(20);
      transferId = data.id;

      // Gulshan stock: was 50, now 30
      const gCheck = await stockMovementService.verifyMovementHistoryMatchesStock(
        size40VariationId,
        gulshanShopId
      );
      expect(gCheck.matches).toBe(true);
      expect(gCheck.stockQty).toBe(30);

      // In Transit stock: now 20
      const tCheck = await stockMovementService.verifyMovementHistoryMatchesStock(
        size40VariationId,
        transitLocationId
      );
      expect(tCheck.matches).toBe(true);
      expect(tCheck.stockQty).toBe(20);

      // Dhanmondi stock: still 0
      const dCheck = await stockMovementService.verifyMovementHistoryMatchesStock(
        size40VariationId,
        dhanmondiShopId
      );
      expect(dCheck.matches).toBe(true);
      expect(dCheck.stockQty).toBe(0);

      // Section 5.3: Transfers have NO effect on ledger
      const tbRes = await app.inject({ method: 'GET', url: '/ledger/trial-balance' });
      expect(tbRes.statusCode).toBe(200);
      const tb = JSON.parse(tbRes.payload);
      expect(tb.totalDebit).toBe(0);
      expect(tb.totalCredit).toBe(0);
    });

    describe('Two-Step Transfers: Step 2 (Received)', () => {
      it('rejects confirmation from a user not assigned to the destination shop (Section 5.3)', async () => {
        // Gulshan user attempts to confirm receipt at Dhanmondi
        const response = await app.inject({
          method: 'POST',
          url: `/transfers/${transferId}/receive`,
          headers: {
            authorization: `Bearer ${gulshanUserToken}`,
          },
          payload: {
            items: [
              {
                item_id: (await app.inject({ method: 'GET', url: `/transfers/${transferId}` }).then(r => JSON.parse(r.payload))).items[0].id,
                qty_received: 20,
              },
            ],
          },
        });

        expect(response.statusCode).toBe(403);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('Only a user assigned to destination shop');
      });

      it('rejects shortage without an explanation reason (Section 5.3)', async () => {
        const transfer = JSON.parse((await app.inject({ method: 'GET', url: `/transfers/${transferId}` })).payload);
        const itemId = transfer.items[0].id;

        const response = await app.inject({
          method: 'POST',
          url: `/transfers/${transferId}/receive`,
          headers: {
            authorization: `Bearer ${dhanmondiUserToken}`, // Dhanmondi staff
          },
          payload: {
            items: [
              {
                item_id: itemId,
                qty_received: 18, // Sent 20, Received 18 -> shortage of 2
                // Missing shortage_reason!
              },
            ],
          },
        });

        expect(response.statusCode).toBe(400);
        const body = JSON.parse(response.payload);
        expect(body.message).toContain('requires an explanation reason');
      });

      it('successfully receives transfer with shortage reason and updates all stock balances', async () => {
        const transfer = JSON.parse((await app.inject({ method: 'GET', url: `/transfers/${transferId}` })).payload);
        const itemId = transfer.items[0].id;

        const response = await app.inject({
          method: 'POST',
          url: `/transfers/${transferId}/receive`,
          headers: {
            authorization: `Bearer ${dhanmondiUserToken}`,
          },
          payload: {
            items: [
              {
                item_id: itemId,
                qty_received: 18,
                shortage_reason: '2 panjabis damaged during transport',
              },
            ],
            notes: 'Received by Dhanmondi branch manager',
          },
        });

        expect(response.statusCode).toBe(201);
        const updated = JSON.parse(response.payload);
        expect(updated.status).toBe('received');
        expect(updated.items[0].qty_received).toBe(18);
        expect(updated.items[0].shortage_reason).toBe('2 panjabis damaged during transport');

        // Check stock balances & movement invariant across all three locations:
        // 1. Gulshan: 30
        const gCheck = await stockMovementService.verifyMovementHistoryMatchesStock(
          size40VariationId,
          gulshanShopId
        );
        expect(gCheck.matches).toBe(true);
        expect(gCheck.stockQty).toBe(30);

        // 2. In Transit: 0 (20 sent - 18 received - 2 shortage)
        const tCheck = await stockMovementService.verifyMovementHistoryMatchesStock(
          size40VariationId,
          transitLocationId
        );
        expect(tCheck.matches).toBe(true);
        expect(tCheck.stockQty).toBe(0);

        // 3. Dhanmondi: 18
        const dCheck = await stockMovementService.verifyMovementHistoryMatchesStock(
          size40VariationId,
          dhanmondiShopId
        );
        expect(dCheck.matches).toBe(true);
        expect(dCheck.stockQty).toBe(18);
      });
    });
  });

  describe('Shop-Level Reporting & Stock by Shop Grid (Section 5.4)', () => {
    it('correctly filters dashboard KPIs by shop in SQL', async () => {
      // Gulshan KPI: stock value = 30 * 1500 = 45,000
      const gKpiRes = await app.inject({
        method: 'GET',
        url: `/reports/dashboard-kpis?shop_id=${gulshanShopId}`,
      });
      expect(gKpiRes.statusCode).toBe(200);
      const gKpi = JSON.parse(gKpiRes.payload);
      expect(gKpi.stock_value).toBe(45000);

      // Dhanmondi KPI: stock value = 18 * 1500 = 27,000
      const dKpiRes = await app.inject({
        method: 'GET',
        url: `/reports/dashboard-kpis?shop_id=${dhanmondiShopId}`,
      });
      expect(dKpiRes.statusCode).toBe(200);
      const dKpi = JSON.parse(dKpiRes.payload);
      expect(dKpi.stock_value).toBe(27000);

      // Combined All Shops KPI: 45,000 + 27,000 = 72,000
      const allKpiRes = await app.inject({
        method: 'GET',
        url: `/reports/dashboard-kpis`,
      });
      expect(allKpiRes.statusCode).toBe(200);
      const allKpi = JSON.parse(allKpiRes.payload);
      expect(allKpi.stock_value).toBe(72000);
      expect(allKpi.total_shops).toBe(2);
    });

    it('returns the Stock by Shop Grid matrix with quantities per shop', async () => {
      const gridRes = await app.inject({
        method: 'GET',
        url: '/reports/stock-by-shop',
      });
      expect(gridRes.statusCode).toBe(200);
      const grid = JSON.parse(gridRes.payload);
      expect(grid.length).toBeGreaterThan(0);

      const panjabi40 = grid.find((item: any) => item.variation_id === size40VariationId);
      expect(panjabi40).toBeDefined();

      const gulshanStock = panjabi40.stocks.find((s: any) => s.location_id === gulshanShopId);
      expect(gulshanStock.qty).toBe(30);

      const dhmStock = panjabi40.stocks.find((s: any) => s.location_id === dhanmondiShopId);
      expect(dhmStock.qty).toBe(18);

      const transitStock = panjabi40.stocks.find((s: any) => s.location_id === transitLocationId);
      expect(transitStock.qty).toBe(0);
    });
  });

  describe('Shop Management & User-to-Shop Mapping (Rule 1)', () => {
    it('allows admin to update shop details', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: `/shops/${gulshanShopId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { name: 'Gulshan Flagship Store' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.payload);
      expect(body.name).toBe('Gulshan Flagship Store');
    });

    it('allows admin to reassign a user to multiple shops', async () => {
      // Fetch user ID of Gulshan staff
      const userRes = await app.inject({
        method: 'GET',
        url: '/auth/users',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const users = JSON.parse(userRes.payload);
      const gStaff = users.find((u: any) => u.email === 'gulshan.staff@aroption.com');

      // Assign to both Gulshan and Dhanmondi
      const assignRes = await app.inject({
        method: 'PUT',
        url: `/auth/users/${gStaff.id}/shops`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          shop_ids: [gulshanShopId, dhanmondiShopId],
        },
      });

      expect(assignRes.statusCode).toBe(200);
      const updatedShops = JSON.parse(assignRes.payload);
      expect(updatedShops.length).toBe(2);
      expect(updatedShops.map((s: any) => s.id)).toContain(gulshanShopId);
      expect(updatedShops.map((s: any) => s.id)).toContain(dhanmondiShopId);
    });
  });
});

