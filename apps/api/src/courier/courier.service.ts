import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { LedgerService } from '../ledger/ledger.service';
import { StockMovementService } from '../stock/stock-movement.service';
import {
  BookCourierParcelDto,
  UpdateParcelDeliveryDto,
  CreateSettlementDto,
  CourierParcel,
  CourierParcelItem,
  CourierSettlement,
  CourierDeliveryStatus,
  CourierPaymentStatus,
} from '@ar-option/shared-types';

@Injectable()
export class CourierService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly ledgerService: LedgerService,
    private readonly stockMovementService: StockMovementService
  ) {}

  /**
   * Rule 5.2: Booking a courier parcel.
   * - Moves stock from the shop to 'With Courier' (LOC-COURIER).
   * - The sale is recorded at delivery, NOT at booking.
   * - If an advance is paid, Dr bKash/Bank, Cr Customer Advances.
   */
  async bookParcel(
    dto: BookCourierParcelDto,
    shopId: number,
    user: any
  ): Promise<CourierParcel> {
    if (!shopId) {
      throw new BadRequestException('Shop ID is required to book a courier parcel.');
    }
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one item is required in the parcel.');
    }
    if (!dto.customer_name || !dto.customer_phone || !dto.customer_address) {
      throw new BadRequestException('Customer name, phone, and delivery address are required.');
    }
    if (!dto.courier_name) {
      throw new BadRequestException('Courier name is required (e.g. Steadfast, Pathao).');
    }

    let committedId: number;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Verify Shop
      const shopRes = await client.query(
        'SELECT id, name, code, is_system, is_active FROM locations WHERE id = $1',
        [shopId]
      );
      if (shopRes.rows.length === 0 || !shopRes.rows[0].is_active) {
        throw new NotFoundException(`Active shop #${shopId} not found.`);
      }
      const shop = shopRes.rows[0];

      // 2. Fetch 'With Courier' location
      const courierLocRes = await client.query(
        "SELECT id FROM locations WHERE code = 'LOC-COURIER'"
      );
      if (courierLocRes.rows.length === 0) {
        throw new NotFoundException("System location 'LOC-COURIER' not found.");
      }
      const courierLocationId = courierLocRes.rows[0].id;

      // 3. Process items and calculate order value
      let orderValue = 0;
      const itemsToBook: {
        variation_id: number;
        quantity: number;
        unit_price: number;
        unit_cost: number;
        total: number;
      }[] = [];

      for (const item of dto.items) {
        if (!item.quantity || item.quantity <= 0) {
          throw new BadRequestException('Item quantity must be greater than zero.');
        }

        const varRes = await client.query(
          `SELECT pv.id, pv.product_id, pv.size, pv.sku, pv.cost_price, pv.selling_price
           FROM product_variations pv
           JOIN products p ON pv.product_id = p.id
           WHERE pv.id = $1`,
          [item.product_variation_id]
        );
        if (varRes.rows.length === 0) {
          throw new NotFoundException(`Variation #${item.product_variation_id} not found.`);
        }
        const pv = varRes.rows[0];

        const unitPrice = Number(pv.selling_price);
        const unitCost = Number(pv.cost_price);
        const lineTotal = unitPrice * item.quantity;
        orderValue += lineTotal;

        itemsToBook.push({
          variation_id: pv.id,
          quantity: item.quantity,
          unit_price: unitPrice,
          unit_cost: unitCost,
          total: lineTotal,
        });
      }

      // Add delivery fee to order value if applicable
      const deliveryCharge = dto.delivery_charge || 0;
      const totalOrderValue = orderValue + deliveryCharge;
      const advanceAmount = dto.advance_amount || 0;

      if (advanceAmount > totalOrderValue) {
        throw new BadRequestException('Advance amount cannot exceed total order value.');
      }
      const collectibleAmount = totalOrderValue - advanceAmount;

      // 4. Generate sequential parcel code
      const countRes = await client.query(
        'SELECT COALESCE(COUNT(*), 0) + 1 AS next_seq FROM courier_parcels WHERE location_id = $1',
        [shopId]
      );
      const nextSeq = countRes.rows[0].next_seq;
      const parcelCode = `PAR-${shop.code}-${String(nextSeq).padStart(6, '0')}`;

      // 5. Move stock from shop to With Courier
      for (const item of itemsToBook) {
        await this.stockMovementService.recordMovement(
          {
            product_variation_id: item.variation_id,
            from_location_id: shopId,
            to_location_id: courierLocationId,
            quantity: item.quantity,
            movement_type: 'courier_dispatch',
            source_type: 'courier_parcel',
            source_id: parcelCode,
            notes: `Dispatched to ${dto.courier_name} with tracking ${dto.tracking_number || 'N/A'}`,
            user_id: user.id,
          },
          client
        );
      }

      // 6. Handle Advance Payment (Section 5.2: Dr bKash/Bank, Cr Customer Advances)
      let bookingEntryId: string | null = null;
      let advanceAccountId: number | null = null;

      if (advanceAmount > 0) {
        if (!dto.advance_account_id) {
          throw new BadRequestException('Advance account is required when advance is received.');
        }
        const accRes = await client.query(
          'SELECT id, code, name FROM accounts WHERE id = $1',
          [dto.advance_account_id]
        );
        if (accRes.rows.length === 0) {
          throw new NotFoundException(`Advance account #${dto.advance_account_id} not found.`);
        }
        const advanceAccount = accRes.rows[0];
        advanceAccountId = advanceAccount.id;

        const postRes = await this.ledgerService.postEntry(
          {
            shop_id: shopId,
            entry_type: 'advance',
            source_type: 'courier_parcel',
            source_id: parcelCode,
            notes: `Advance for parcel ${parcelCode}`,
            lines: [
              {
                account_code: advanceAccount.code,
                direction: 'debit',
                amount: advanceAmount,
                notes: `Advance collected for ${parcelCode}`,
              },
              {
                account_code: 'CUSTOMER_ADVANCES',
                direction: 'credit',
                amount: advanceAmount,
                notes: `Customer advance liability ${parcelCode}`,
              },
            ],
          },
          user.id,
          client
        );
        bookingEntryId = postRes.entry_id;
      }

      // 7. Insert parcel record
      const parcelRes = await client.query(
        `INSERT INTO courier_parcels (
          parcel_code,
          location_id,
          customer_name,
          customer_phone,
          customer_address,
          courier_name,
          tracking_number,
          order_value,
          advance_amount,
          collectible_amount,
          delivery_charge,
          delivery_status,
          payment_status,
          advance_account_id,
          booking_entry_id,
          notes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'booked', 'unpaid', $12, $13, $14, $15)
        RETURNING id`,
        [
          parcelCode,
          shopId,
          dto.customer_name.trim(),
          dto.customer_phone.trim(),
          dto.customer_address.trim(),
          dto.courier_name.trim(),
          dto.tracking_number?.trim() || null,
          totalOrderValue,
          advanceAmount,
          collectibleAmount,
          deliveryCharge,
          advanceAccountId,
          bookingEntryId,
          dto.notes?.trim() || null,
          user.id,
        ]
      );
      const parcelId = parcelRes.rows[0].id;

      // 8. Insert parcel items
      for (const item of itemsToBook) {
        await client.query(
          `INSERT INTO courier_parcel_items (
            parcel_id,
            product_variation_id,
            quantity,
            unit_price,
            unit_cost,
            total,
            status
          ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
          [
            parcelId,
            item.variation_id,
            item.quantity,
            item.unit_price,
            item.unit_cost,
            item.total,
          ]
        );
      }

      await client.query('COMMIT');
      committedId = parcelId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Read back after releasing the connection, so waiting sales cannot exhaust the pool.
    return this.getParcelById(committedId);
  }

  /**
   * Rule 5.2: Update Delivery Status.
   * "Delivered does not mean paid."
   * When Delivered:
   * - Stock leaves With Courier (sold).
   * - Dr Courier Receivable, Dr Customer Advances (if any), Cr Sales Revenue.
   * - Dr COGS, Cr Inventory.
   * - Cash change: NONE!
   */
  async updateParcelDelivery(
    parcelId: number,
    dto: UpdateParcelDeliveryDto,
    user: any
  ): Promise<CourierParcel> {
    let committedId: number;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const parcelRes = await client.query(
        'SELECT * FROM courier_parcels WHERE id = $1 FOR UPDATE',
        [parcelId]
      );
      if (parcelRes.rows.length === 0) {
        throw new NotFoundException(`Parcel #${parcelId} not found.`);
      }
      const parcel = parcelRes.rows[0];

      if (parcel.delivery_status === 'delivered' && dto.delivery_status === 'delivered') {
        throw new BadRequestException('Parcel is already delivered.');
      }

      const courierLocRes = await client.query(
        "SELECT id FROM locations WHERE code = 'LOC-COURIER'"
      );
      const courierLocationId = courierLocRes.rows[0].id;

      const itemsRes = await client.query(
        'SELECT * FROM courier_parcel_items WHERE parcel_id = $1',
        [parcelId]
      );
      const items = itemsRes.rows;

      if (dto.delivery_status === 'delivered') {
        // 1. Stock leaves With Courier (sold)
        let totalCost = 0;
        for (const item of items) {
          await this.stockMovementService.recordMovement(
            {
              product_variation_id: item.product_variation_id,
              from_location_id: courierLocationId,
              to_location_id: null,
              quantity: item.quantity,
              movement_type: 'courier_sale',
              source_type: 'courier_parcel',
              source_id: parcel.parcel_code,
              notes: `Delivered to customer by ${parcel.courier_name}`,
              user_id: user.id,
            },
            client
          );
          totalCost += Number(item.unit_cost) * item.quantity;
        }

        // 2. Post Delivery Ledger Entry (Rule 5.2):
        // Dr Courier Receivable (collectible_amount)
        // Dr Customer Advances (advance_amount if > 0)
        // Cr Sales Revenue (order_value)
        // Dr COGS (totalCost)
        // Cr Inventory (totalCost)
        const orderValue = Number(parcel.order_value);
        const advanceAmount = Number(parcel.advance_amount);
        const collectibleAmount = Number(parcel.collectible_amount);

        const lines: {
          account_code: string;
          direction: 'debit' | 'credit';
          amount: number;
          notes: string;
        }[] = [];

        if (collectibleAmount > 0) {
          lines.push({
            account_code: 'COURIER_RECEIVABLE',
            direction: 'debit',
            amount: collectibleAmount,
            notes: `Receivable from ${parcel.courier_name} for ${parcel.parcel_code}`,
          });
        }

        if (advanceAmount > 0) {
          lines.push({
            account_code: 'CUSTOMER_ADVANCES',
            direction: 'debit',
            amount: advanceAmount,
            notes: `Advance applied for ${parcel.parcel_code}`,
          });
        }

        lines.push({
          account_code: 'SALES_REVENUE',
          direction: 'credit',
          amount: orderValue,
          notes: `Courier sales revenue for ${parcel.parcel_code}`,
        });

        if (totalCost > 0) {
          lines.push({
            account_code: 'COGS',
            direction: 'debit',
            amount: totalCost,
            notes: `COGS for delivered parcel ${parcel.parcel_code}`,
          });
          lines.push({
            account_code: 'INVENTORY',
            direction: 'credit',
            amount: totalCost,
            notes: `Inventory reduction for ${parcel.parcel_code}`,
          });
        }

        const postRes = await this.ledgerService.postEntry(
          {
            shop_id: parcel.location_id,
            entry_type: 'sale',
            source_type: 'courier_parcel',
            source_id: parcel.parcel_code,
            notes: `Delivered courier sale ${parcel.parcel_code}`,
            lines,
          },
          user.id,
          client
        );

        // Update items to delivered
        await client.query(
          "UPDATE courier_parcel_items SET status = 'delivered' WHERE parcel_id = $1",
          [parcelId]
        );

        // Update parcel status
        await client.query(
          `UPDATE courier_parcels 
           SET delivery_status = 'delivered', 
               delivered_at = CURRENT_TIMESTAMP, 
               delivery_entry_id = $1,
               notes = COALESCE($2, notes)
           WHERE id = $3`,
          [postRes.entry_id, dto.notes || null, parcelId]
        );
      } else if (dto.delivery_status === 'returned') {
        // Stock moves from With Courier back to shop
        for (const item of items) {
          await this.stockMovementService.recordMovement(
            {
              product_variation_id: item.product_variation_id,
              from_location_id: courierLocationId,
              to_location_id: parcel.location_id,
              quantity: item.quantity,
              movement_type: 'courier_return',
              source_type: 'courier_parcel',
              source_id: parcel.parcel_code,
              notes: `Parcel returned from ${parcel.courier_name} back to shop`,
              user_id: user.id,
            },
            client
          );
        }

        await client.query(
          "UPDATE courier_parcel_items SET status = 'returned' WHERE parcel_id = $1",
          [parcelId]
        );

        await client.query(
          `UPDATE courier_parcels 
           SET delivery_status = 'returned',
               notes = COALESCE($1, notes)
           WHERE id = $2`,
          [dto.notes || null, parcelId]
        );
      } else {
        // Status update (e.g. in_transit, partly_delivered, lost)
        await client.query(
          `UPDATE courier_parcels 
           SET delivery_status = $1,
               notes = COALESCE($2, notes)
           WHERE id = $3`,
          [dto.delivery_status, dto.notes || null, parcelId]
        );
      }

      await client.query('COMMIT');
      committedId = parcelId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Read back after releasing the connection, so waiting sales cannot exhaust the pool.
    return this.getParcelById(committedId);
  }

  /**
   * Rule 5.2: Courier Settlement Reconciliation.
   * - Covers many delivered parcels in one remittance.
   * - Reconciles total receivable against amount received + charges deducted.
   * - Explanation required if discrepancy != 0.
   * - Posts Dr Bank/Cash (amount_received), Dr Courier Charges (charges_deducted), Cr Courier Receivable.
   * - Updates all parcels payment_status = 'paid'.
   */
  async createSettlement(
    dto: CreateSettlementDto,
    user: any
  ): Promise<CourierSettlement> {
    if (!dto.parcel_ids || dto.parcel_ids.length === 0) {
      throw new BadRequestException('At least one parcel must be selected for settlement.');
    }
    if (dto.amount_received === undefined || dto.amount_received < 0) {
      throw new BadRequestException('Amount received must be non-negative.');
    }
    if (dto.charges_deducted === undefined || dto.charges_deducted < 0) {
      throw new BadRequestException('Charges deducted must be non-negative.');
    }
    if (!dto.payment_account_id) {
      throw new BadRequestException('Payment account (Bank/Cash) is required.');
    }

    let committedId: number;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Fetch Selected Parcels (must be delivered and unpaid)
      const parcelsRes = await client.query(
        `SELECT id, parcel_code, location_id, collectible_amount, delivery_status, payment_status, courier_name
         FROM courier_parcels
         WHERE id = ANY($1::bigint[])
         FOR UPDATE`,
        [dto.parcel_ids]
      );

      if (parcelsRes.rows.length !== dto.parcel_ids.length) {
        throw new NotFoundException('One or more selected parcels were not found.');
      }

      let totalReceivable = 0;
      let shopId = parcelsRes.rows[0].location_id;

      for (const p of parcelsRes.rows) {
        if (p.delivery_status !== 'delivered' && p.delivery_status !== 'partly_delivered') {
          throw new BadRequestException(
            `Parcel ${p.parcel_code} cannot be settled because it has status '${p.delivery_status}'. Only delivered parcels can be settled.`
          );
        }
        if (p.payment_status === 'paid') {
          throw new BadRequestException(`Parcel ${p.parcel_code} is already settled.`);
        }
        totalReceivable += Number(p.collectible_amount);
      }

      // 2. Discrepancy Check (expected vs received + charges)
      const expectedTotal = totalReceivable;
      const accountedTotal = dto.amount_received + dto.charges_deducted;
      const discrepancy = Math.round((expectedTotal - accountedTotal) * 100) / 100;

      if (Math.abs(discrepancy) > 0.01) {
        if (!dto.discrepancy_reason || !dto.discrepancy_reason.trim()) {
          throw new BadRequestException(
            `Settlement difference of ৳${discrepancy.toFixed(2)} detected. Any difference must be explained with a reason before saving (Rule 5.2).`
          );
        }
      }

      // 3. Verify Payment Account
      const accRes = await client.query(
        'SELECT id, code, name, type FROM accounts WHERE id = $1',
        [dto.payment_account_id]
      );
      if (accRes.rows.length === 0) {
        throw new NotFoundException(`Payment account #${dto.payment_account_id} not found.`);
      }
      const payAccount = accRes.rows[0];

      // 4. Generate settlement ref
      const countRes = await client.query(
        'SELECT COALESCE(COUNT(*), 0) + 1 AS next_seq FROM courier_settlements'
      );
      const settlementRef = `SET-${dto.courier_name.substring(0, 3).toUpperCase()}-${String(countRes.rows[0].next_seq).padStart(6, '0')}`;

      // 5. Post Settlement Ledger Entry (Rule 5.2):
      // Dr Bank/Cash (amount_received)
      // Dr Courier Charges (charges_deducted)
      // If shortage/extra discrepancy: handle appropriately
      // Cr Courier Receivable (totalReceivable)
      const lines: {
        account_code: string;
        direction: 'debit' | 'credit';
        amount: number;
        notes: string;
      }[] = [
        {
          account_code: payAccount.code,
          direction: 'debit',
          amount: dto.amount_received,
          notes: `Courier settlement remittance ${settlementRef}`,
        },
      ];

      if (dto.charges_deducted > 0) {
        lines.push({
          account_code: 'COURIER_CHARGES',
          direction: 'debit',
          amount: dto.charges_deducted,
          notes: `Courier service charges ${settlementRef}`,
        });
      }

      if (discrepancy > 0) {
        // Courier deducted shortage or fee: Dr COURIER_CHARGES
        lines.push({
          account_code: 'COURIER_CHARGES',
          direction: 'debit',
          amount: discrepancy,
          notes: `Shortage adjustment: ${dto.discrepancy_reason}`,
        });
      } else if (discrepancy < 0) {
        // Courier paid extra: Cr SALES_REVENUE
        lines.push({
          account_code: 'SALES_REVENUE',
          direction: 'credit',
          amount: Math.abs(discrepancy),
          notes: `Extra remittance: ${dto.discrepancy_reason}`,
        });
      }

      lines.push({
        account_code: 'COURIER_RECEIVABLE',
        direction: 'credit',
        amount: totalReceivable,
        notes: `Courier receivable cleared for ${parcelsRes.rows.length} parcels (${settlementRef})`,
      });

      const postRes = await this.ledgerService.postEntry(
        {
          shop_id: shopId,
          entry_type: 'courier_settlement',
          source_type: 'courier_settlement',
          source_id: settlementRef,
          notes: `Settlement for ${dto.courier_name} (${parcelsRes.rows.length} parcels)`,
          lines,
        },
        user.id,
        client
      );

      // 6. Insert Settlement Header
      const setRes = await client.query(
        `INSERT INTO courier_settlements (
          settlement_ref,
          location_id,
          courier_name,
          parcel_count,
          total_receivable,
          amount_received,
          charges_deducted,
          discrepancy_amount,
          discrepancy_reason,
          payment_account_id,
          entry_id,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          settlementRef,
          shopId,
          dto.courier_name,
          parcelsRes.rows.length,
          totalReceivable,
          dto.amount_received,
          dto.charges_deducted,
          discrepancy,
          dto.discrepancy_reason || null,
          payAccount.id,
          postRes.entry_id,
          user.id,
        ]
      );
      const settlementId = setRes.rows[0].id;

      // 7. Update Parcels to Paid and link settlement
      await client.query(
        `UPDATE courier_parcels
         SET payment_status = 'paid',
             settlement_id = $1,
             settled_at = CURRENT_TIMESTAMP
         WHERE id = ANY($2::bigint[])`,
        [settlementId, dto.parcel_ids]
      );

      await client.query('COMMIT');
      committedId = settlementId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Read back after releasing the connection, so waiting sales cannot exhaust the pool.
    return this.getSettlementById(committedId);
  }

  async listParcels(
    shopId?: number,
    deliveryStatus?: CourierDeliveryStatus,
    paymentStatus?: CourierPaymentStatus,
    filter?: string
  ): Promise<CourierParcel[]> {
    let sql = `
      SELECT 
        cp.id,
        cp.parcel_code,
        cp.location_id,
        l.name AS shop_name,
        l.code AS shop_code,
        cp.sale_id,
        cp.customer_name,
        cp.customer_phone,
        cp.customer_address,
        cp.courier_name,
        cp.tracking_number,
        cp.order_value,
        cp.advance_amount,
        cp.collectible_amount,
        cp.delivery_charge,
        cp.delivery_status,
        cp.payment_status,
        cp.advance_account_id,
        a.name AS advance_account_name,
        cp.settlement_id,
        cp.booking_entry_id,
        cp.delivery_entry_id,
        cp.notes,
        cp.delivered_at,
        cp.settled_at,
        cp.created_by,
        cp.created_at
      FROM courier_parcels cp
      JOIN locations l ON cp.location_id = l.id
      LEFT JOIN accounts a ON cp.advance_account_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (shopId) {
      params.push(shopId);
      sql += ` AND cp.location_id = $${params.length}`;
    }
    if (deliveryStatus) {
      params.push(deliveryStatus);
      sql += ` AND cp.delivery_status = $${params.length}`;
    }
    if (paymentStatus) {
      params.push(paymentStatus);
      sql += ` AND cp.payment_status = $${params.length}`;
    }

    // Quick filters per DESIGN.md lines 568
    if (filter === 'out_now') {
      sql += " AND cp.delivery_status IN ('booked', 'in_transit')";
    } else if (filter === 'delivered_unpaid') {
      sql += " AND cp.delivery_status = 'delivered' AND cp.payment_status = 'unpaid'";
    } else if (filter === 'returned') {
      sql += " AND cp.delivery_status = 'returned'";
    }

    sql += ` ORDER BY cp.id DESC`;

    const res = await this.pool.query(sql, params);
    const parcels: CourierParcel[] = [];

    for (const row of res.rows) {
      const items = await this.getParcelItems(row.id);
      parcels.push({
        ...row,
        order_value: Number(row.order_value),
        advance_amount: Number(row.advance_amount),
        collectible_amount: Number(row.collectible_amount),
        delivery_charge: Number(row.delivery_charge),
        items,
      });
    }

    return parcels;
  }

  async getParcelById(id: number): Promise<CourierParcel> {
    const res = await this.pool.query(
      `SELECT 
        cp.id,
        cp.parcel_code,
        cp.location_id,
        l.name AS shop_name,
        l.code AS shop_code,
        cp.sale_id,
        cp.customer_name,
        cp.customer_phone,
        cp.customer_address,
        cp.courier_name,
        cp.tracking_number,
        cp.order_value,
        cp.advance_amount,
        cp.collectible_amount,
        cp.delivery_charge,
        cp.delivery_status,
        cp.payment_status,
        cp.advance_account_id,
        a.name AS advance_account_name,
        cp.settlement_id,
        cp.booking_entry_id,
        cp.delivery_entry_id,
        cp.notes,
        cp.delivered_at,
        cp.settled_at,
        cp.created_by,
        cp.created_at
      FROM courier_parcels cp
      JOIN locations l ON cp.location_id = l.id
      LEFT JOIN accounts a ON cp.advance_account_id = a.id
      WHERE cp.id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Parcel #${id} not found.`);
    }

    const row = res.rows[0];
    const items = await this.getParcelItems(row.id);

    return {
      ...row,
      order_value: Number(row.order_value),
      advance_amount: Number(row.advance_amount),
      collectible_amount: Number(row.collectible_amount),
      delivery_charge: Number(row.delivery_charge),
      items,
    };
  }

  async listSettlements(): Promise<CourierSettlement[]> {
    const res = await this.pool.query(
      `SELECT 
        cs.id,
        cs.settlement_ref,
        cs.location_id,
        cs.courier_name,
        cs.parcel_count,
        cs.total_receivable,
        cs.amount_received,
        cs.charges_deducted,
        cs.discrepancy_amount,
        cs.discrepancy_reason,
        cs.payment_account_id,
        a.name AS payment_account_name,
        cs.entry_id,
        cs.created_by,
        cs.created_at
      FROM courier_settlements cs
      JOIN accounts a ON cs.payment_account_id = a.id
      ORDER BY cs.id DESC`
    );

    return res.rows.map((row) => ({
      ...row,
      total_receivable: Number(row.total_receivable),
      amount_received: Number(row.amount_received),
      charges_deducted: Number(row.charges_deducted),
      discrepancy_amount: Number(row.discrepancy_amount),
    }));
  }

  async getSettlementById(id: number): Promise<CourierSettlement> {
    const res = await this.pool.query(
      `SELECT 
        cs.id,
        cs.settlement_ref,
        cs.location_id,
        cs.courier_name,
        cs.parcel_count,
        cs.total_receivable,
        cs.amount_received,
        cs.charges_deducted,
        cs.discrepancy_amount,
        cs.discrepancy_reason,
        cs.payment_account_id,
        a.name AS payment_account_name,
        cs.entry_id,
        cs.created_by,
        cs.created_at
      FROM courier_settlements cs
      JOIN accounts a ON cs.payment_account_id = a.id
      WHERE cs.id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Settlement #${id} not found.`);
    }

    const row = res.rows[0];
    const parcelRes = await this.pool.query(
      'SELECT parcel_code FROM courier_parcels WHERE settlement_id = $1',
      [id]
    );

    return {
      ...row,
      total_receivable: Number(row.total_receivable),
      amount_received: Number(row.amount_received),
      charges_deducted: Number(row.charges_deducted),
      discrepancy_amount: Number(row.discrepancy_amount),
      parcel_codes: parcelRes.rows.map((r) => r.parcel_code),
    };
  }

  /**
   * Dashboard Metric: "Money with couriers" per DESIGN.md line 569
   */
  async getCourierSummary(shopId?: number): Promise<{
    money_with_couriers: number;
    delivered_unpaid_count: number;
    out_now_count: number;
    returned_count: number;
  }> {
    let sql = `
      SELECT 
        COALESCE(SUM(CASE WHEN delivery_status = 'delivered' AND payment_status = 'unpaid' THEN collectible_amount ELSE 0 END), 0) AS money_with_couriers,
        COUNT(CASE WHEN delivery_status = 'delivered' AND payment_status = 'unpaid' THEN 1 END) AS delivered_unpaid_count,
        COUNT(CASE WHEN delivery_status IN ('booked', 'in_transit') THEN 1 END) AS out_now_count,
        COUNT(CASE WHEN delivery_status = 'returned' THEN 1 END) AS returned_count
      FROM courier_parcels
      WHERE 1=1
    `;
    const params: any[] = [];
    if (shopId) {
      params.push(shopId);
      sql += ` AND location_id = $${params.length}`;
    }

    const res = await this.pool.query(sql, params);
    const row = res.rows[0];

    return {
      money_with_couriers: Number(row.money_with_couriers),
      delivered_unpaid_count: Number(row.delivered_unpaid_count),
      out_now_count: Number(row.out_now_count),
      returned_count: Number(row.returned_count),
    };
  }

  private async getParcelItems(parcelId: number): Promise<CourierParcelItem[]> {
    const res = await this.pool.query(
      `SELECT 
        cpi.id,
        cpi.parcel_id,
        cpi.product_variation_id,
        p.name AS product_name,
        pv.size,
        pv.sku,
        cpi.quantity,
        cpi.unit_price,
        cpi.unit_cost,
        cpi.total,
        cpi.status
      FROM courier_parcel_items cpi
      JOIN product_variations pv ON cpi.product_variation_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE cpi.parcel_id = $1
      ORDER BY cpi.id ASC`,
      [parcelId]
    );

    return res.rows.map((row) => ({
      ...row,
      unit_price: Number(row.unit_price),
      unit_cost: Number(row.unit_cost),
      total: Number(row.total),
    }));
  }
}

