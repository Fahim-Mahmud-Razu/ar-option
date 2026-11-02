import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';

// Load .env.test explicitly
const envTestPath = path.resolve(__dirname, '../../../.env.test');
if (fs.existsSync(envTestPath)) {
  dotenv.config({ path: envTestPath });
}

import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { PG_POOL } from '../src/database/database.module';
import { StockMovementService } from '../src/stock/stock-movement.service';
import { AuthService } from '../src/auth/auth.service';

describe('Step 4 & 5: Returns & Exchanges, Courier & Settlement (e2e)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let stockMovementService: StockMovementService;

  let testShopId: number;
  let damagedLocationId: number;
  let courierLocationId: number;
  let testVariation1Id: number;
  let testVariation2Id: number;
  let cashAccountId: number;
  let bankAccountId: number;
  let adminToken: string;
  let cashierToken: string;

  beforeAll(async () => {
    // Rule 10: Protection check against running tests on live production/Neon
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const url = new URL(dbUrl);
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
        throw new Error(
          `ABORT: Automated tests must run only on local Docker database. Detected host: ${url.hostname}`
        );
      }
    }

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
    await pool.query('DELETE FROM till_movements');
    await pool.query('DELETE FROM till_sessions');
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
    await pool.query('DELETE FROM categories');
    await pool.query('DELETE FROM brands');
    await pool.query('DELETE FROM account_transactions');
    await pool.query('DELETE FROM user_locations');
    await pool.query('DELETE FROM users');
    await pool.query("DELETE FROM accounts WHERE code LIKE 'CASH_%'");
    await pool.query('DELETE FROM locations WHERE is_system = false');

    // 1. Fetch system locations
    const courierLoc = await pool.query("SELECT id FROM locations WHERE code = 'LOC-COURIER'");
    courierLocationId = courierLoc.rows[0].id;
    const damLoc = await pool.query("SELECT id FROM locations WHERE code = 'LOC-DAMAGED'");
    damagedLocationId = damLoc.rows[0].id;

    // 2. Create Active Selling Shop
    const shopRes = await pool.query(
      `INSERT INTO locations (name, code, is_system, is_active)
       VALUES ('Banani Flagship', 'BAN-01', false, true)
       RETURNING id`
    );
    testShopId = shopRes.rows[0].id;

    // 3. Create Cash and Bank accounts for the shop
    const cashRes = await pool.query(
      `INSERT INTO accounts (code, name, type, location_id, payment_method)
       VALUES ('CASH_BAN-01', 'Cash - Banani Flagship', 'asset', $1, 'cash')
       RETURNING id`,
      [testShopId]
    );
    cashAccountId = cashRes.rows[0].id;

    const bankRes = await pool.query(
      `INSERT INTO accounts (code, name, type, location_id, payment_method)
       VALUES ('BANK_BRAC', 'BRAC Bank Corporate', 'asset', null, 'bank')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, payment_method = 'bank'
       RETURNING id`
    );
    bankAccountId = bankRes.rows[0].id;

    // 4. Create Users (Admin & Cashier)
    const adminUserRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Admin Manager', 'manager@banani.com', 'pbkdf2:hash:dummy', 'manager')
       RETURNING id`
    );
    const adminId = adminUserRes.rows[0].id;
    await pool.query('INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2)', [
      adminId,
      testShopId,
    ]);

    const cashierUserRes = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ('Cashier User', 'cashier@banani.com', 'pbkdf2:hash:dummy', 'cashier')
       RETURNING id`
    );
    const cashierId = cashierUserRes.rows[0].id;
    await pool.query('INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2)', [
      cashierId,
      testShopId,
    ]);

    // Fastify auth tokens (HMAC-SHA256 bearer tokens)
    const authService = app.get<AuthService>(AuthService);
    adminToken = authService.generateToken({
      id: adminId,
      email: 'manager@banani.com',
      role: 'manager',
    });

    cashierToken = authService.generateToken({
      id: cashierId,
      email: 'cashier@banani.com',
      role: 'cashier',
    });

    // 5. Create Test Products with size variations
    const prodRes = await pool.query(
      `INSERT INTO products (name, code, is_active)
       VALUES ('Premium Linen Shirt', 'SHIRT-LINEN', true)
       RETURNING id`
    );
    const prodId = prodRes.rows[0].id;

    const var1Res = await pool.query(
      `INSERT INTO product_variations (product_id, size, sku, cost_price, selling_price)
       VALUES ($1, 'M', 'SHIRT-LINEN-M', 600.00, 1400.00)
       RETURNING id`,
      [prodId]
    );
    testVariation1Id = var1Res.rows[0].id;

    const var2Res = await pool.query(
      `INSERT INTO product_variations (product_id, size, sku, cost_price, selling_price)
       VALUES ($1, 'L', 'SHIRT-LINEN-L', 600.00, 1400.00)
       RETURNING id`,
      [prodId]
    );
    testVariation2Id = var2Res.rows[0].id;

    // Add initial stock: 20 M and 20 L to testShopId
    await stockMovementService.recordMovement({
      product_variation_id: testVariation1Id,
      from_location_id: null,
      to_location_id: testShopId,
      quantity: 20,
      movement_type: 'initial_stock',
      source_type: 'opening',
      source_id: 'OP-01',
      notes: 'Initial test inventory',
      user_id: adminId,
    });

    await stockMovementService.recordMovement({
      product_variation_id: testVariation2Id,
      from_location_id: null,
      to_location_id: testShopId,
      quantity: 20,
      movement_type: 'initial_stock',
      source_type: 'opening',
      source_id: 'OP-02',
      notes: 'Initial test inventory',
      user_id: adminId,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Step 4: Return & Exchange (Section 5.1)', () => {
    let originalSaleId: number;

    it('creates an original sale to return against', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/pos/sales',
        headers: {
          authorization: `Bearer ${cashierToken}`,
          'x-shop-id': String(testShopId),
        },
        payload: {
          client_ref: 'sale-before-return-01',
          customer_name: 'Tanvir Ahmed',
          customer_phone: '01711223344',
          payment_account_id: cashAccountId,
          items: [{ product_variation_id: testVariation1Id, quantity: 2 }],
        },
      });

      expect(res.statusCode).toBe(201);
      const sale = JSON.parse(res.payload);
      expect(sale.total_amount).toBe(2800.0); // 2 * 1400
      originalSaleId = sale.id;

      // Stock should now be 18
      const stock = await stockMovementService.getStock(testVariation1Id, testShopId);
      expect(stock).toBe(18);
    });

    it('processes a verified linked return (customer returns 1 item for refund)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/returns',
        headers: {
          authorization: `Bearer ${cashierToken}`,
          'x-shop-id': String(testShopId),
        },
        payload: {
          sale_id: originalSaleId,
          reason: 'Size too tight',
          action_type: 'refunded',
          payment_account_id: cashAccountId,
          items: [
            {
              direction: 'in',
              product_variation_id: testVariation1Id,
              quantity: 1,
              condition: 'resaleable',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const ret = JSON.parse(res.payload);
      expect(ret.return_number).toMatch(/^RET-BAN-01-\d{6}$/);
      expect(ret.inbound_subtotal).toBe(1400.0);
      expect(ret.outbound_subtotal).toBe(0.0);
      expect(ret.net_amount).toBe(-1400.0); // Shop refunds customer ৳1,400

      // Stock invariant: resaleable item restocked to shop (18 + 1 = 19)
      const stock = await stockMovementService.getStock(testVariation1Id, testShopId);
      expect(stock).toBe(19);

      const isValid = await stockMovementService.verifyMovementHistoryMatchesStock(
        testVariation1Id,
        testShopId
      );
      expect(isValid.matches).toBe(true);
      expect(isValid.stockQty).toBe(19);
      expect(isValid.calculatedQty).toBe(19);
    });

    it('enforces quantity cap on linked returns (cannot exceed original sale quantity)', async () => {
      // Sale had 2 items, 1 already returned, trying to return 2 more must be rejected
      const res = await app.inject({
        method: 'POST',
        url: '/returns',
        headers: {
          authorization: `Bearer ${cashierToken}`,
          'x-shop-id': String(testShopId),
        },
        payload: {
          sale_id: originalSaleId,
          reason: 'Attempting to return more than sold',
          action_type: 'refunded',
          payment_account_id: cashAccountId,
          items: [
            {
              direction: 'in',
              product_variation_id: testVariation1Id,
              quantity: 2,
              condition: 'resaleable',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.payload).message).toContain('Cannot return 2 units');
    });

    it('processes an exchange: returns 1 M (damaged), takes 1 L (outbound)', async () => {
      // Returns 1 M (damaged -> LOC-DAMAGED), takes 1 L (exchange_out)
      const res = await app.inject({
        method: 'POST',
        url: '/returns',
        headers: {
          authorization: `Bearer ${cashierToken}`,
          'x-shop-id': String(testShopId),
        },
        payload: {
          sale_id: originalSaleId,
          reason: 'Defective fabric, exchanging for L',
          action_type: 'even',
          items: [
            {
              direction: 'in',
              product_variation_id: testVariation1Id,
              quantity: 1,
              condition: 'damaged',
            },
            {
              direction: 'out',
              product_variation_id: testVariation2Id,
              quantity: 1,
              condition: 'exchange_out',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const ret = JSON.parse(res.payload);
      expect(ret.inbound_subtotal).toBe(1400.0);
      expect(ret.outbound_subtotal).toBe(1400.0);
      expect(ret.net_amount).toBe(0.0); // Even exchange

      // Damaged M stock goes to LOC-DAMAGED (damagedLocationId)
      const damStock = await stockMovementService.getStock(testVariation1Id, damagedLocationId);
      expect(damStock).toBe(1);

      // Outbound L stock decreased from 20 to 19 in shop
      const lStock = await stockMovementService.getStock(testVariation2Id, testShopId);
      expect(lStock).toBe(19);
    });

    it('rejects manual returns without customer phone or without returns.manual permission', async () => {
      // Create user without returns.manual
      const plainUserRes = await pool.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ('No Perm', 'noperm@shop.com', 'h', 'cashier') RETURNING id"
      );
      await pool.query('INSERT INTO user_locations (user_id, location_id) VALUES ($1, $2)', [
        plainUserRes.rows[0].id,
        testShopId,
      ]);
      const authService = app.get<AuthService>(AuthService);
      const noPermToken = authService.generateToken({
        id: plainUserRes.rows[0].id,
        email: 'noperm@shop.com',
        role: 'cashier',
      });

      const res = await app.inject({
        method: 'POST',
        url: '/returns',
        headers: {
          authorization: `Bearer ${noPermToken}`,
          'x-shop-id': String(testShopId),
        },
        payload: {
          is_manual: true,
          customer_phone: '01899999999',
          reason: 'Lost receipt manual return',
          action_type: 'refunded',
          items: [{ direction: 'in', product_variation_id: testVariation1Id, quantity: 1, condition: 'resaleable' }],
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.payload).message).toContain('returns.manual permission');
    });

    it('allows unlisted item line on manual returns with cash effect and no stock effect', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/returns',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': String(testShopId),
        },
        payload: {
          is_manual: true,
          customer_phone: '01911112222',
          reason: 'Returning vintage shirt not in modern database',
          action_type: 'refunded',
          payment_account_id: cashAccountId,
          items: [
            {
              direction: 'in',
              unlisted_title: 'Vintage Leather Belt',
              quantity: 1,
              unit_price: 500.0,
              condition: 'unlisted',
            },
          ],
        },
      });

      expect(res.statusCode).toBe(201);
      const ret = JSON.parse(res.payload);
      expect(ret.is_manual).toBe(true);
      expect(ret.inbound_subtotal).toBe(500.0);
      expect(ret.net_amount).toBe(-500.0);
    });
  });

  describe('Step 5: Courier & Settlement (Section 5.2)', () => {
    let bookedParcelId: number;

    it('books a courier parcel (moves stock to With Courier, records advance, NO sale recorded yet)', async () => {
      // Variation 2 has 19 stock in shop
      const res = await app.inject({
        method: 'POST',
        url: '/courier/parcels/book',
        headers: {
          authorization: `Bearer ${adminToken}`,
          'x-shop-id': String(testShopId),
        },
        payload: {
          customer_name: 'Fahim Rahman',
          customer_phone: '01812345678',
          customer_address: 'House 14, Road 5, Dhanmondi, Dhaka',
          courier_name: 'Steadfast',
          tracking_number: 'ST-998877',
          advance_amount: 300.0,
          advance_account_id: bankAccountId,
          delivery_charge: 100.0,
          items: [{ product_variation_id: testVariation2Id, quantity: 2 }],
        },
      });

      expect(res.statusCode).toBe(201);
      const parcel = JSON.parse(res.payload);
      bookedParcelId = parcel.id;
      expect(parcel.parcel_code).toMatch(/^PAR-BAN-01-\d{6}$/);
      expect(parcel.order_value).toBe(2900.0); // 2 * 1400 + 100 delivery fee
      expect(parcel.advance_amount).toBe(300.0);
      expect(parcel.collectible_amount).toBe(2600.0);

      // Two-Tracks Rule: Delivery status is 'booked', payment status is 'unpaid'
      expect(parcel.delivery_status).toBe('booked');
      expect(parcel.payment_status).toBe('unpaid');

      // Stock moved to LOC-COURIER
      const shopStock = await stockMovementService.getStock(testVariation2Id, testShopId);
      expect(shopStock).toBe(17); // 19 - 2

      const courierStock = await stockMovementService.getStock(testVariation2Id, courierLocationId);
      expect(courierStock).toBe(2);

      // Verify trial balance is balanced (Dr Bank 300 / Cr Customer Advances 300)
      const tbRes = await app.inject({ method: 'GET', url: '/ledger/trial-balance', headers: { authorization: `Bearer ${adminToken}` } });
      const tb = JSON.parse(tbRes.payload);
      expect(tb.isBalanced).toBe(true);
    });

    it('delivers a courier parcel (sale is recorded at delivery, cash does NOT change)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/courier/parcels/${bookedParcelId}/delivery-status`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          delivery_status: 'delivered',
          notes: 'Customer accepted and paid courier in cash',
        },
      });

      expect(res.statusCode).toBe(201);
      const parcel = JSON.parse(res.payload);
      expect(parcel.delivery_status).toBe('delivered');
      // Payment status remains UNPAID until settlement remittance! "Delivered does not mean paid"
      expect(parcel.payment_status).toBe('unpaid');

      // Stock leaves LOC-COURIER (sold)
      const courierStock = await stockMovementService.getStock(testVariation2Id, courierLocationId);
      expect(courierStock).toBe(0);

      // Trial Balance must remain strictly balanced
      // Dr Courier Receivable 2,600, Dr Customer Advances 300, Cr Sales Revenue 2,900
      // Dr COGS 1,200, Cr Inventory 1,200
      const tbRes = await app.inject({ method: 'GET', url: '/ledger/trial-balance', headers: { authorization: `Bearer ${adminToken}` } });
      const tb = JSON.parse(tbRes.payload);
      expect(tb.isBalanced).toBe(true);
    });

    it('returns dashboard KPI "Money with couriers" correctly', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/courier/summary?shop_id=${testShopId}`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const summary = JSON.parse(res.payload);
      // We have 1 delivered unpaid parcel with collectible_amount = 2600.0
      expect(summary.money_with_couriers).toBe(2600.0);
      expect(summary.delivered_unpaid_count).toBe(1);
    });

    it('reconciles bulk courier settlement (charges deducted, funds remitted to bank)', async () => {
      // Settle the delivered parcel: total_receivable = 2600.0
      // Courier remits 2520.0 to Bank, with 80.0 courier charges deducted
      const res = await app.inject({
        method: 'POST',
        url: '/courier/settlements',
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: {
          courier_name: 'Steadfast',
          parcel_ids: [bookedParcelId],
          amount_received: 2520.0,
          charges_deducted: 80.0,
          payment_account_id: bankAccountId,
          notes: 'Steadfast weekly disbursement #ST-1002',
        },
      });

      expect(res.statusCode).toBe(201);
      const settlement = JSON.parse(res.payload);
      expect(settlement.settlement_ref).toMatch(/^SET-STE-\d{6}$/);
      expect(settlement.total_receivable).toBe(2600.0);
      expect(settlement.amount_received).toBe(2520.0);
      expect(settlement.charges_deducted).toBe(80.0);
      expect(settlement.discrepancy_amount).toBe(0.0);

      // Parcel is now marked PAID
      const parcelRes = await app.inject({
        method: 'GET',
        url: `/courier/parcels/${bookedParcelId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      const updatedParcel = JSON.parse(parcelRes.payload);
      expect(updatedParcel.payment_status).toBe('paid');
      expect(updatedParcel.settlement_id).toBe(settlement.id);

      // Trial Balance remains balanced: Dr Bank 2520, Dr Courier Charges 80, Cr Courier Receivable 2600
      const tbRes = await app.inject({ method: 'GET', url: '/ledger/trial-balance', headers: { authorization: `Bearer ${adminToken}` } });
      const tb = JSON.parse(tbRes.payload);
      expect(tb.isBalanced).toBe(true);

      // Money with couriers drops to 0
      const summaryRes = await app.inject({
        method: 'GET',
        url: `/courier/summary?shop_id=${testShopId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(JSON.parse(summaryRes.payload).money_with_couriers).toBe(0.0);
    });
  });
});
