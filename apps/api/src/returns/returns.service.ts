import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { LedgerService } from '../ledger/ledger.service';
import { StockMovementService } from '../stock/stock-movement.service';
import {
  CreateReturnDto,
  ReturnRecord,
  ReturnItem,
} from '@ar-option/shared-types';

@Injectable()
export class ReturnsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly ledgerService: LedgerService,
    private readonly stockMovementService: StockMovementService
  ) {}

  /**
   * Rule 5.1: Unified Return & Exchange document.
   * Holds items coming back, items going out, and the net settlement amount.
   * Stock, ledger, and return document all save in one atomic transaction.
   */
  async createReturn(
    dto: CreateReturnDto,
    shopId: number,
    user: any
  ): Promise<ReturnRecord> {
    if (!shopId) {
      throw new BadRequestException('Rule 1: Shop ID is required to process a return or exchange.');
    }
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('At least one return or exchange item is required.');
    }
    if (!dto.reason || !dto.reason.trim()) {
      throw new BadRequestException('A reason is mandatory for all returns and exchanges.');
    }

    // 1. Manual Return checks
    const isManual = Boolean(dto.is_manual || !dto.sale_id);
    if (isManual) {
      const hasManualPerm =
        user.role === 'admin' ||
        user.role === 'manager' ||
        (user.permissions && user.permissions.includes('returns.manual'));
      if (!hasManualPerm) {
        throw new ForbiddenException(
          'Manual returns require the returns.manual permission.'
        );
      }
      if (!dto.customer_phone || !dto.customer_phone.trim()) {
        throw new BadRequestException(
          'Customer phone number is required for manual returns.'
        );
      }
    }

    let committedId: number;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // 2. Fetch Shop Details
      const shopRes = await client.query(
        'SELECT id, name, code, is_system, is_active FROM locations WHERE id = $1',
        [shopId]
      );
      if (shopRes.rows.length === 0 || !shopRes.rows[0].is_active) {
        throw new NotFoundException(`Active shop #${shopId} not found.`);
      }
      const shop = shopRes.rows[0];
      if (shop.is_system) {
        throw new BadRequestException('Cannot process returns in a system location.');
      }

      // Fetch Damaged System Location
      const damRes = await client.query(
        "SELECT id FROM locations WHERE code = 'LOC-DAMAGED'"
      );
      const damagedLocationId = damRes.rows.length > 0 ? damRes.rows[0].id : null;

      // 3. Process Inbound Items (Coming Back) & Outbound Items (Going Out)
      let inboundSubtotal = 0;
      let outboundSubtotal = 0;
      let inboundTotalCost = 0;
      let outboundTotalCost = 0;

      const processedItems: {
        direction: 'in' | 'out';
        variation_id: number | null;
        unlisted_title?: string;
        quantity: number;
        unit_cost: number;
        unit_price: number;
        condition: string;
        line_total: number;
      }[] = [];

      for (const item of dto.items) {
        if (!item.quantity || item.quantity <= 0) {
          throw new BadRequestException('Item quantity must be greater than zero.');
        }

        if (item.direction === 'in') {
          // INBOUND (Returned by customer)
          if (item.condition === 'unlisted') {
            if (!isManual) {
              throw new BadRequestException('Unlisted items are permitted only on manual returns.');
            }
            if (!item.unlisted_title || !item.unlisted_title.trim()) {
              throw new BadRequestException('Title is required for unlisted returned items.');
            }
            const unitPrice = item.unit_price || 0;
            const lineTotal = unitPrice * item.quantity;
            inboundSubtotal += lineTotal;
            processedItems.push({
              direction: 'in',
              variation_id: null,
              unlisted_title: item.unlisted_title.trim(),
              quantity: item.quantity,
              unit_cost: 0,
              unit_price: unitPrice,
              condition: 'unlisted',
              line_total: lineTotal,
            });
          } else {
            // Listed catalog item
            if (!item.product_variation_id) {
              throw new BadRequestException('Product variation ID is required for catalog items.');
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

            let refundUnitPrice = Number(pv.selling_price);

            // If linked return, verify price paid & quantity cap
            if (dto.sale_id) {
              const saleItemRes = await client.query(
                `SELECT quantity, unit_price, discount, total
                 FROM sale_items
                 WHERE sale_id = $1 AND product_variation_id = $2`,
                [dto.sale_id, item.product_variation_id]
              );
              if (saleItemRes.rows.length === 0) {
                throw new BadRequestException(
                  `Item #${item.product_variation_id} was not purchased in sale #${dto.sale_id}.`
                );
              }
              const si = saleItemRes.rows[0];

              // Check previous returns for quantity cap
              const prevRetRes = await client.query(
                `SELECT COALESCE(SUM(ri.quantity), 0) AS returned_qty
                 FROM return_items ri
                 JOIN returns r ON ri.return_id = r.id
                 WHERE r.sale_id = $1 AND ri.direction = 'in' AND ri.product_variation_id = $2`,
                [dto.sale_id, item.product_variation_id]
              );
              const alreadyReturned = Number(prevRetRes.rows[0].returned_qty);
              if (alreadyReturned + item.quantity > si.quantity) {
                throw new BadRequestException(
                  `Cannot return ${item.quantity} units. Original sale had ${si.quantity}, and ${alreadyReturned} have already been returned.`
                );
              }

              // Refund the price actually paid per Section 5.1
              refundUnitPrice = Number(si.total) / Number(si.quantity);
            } else if (item.unit_price !== undefined) {
              refundUnitPrice = item.unit_price;
            }

            const unitCost = Number(pv.cost_price);
            const lineTotal = refundUnitPrice * item.quantity;
            inboundSubtotal += lineTotal;
            inboundTotalCost += unitCost * item.quantity;

            processedItems.push({
              direction: 'in',
              variation_id: pv.id,
              quantity: item.quantity,
              unit_cost: unitCost,
              unit_price: refundUnitPrice,
              condition: item.condition,
              line_total: lineTotal,
            });
          }
        } else if (item.direction === 'out') {
          // OUTBOUND (Exchange going out to customer)
          if (!item.product_variation_id) {
            throw new BadRequestException('Product variation ID is required for exchange items.');
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
          outboundSubtotal += lineTotal;
          outboundTotalCost += unitCost * item.quantity;

          processedItems.push({
            direction: 'out',
            variation_id: pv.id,
            quantity: item.quantity,
            unit_cost: unitCost,
            unit_price: unitPrice,
            condition: 'exchange_out',
            line_total: lineTotal,
          });
        }
      }

      // 4. Calculate Net Amount: Outbound - Inbound
      // If net > 0: Customer pays the difference
      // If net < 0: Shop refunds customer
      // If net == 0: Even exchange
      const netAmount = outboundSubtotal - inboundSubtotal;

      // 5. Check Approval limit for manual returns
      const approvalSettingRes = await client.query(
        "SELECT value FROM settings WHERE key = 'manual_return_approval_limit'"
      );
      const approvalLimit = approvalSettingRes.rows.length > 0 ? Number(approvalSettingRes.rows[0].value) : 2000.0;

      let isApproved = true;
      let approvedBy: number | null = user.id;

      if (isManual && inboundSubtotal > approvalLimit) {
        const hasApprovePerm =
          user.role === 'admin' ||
          (user.permissions && user.permissions.includes('returns.approve'));
        if (!hasApprovePerm) {
          isApproved = false;
          approvedBy = null;
        }
      }

      // 6. Generate sequential return number inside lock
      const countRes = await client.query(
        'SELECT COALESCE(COUNT(*), 0) + 1 AS next_seq FROM returns WHERE location_id = $1',
        [shopId]
      );
      const nextSeq = countRes.rows[0].next_seq;
      const returnNumber = `RET-${shop.code}-${String(nextSeq).padStart(6, '0')}`;

      // 7. Stock Movements (Rule 4: Stock moves through movement service with audit log)
      for (const item of processedItems) {
        if (item.direction === 'in') {
          if (item.condition === 'resaleable') {
            // Restocked to current shop
            await this.stockMovementService.recordMovement(
              {
                product_variation_id: item.variation_id!,
                from_location_id: null,
                to_location_id: shopId,
                quantity: item.quantity,
                movement_type: 'customer_return',
                source_type: 'return',
                source_id: returnNumber,
                notes: `Resaleable return ${returnNumber}`,
                user_id: user.id,
              },
              client
            );
          } else if (item.condition === 'damaged' && damagedLocationId) {
            // Restocked to damaged system location
            await this.stockMovementService.recordMovement(
              {
                product_variation_id: item.variation_id!,
                from_location_id: null,
                to_location_id: damagedLocationId,
                quantity: item.quantity,
                movement_type: 'damaged_return',
                source_type: 'return',
                source_id: returnNumber,
                notes: `Damaged item return ${returnNumber}`,
                user_id: user.id,
              },
              client
            );
          }
          // unlisted has no stock effect
        } else if (item.direction === 'out') {
          // Outbound item leaves shop inventory
          await this.stockMovementService.recordMovement(
            {
              product_variation_id: item.variation_id!,
              from_location_id: shopId,
              to_location_id: null,
              quantity: item.quantity,
              movement_type: 'exchange_out',
              source_type: 'return',
              source_id: returnNumber,
              notes: `Exchange item issued ${returnNumber}`,
              user_id: user.id,
            },
            client
          );
        }
      }

      // 8. Financial Accounting via Single Posting Function (Rule 3)
      let payAccount: any = null;
      if (dto.payment_account_id) {
        const payRes = await client.query(
          'SELECT id, code, name, type, location_id FROM accounts WHERE id = $1',
          [dto.payment_account_id]
        );
        if (payRes.rows.length > 0) {
          payAccount = payRes.rows[0];
        }
      }

      const ledgerLines: {
        account_code: string;
        direction: 'debit' | 'credit';
        amount: number;
        notes: string;
      }[] = [];

      // A. Return accounting: Dr SALES_RETURNS (inbound price)
      if (inboundSubtotal > 0) {
        ledgerLines.push({
          account_code: 'SALES_RETURNS',
          direction: 'debit',
          amount: inboundSubtotal,
          notes: `Customer return ${returnNumber}`,
        });
      }

      // Inbound COGS/Inventory reversal: Dr INVENTORY, Cr COGS (at cost)
      if (inboundTotalCost > 0) {
        ledgerLines.push({
          account_code: 'INVENTORY',
          direction: 'debit',
          amount: inboundTotalCost,
          notes: `Restock inventory at cost ${returnNumber}`,
        });
        ledgerLines.push({
          account_code: 'COGS',
          direction: 'credit',
          amount: inboundTotalCost,
          notes: `COGS reversal at cost ${returnNumber}`,
        });
      }

      // B. Exchange accounting: Cr SALES_REVENUE (outbound price)
      if (outboundSubtotal > 0) {
        ledgerLines.push({
          account_code: 'SALES_REVENUE',
          direction: 'credit',
          amount: outboundSubtotal,
          notes: `Exchange sale ${returnNumber}`,
        });
      }

      // Outbound COGS/Inventory: Dr COGS, Cr INVENTORY (at cost)
      if (outboundTotalCost > 0) {
        ledgerLines.push({
          account_code: 'COGS',
          direction: 'debit',
          amount: outboundTotalCost,
          notes: `COGS recognition for exchange ${returnNumber}`,
        });
        ledgerLines.push({
          account_code: 'INVENTORY',
          direction: 'credit',
          amount: outboundTotalCost,
          notes: `Inventory reduction for exchange ${returnNumber}`,
        });
      }

      // C. Net Settlement:
      const absNet = Math.abs(netAmount);
      if (absNet > 0 && payAccount) {
        if (netAmount > 0) {
          // Customer pays extra cash: Dr payAccount
          ledgerLines.push({
            account_code: payAccount.code,
            direction: 'debit',
            amount: absNet,
            notes: `Cash collected from customer on exchange ${returnNumber}`,
          });
        } else if (netAmount < 0) {
          // Shop refunds cash to customer: Cr payAccount
          ledgerLines.push({
            account_code: payAccount.code,
            direction: 'credit',
            amount: absNet,
            notes: `Cash refund paid to customer ${returnNumber}`,
          });
        }
      }

      let ledgerEntryId: string | null = null;
      if (ledgerLines.length > 0) {
        const postRes = await this.ledgerService.postEntry(
          {
            shop_id: shopId,
            entry_type: 'return',
            source_type: 'return',
            source_id: returnNumber,
            notes: `Return & Exchange ${returnNumber}`,
            lines: ledgerLines,
          },
          user.id,
          client
        );
        ledgerEntryId = postRes.entry_id;
      }

      // 9. Insert Return Record
      const returnRes = await client.query(
        `INSERT INTO returns (
          return_number,
          location_id,
          sale_id,
          is_manual,
          customer_name,
          customer_phone,
          reason,
          notes,
          inbound_subtotal,
          outbound_subtotal,
          net_amount,
          action_type,
          payment_account_id,
          is_approved,
          approved_by,
          entry_id,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id, created_at`,
        [
          returnNumber,
          shopId,
          dto.sale_id || null,
          isManual,
          dto.customer_name || null,
          dto.customer_phone || null,
          dto.reason.trim(),
          dto.notes?.trim() || null,
          inboundSubtotal,
          outboundSubtotal,
          netAmount,
          dto.action_type || (netAmount > 0 ? 'customer_paid' : netAmount < 0 ? 'refunded' : 'even'),
          payAccount ? payAccount.id : null,
          isApproved,
          approvedBy,
          ledgerEntryId,
          user.id,
        ]
      );
      const returnId = returnRes.rows[0].id;

      // 10. Insert Return Items
      for (const item of processedItems) {
        await client.query(
          `INSERT INTO return_items (
            return_id,
            direction,
            product_variation_id,
            unlisted_title,
            quantity,
            unit_cost,
            unit_price,
            condition,
            total
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            returnId,
            item.direction,
            item.variation_id,
            item.unlisted_title || null,
            item.quantity,
            item.unit_cost,
            item.unit_price,
            item.condition,
            item.line_total,
          ]
        );
      }

      await client.query('COMMIT');
      committedId = returnId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Read back after releasing the connection, so waiting sales cannot exhaust the pool.
    return this.getReturnById(committedId);
  }

  async listReturns(shopId?: number, isManual?: boolean): Promise<ReturnRecord[]> {
    let sql = `
      SELECT 
        r.id,
        r.return_number,
        r.location_id,
        l.name AS shop_name,
        l.code AS shop_code,
        r.sale_id,
        s.invoice_number AS sale_invoice_number,
        r.is_manual,
        r.customer_name,
        r.customer_phone,
        r.reason,
        r.notes,
        r.inbound_subtotal,
        r.outbound_subtotal,
        r.net_amount,
        r.action_type,
        r.payment_account_id,
        a.name AS payment_account_name,
        r.is_approved,
        r.approved_by,
        r.entry_id,
        r.created_by,
        r.created_at
      FROM returns r
      JOIN locations l ON r.location_id = l.id
      LEFT JOIN sales s ON r.sale_id = s.id
      LEFT JOIN accounts a ON r.payment_account_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (shopId) {
      params.push(shopId);
      sql += ` AND r.location_id = $${params.length}`;
    }
    if (isManual !== undefined) {
      params.push(isManual);
      sql += ` AND r.is_manual = $${params.length}`;
    }

    sql += ` ORDER BY r.id DESC`;

    const res = await this.pool.query(sql, params);
    const returns: ReturnRecord[] = [];

    for (const row of res.rows) {
      const items = await this.getReturnItems(row.id);
      returns.push({
        ...row,
        inbound_subtotal: Number(row.inbound_subtotal),
        outbound_subtotal: Number(row.outbound_subtotal),
        net_amount: Number(row.net_amount),
        items,
      });
    }

    return returns;
  }

  async getReturnById(id: number): Promise<ReturnRecord> {
    const res = await this.pool.query(
      `SELECT 
        r.id,
        r.return_number,
        r.location_id,
        l.name AS shop_name,
        l.code AS shop_code,
        r.sale_id,
        s.invoice_number AS sale_invoice_number,
        r.is_manual,
        r.customer_name,
        r.customer_phone,
        r.reason,
        r.notes,
        r.inbound_subtotal,
        r.outbound_subtotal,
        r.net_amount,
        r.action_type,
        r.payment_account_id,
        a.name AS payment_account_name,
        r.is_approved,
        r.approved_by,
        r.entry_id,
        r.created_by,
        r.created_at
      FROM returns r
      JOIN locations l ON r.location_id = l.id
      LEFT JOIN sales s ON r.sale_id = s.id
      LEFT JOIN accounts a ON r.payment_account_id = a.id
      WHERE r.id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Return #${id} not found.`);
    }

    const row = res.rows[0];
    const items = await this.getReturnItems(row.id);

    return {
      ...row,
      inbound_subtotal: Number(row.inbound_subtotal),
      outbound_subtotal: Number(row.outbound_subtotal),
      net_amount: Number(row.net_amount),
      items,
    };
  }

  async approveReturn(id: number, user: any): Promise<ReturnRecord> {
    const hasApprovePerm =
      user.role === 'admin' ||
      (user.permissions && user.permissions.includes('returns.approve'));
    if (!hasApprovePerm) {
      throw new ForbiddenException(
        'Approving high-value returns requires returns.approve permission.'
      );
    }

    const res = await this.pool.query(
      `UPDATE returns
       SET is_approved = true, approved_by = $1
       WHERE id = $2
       RETURNING id`,
      [user.id, id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Return #${id} not found.`);
    }

    return await this.getReturnById(id);
  }

  private async getReturnItems(returnId: number): Promise<ReturnItem[]> {
    const res = await this.pool.query(
      `SELECT 
        ri.id,
        ri.return_id,
        ri.direction,
        ri.product_variation_id,
        p.name AS product_name,
        pv.size,
        pv.sku,
        ri.unlisted_title,
        ri.quantity,
        ri.unit_cost,
        ri.unit_price,
        ri.condition,
        ri.total
      FROM return_items ri
      LEFT JOIN product_variations pv ON ri.product_variation_id = pv.id
      LEFT JOIN products p ON pv.product_id = p.id
      WHERE ri.return_id = $1
      ORDER BY ri.id ASC`,
      [returnId]
    );

    return res.rows.map((row) => ({
      ...row,
      unit_cost: Number(row.unit_cost),
      unit_price: Number(row.unit_price),
      total: Number(row.total),
    }));
  }
}

