import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { LedgerService } from '../ledger/ledger.service';
import { StockMovementService } from '../stock/stock-movement.service';
import {
  CreateSaleDto,
  LedgerLine,
  Sale,
  SaleItem,
  User,
} from '@ar-option/shared-types';

@Injectable()
export class PosService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly ledgerService: LedgerService,
    private readonly stockMovementService: StockMovementService
  ) {}

  /**
   * Rule 1: Every sale belongs to an active shop.
   * Rule 2: The server calculates all money (recalculates prices, discounts, cogs).
   * Rule 3: Single posting function writes balanced ledger entry in transaction.
   * Rule 4: Stock moves only through stock movement service (counter sale cannot oversell).
   * Rule 6: Idempotent writes via client_ref.
   * Rule 7: Sequential receipts per shop.
   */
  async createSale(
    dto: CreateSaleDto,
    shopId: number,
    user: User
  ): Promise<Sale> {
    if (!shopId) {
      throw new BadRequestException('Shop ID is required to process a sale.');
    }
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('A sale must include at least one item.');
    }
    const rawPayments =
      dto.payments && dto.payments.length > 0
        ? dto.payments
        : dto.payment_account_id
        ? [{ payment_account_id: dto.payment_account_id, amount: 0 }]
        : [];
    if (rawPayments.length === 0) {
      throw new BadRequestException('Payment account is required for counter sales.');
    }
    const variationIds = dto.items.map((i) => i.product_variation_id);
    if (new Set(variationIds).size !== variationIds.length) {
      throw new BadRequestException('Each size can appear only once in a sale. Add to its quantity instead.');
    }

    // Rule 6: Idempotent retry check via client_ref
    if (dto.client_ref) {
      const existingRes = await this.pool.query(
        'SELECT id FROM sales WHERE client_ref = $1 LIMIT 1',
        [dto.client_ref]
      );
      if (existingRes.rows.length > 0) {
        return this.getSaleById(existingRes.rows[0].id);
      }
    }

    // 1. Fetch shop info
    const shopRes = await this.pool.query(
      'SELECT id, name, code, is_system, is_active FROM locations WHERE id = $1',
      [shopId]
    );
    if (shopRes.rows.length === 0 || !shopRes.rows[0].is_active) {
      throw new BadRequestException('Shop does not exist or is inactive.');
    }
    const shop = shopRes.rows[0];

    // 2. Fetch & validate payment accounts
    const validatedPayments: Array<{
      account: { id: number; code: string; name: string; payment_method: string };
      amount: number;
      reference_note?: string;
    }> = [];

    for (const p of rawPayments) {
      const accRes = await this.pool.query(
        'SELECT id, code, name, type, location_id, is_active, payment_method FROM accounts WHERE id = $1',
        [p.payment_account_id]
      );
      if (accRes.rows.length === 0) {
        throw new NotFoundException(`Payment account #${p.payment_account_id} not found.`);
      }
      const payAccount = accRes.rows[0];
      if (payAccount.type !== 'asset') {
        throw new BadRequestException(`Payment account must be an asset account. Got: ${payAccount.type}`);
      }

      // Rule 1: Cross-shop account check
      if (payAccount.location_id !== null && payAccount.location_id !== shopId) {
        throw new BadRequestException(
          `Payment account '${payAccount.code}' belongs to shop ID ${payAccount.location_id}, which does not match active shop ID ${shopId}. Cross-shop sales are prohibited by Rule 1.`
        );
      }

      if (!payAccount.payment_method) {
        throw new BadRequestException(`Account '${payAccount.code}' cannot take payments.`);
      }

      validatedPayments.push({
        account: payAccount,
        amount: Number(p.amount || 0),
        reference_note: p.reference_note?.trim(),
      });
    }

    const payAccount = validatedPayments[0].account;

    // 3. Rule 2: Server calculates all prices and permissions
    const varIds = variationIds;
    const varRes = await this.pool.query(
      `SELECT 
        pv.id AS variation_id,
        pv.size,
        pv.sku,
        p.id AS product_id,
        p.name AS product_name,
        pv.cost_price,
        pv.selling_price
      FROM product_variations pv
      JOIN products p ON pv.product_id = p.id
      WHERE pv.id = ANY($1) AND p.is_active = true AND pv.is_active = true`,
      [varIds]
    );

    const varMap = new Map<number, any>();
    for (const v of varRes.rows) {
      varMap.set(v.variation_id, v);
    }

    // Money is added up in whole paisa so totals cannot drift.
    let subtotalPaisa = 0;
    let listTotalPaisa = 0;
    let reductionPaisa = 0;
    let totalCost = 0;
    const computedItems: {
      variation_id: number;
      product_name: string;
      size: string;
      sku: string;
      quantity: number;
      unit_cost: number;
      unit_price: number;
      discount: number;
      line_total: number;
    }[] = [];

    // Check pos.edit_price permission if price override is requested
    const hasPriceEditPermission =
      user.role === 'admin' ||
      (await this.pool.query(
        "SELECT 1 FROM role_permissions WHERE role = $1 AND permission = 'pos.edit_price'",
        [user.role]
      ).then((r) => r.rows.length > 0));

    for (const item of dto.items) {
      const v = varMap.get(item.product_variation_id);
      if (!v) {
        throw new BadRequestException(`Product variation #${item.product_variation_id} not found or inactive.`);
      }

      if (!item.quantity || item.quantity <= 0) {
        throw new BadRequestException(`Invalid quantity for item '${v.product_name}'. Must be greater than zero.`);
      }

      const catalogPrice = Number(v.selling_price);
      let unitPrice = catalogPrice;

      // Price override check
      if (item.override_price !== undefined && Math.abs(item.override_price - catalogPrice) > 0.001) {
        if (!hasPriceEditPermission) {
          throw new ForbiddenException(
            `Price override on '${v.product_name}' requires 'pos.edit_price' permission.`
          );
        }
        unitPrice = Number(item.override_price);
      }

      const unitCost = Number(v.cost_price);
      const discount = Number(item.discount || 0);
      if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(discount) || discount < 0) {
        throw new BadRequestException(`Invalid price or discount for item '${v.product_name}'.`);
      }

      const grossPaisa = Math.round(unitPrice * 100) * item.quantity;
      const discountPaisa = Math.round(discount * 100);
      if (discountPaisa > grossPaisa) {
        throw new BadRequestException(`Discount on '${v.product_name}' is more than the line amount.`);
      }
      const netPaisa = grossPaisa - discountPaisa;
      const listPaisa = Math.round(catalogPrice * 100) * item.quantity;
      const lineTotal = netPaisa / 100;

      subtotalPaisa += netPaisa;
      listTotalPaisa += listPaisa;
      reductionPaisa += Math.max(0, listPaisa - netPaisa);
      totalCost += unitCost * item.quantity;

      computedItems.push({
        variation_id: v.variation_id,
        product_name: v.product_name,
        size: v.size,
        sku: v.sku,
        quantity: item.quantity,
        unit_cost: unitCost,
        unit_price: unitPrice,
        discount,
        line_total: lineTotal,
      });
    }

    const cartDiscount = Number(dto.discount_amount || 0);
    if (!Number.isFinite(cartDiscount) || cartDiscount < 0) {
      throw new BadRequestException('Invalid discount amount.');
    }
    const cartDiscountPaisa = Math.round(cartDiscount * 100);
    if (cartDiscountPaisa > subtotalPaisa) {
      throw new BadRequestException('Discount cannot be more than the subtotal.');
    }
    reductionPaisa += cartDiscountPaisa;

    // Rule 2: every reduction stays within the user's discount limit. Admins have no limit.
    if (user.role !== 'admin' && reductionPaisa > 0) {
      const limitBasisPoints = Math.round(Number(user.discount_limit_percent || 0) * 100);
      if (reductionPaisa * 10000 > listTotalPaisa * limitBasisPoints) {
        throw new ForbiddenException(
          `A discount of ৳${(reductionPaisa / 100).toFixed(2)} is over your limit of ${user.discount_limit_percent || 0}%.`
        );
      }
    }

    const calculatedSubtotal = subtotalPaisa / 100;
    const finalTotal = (subtotalPaisa - cartDiscountPaisa) / 100;
    const roundedCost = Math.round(totalCost * 100) / 100;

    const finalTotalPaisa = subtotalPaisa - cartDiscountPaisa;
    if (dto.payments && dto.payments.length > 0) {
      const sumPaisa = validatedPayments.reduce((s, p) => s + Math.round(p.amount * 100), 0);
      if (finalTotalPaisa > 0 && sumPaisa !== finalTotalPaisa) {
        throw new BadRequestException(
          `Payments sum (৳${(sumPaisa / 100).toFixed(2)}) must equal total payable (৳${(finalTotalPaisa / 100).toFixed(2)}).`
        );
      }
    } else {
      validatedPayments[0].amount = finalTotal;
    }

    let customerName = dto.customer_name?.trim() || 'Walk-in Customer';
    let customerPhone = dto.customer_phone?.trim() || null;
    let customerId = dto.customer_id ?? null;

    if (customerId) {
      const contactRes = await this.pool.query(
        'SELECT id, name, phone FROM contacts WHERE id = $1 AND is_active = true',
        [customerId]
      );
      if (contactRes.rows.length > 0) {
        if (!dto.customer_name) customerName = contactRes.rows[0].name;
        if (!dto.customer_phone) customerPhone = contactRes.rows[0].phone;
      }
    }

    // Counter sale rule: full payment required at counter (no credit sales per Section 2)
    const paidAmount = finalTotal;

    let committedId: number;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Rule 7: Hold the shop row so two sales cannot take the same number.
      // NO KEY keeps inserts that reference this shop from blocking on it.
      await client.query('SELECT id FROM locations WHERE id = $1 FOR NO KEY UPDATE', [shopId]);

      // Rule 7: Generate short sequential receipt number per shop
      const countRes = await client.query(
        'SELECT COALESCE(COUNT(*), 0) + 1 AS next_seq FROM sales WHERE location_id = $1',
        [shopId]
      );
      const nextSeq = countRes.rows[0].next_seq;
      const invoiceNumber = `${shop.code}-${String(nextSeq).padStart(6, '0')}`;

      // Rule 4: Stock moves through movement service (cannot oversell for counter sale)
      // Locks stock rows in a fixed order so two carts cannot deadlock.
      const itemsByVariation = [...computedItems].sort((a, b) => a.variation_id - b.variation_id);
      for (const item of itemsByVariation) {
        await this.stockMovementService.recordMovement(
          {
            product_variation_id: item.variation_id,
            from_location_id: shopId,
            to_location_id: null, // sold and leaves inventory
            quantity: item.quantity,
            movement_type: 'counter_sale',
            source_type: 'sale',
            source_id: invoiceNumber,
            notes: `Counter sale at ${shop.name}`,
            user_id: user.id,
          },
          client
        );
      }

      // Rule 3: Single posting function writes balanced entries
      // 1. Revenue entry: Dr Payment Accounts, Cr SALES_REVENUE
      // 2. COGS entry: Dr COGS, Cr INVENTORY (at cost)
      // A free sale has no revenue lines and a zero-cost product has no COGS lines.
      const ledgerLines: LedgerLine[] = [];
      if (finalTotal > 0) {
        for (const p of validatedPayments) {
          if (p.amount > 0) {
            ledgerLines.push({
              account_code: p.account.code,
              direction: 'debit',
              amount: p.amount,
              notes: `Counter ${p.account.payment_method} collection ${invoiceNumber}${p.reference_note ? ` (${p.reference_note})` : ''}`,
            });
          }
        }
        ledgerLines.push({
          account_code: 'SALES_REVENUE',
          direction: 'credit',
          amount: finalTotal,
          notes: `Sales revenue ${invoiceNumber}`,
        });
      }
      if (roundedCost > 0) {
        ledgerLines.push(
          {
            account_code: 'COGS',
            direction: 'debit',
            amount: roundedCost,
            notes: `COGS recognition ${invoiceNumber}`,
          },
          {
            account_code: 'INVENTORY',
            direction: 'credit',
            amount: roundedCost,
            notes: `Inventory reduction at cost ${invoiceNumber}`,
          }
        );
      }

      const ledgerRes =
        ledgerLines.length > 0
          ? await this.ledgerService.postEntry(
              {
                shop_id: shopId,
                entry_type: 'sale',
                source_type: 'sale',
                source_id: invoiceNumber,
                client_ref: dto.client_ref,
                notes: `POS Sale ${invoiceNumber}`,
                lines: ledgerLines,
              },
              user.id,
              client
            )
          : null;

      // Insert sale record
      const saleRes = await client.query(
        `INSERT INTO sales (
          invoice_number,
          location_id,
          client_ref,
          customer_id,
          customer_name,
          customer_phone,
          sale_type,
          subtotal,
          discount_amount,
          total_amount,
          paid_amount,
          payment_account_id,
          entry_id,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, 'counter', $7, $8, $9, $10, $11, $12, $13)
        RETURNING id, created_at`,
        [
          invoiceNumber,
          shopId,
          dto.client_ref || null,
          customerId,
          customerName,
          customerPhone,
          calculatedSubtotal,
          cartDiscount,
          finalTotal,
          paidAmount,
          payAccount.id,
          ledgerRes?.entry_id ?? null,
          user.id,
        ]
      );
      const saleId = saleRes.rows[0].id;

      // Insert sale payments
      for (const p of validatedPayments) {
        if (p.amount > 0) {
          await client.query(
            `INSERT INTO sale_payments (
              sale_id,
              payment_account_id,
              payment_method,
              amount,
              reference_note
            ) VALUES ($1, $2, $3, $4, $5)`,
            [
              saleId,
              p.account.id,
              p.account.payment_method,
              p.amount,
              p.reference_note || null,
            ]
          );
        }
      }

      // Insert sale items
      for (const item of computedItems) {
        await client.query(
          `INSERT INTO sale_items (
            sale_id,
            product_variation_id,
            quantity,
            unit_cost,
            unit_price,
            discount,
            total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            saleId,
            item.variation_id,
            item.quantity,
            item.unit_cost,
            item.unit_price,
            item.discount,
            item.line_total,
          ]
        );
      }

      await client.query('COMMIT');
      committedId = saleId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Read back after releasing the connection, so waiting sales cannot exhaust the pool.
    return this.getSaleById(committedId);
  }

  async listSales(shopId?: number): Promise<Sale[]> {
    let sql = `
      SELECT 
        s.id,
        s.invoice_number,
        s.location_id,
        l.name AS shop_name,
        l.code AS shop_code,
        s.client_ref,
        s.customer_name,
        s.customer_phone,
        s.sale_type,
        s.subtotal,
        s.discount_amount,
        s.total_amount,
        s.paid_amount,
        s.payment_account_id,
        a.name AS payment_account_name,
        s.entry_id,
        s.created_by,
        s.created_at
      FROM sales s
      JOIN locations l ON s.location_id = l.id
      LEFT JOIN accounts a ON s.payment_account_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (shopId) {
      params.push(shopId);
      sql += ` AND s.location_id = $${params.length}`;
    }

    sql += ` ORDER BY s.id DESC`;

    const res = await this.pool.query(sql, params);
    const sales: Sale[] = [];

    for (const row of res.rows) {
      const items = await this.getSaleItems(row.id);
      sales.push({
        ...row,
        subtotal: Number(row.subtotal),
        discount_amount: Number(row.discount_amount),
        total_amount: Number(row.total_amount),
        paid_amount: Number(row.paid_amount),
        items,
      });
    }

    return sales;
  }

  async getSaleById(id: number): Promise<Sale> {
    const res = await this.pool.query(
      `SELECT 
        s.id,
        s.invoice_number,
        s.location_id,
        l.name AS shop_name,
        l.code AS shop_code,
        s.client_ref,
        s.customer_id,
        s.customer_name,
        s.customer_phone,
        s.sale_type,
        s.subtotal,
        s.discount_amount,
        s.total_amount,
        s.paid_amount,
        s.payment_account_id,
        a.name AS payment_account_name,
        s.entry_id,
        s.created_by,
        s.created_at
      FROM sales s
      JOIN locations l ON s.location_id = l.id
      LEFT JOIN accounts a ON s.payment_account_id = a.id
      WHERE s.id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Sale #${id} not found.`);
    }

    const row = res.rows[0];
    const items = await this.getSaleItems(row.id);

    const paymentsRes = await this.pool.query(
      `SELECT sp.id, sp.sale_id, sp.payment_account_id, a.name AS payment_account_name,
              sp.payment_method, sp.amount, sp.reference_note, sp.created_at
       FROM sale_payments sp
       JOIN accounts a ON a.id = sp.payment_account_id
       WHERE sp.sale_id = $1 ORDER BY sp.id ASC`,
      [row.id]
    );
    const payments = paymentsRes.rows.map((p) => ({
      ...p,
      amount: Number(p.amount),
    }));

    return {
      ...row,
      subtotal: Number(row.subtotal),
      discount_amount: Number(row.discount_amount),
      total_amount: Number(row.total_amount),
      paid_amount: Number(row.paid_amount),
      items,
      payments,
    };
  }

  private async getSaleItems(saleId: number): Promise<SaleItem[]> {
    const res = await this.pool.query(
      `SELECT 
        si.id,
        si.sale_id,
        si.product_variation_id,
        p.name AS product_name,
        pv.size,
        pv.sku,
        si.quantity,
        si.unit_cost,
        si.unit_price,
        si.discount,
        si.total
      FROM sale_items si
      JOIN product_variations pv ON si.product_variation_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE si.sale_id = $1
      ORDER BY si.id ASC`,
      [saleId]
    );

    return res.rows.map((r) => ({
      ...r,
      quantity: Number(r.quantity),
      unit_cost: Number(r.unit_cost),
      unit_price: Number(r.unit_price),
      discount: Number(r.discount),
      total: Number(r.total),
    }));
  }
}

