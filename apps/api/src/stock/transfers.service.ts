import {
  Injectable,
  Inject,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { StockMovementService } from './stock-movement.service';
import {
  CreateTransferDto,
  ReceiveTransferDto,
  StockTransfer,
  StockTransferItem,
  User,
} from '@ar-option/shared-types';

@Injectable()
export class TransfersService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly stockMovementService: StockMovementService
  ) {}

  /**
   * Helper to look up system location for 'In Transit'
   */
  private async getTransitLocationId(): Promise<number> {
    const res = await this.pool.query(
      "SELECT id FROM locations WHERE code = 'LOC-TRANSIT' AND is_system = true LIMIT 1"
    );
    if (res.rows.length === 0) {
      throw new BadRequestException("System location 'In Transit' (LOC-TRANSIT) not found.");
    }
    return res.rows[0].id;
  }

  /**
   * Step 1: Send Stock Transfer
   * Moves stock from source shop to 'In Transit'.
   * Transfers have no effect on the ledger (Section 5.3).
   */
  async sendTransfer(
    dto: CreateTransferDto,
    fromShopId: number,
    user: User
  ): Promise<StockTransfer> {
    if (!dto.to_location_id) {
      throw new BadRequestException('Destination shop (to_location_id) is required.');
    }
    if (fromShopId === dto.to_location_id) {
      throw new BadRequestException('Source shop and destination shop cannot be the same.');
    }
    if (!dto.items || dto.items.length === 0) {
      throw new BadRequestException('A transfer must contain at least one item.');
    }

    // Verify destination shop is a real active shop (not a system location)
    const destRes = await this.pool.query(
      'SELECT id, name, is_system, is_active FROM locations WHERE id = $1',
      [dto.to_location_id]
    );
    if (destRes.rows.length === 0 || !destRes.rows[0].is_active) {
      throw new BadRequestException('Destination shop does not exist or is inactive.');
    }
    if (destRes.rows[0].is_system) {
      throw new BadRequestException('Cannot transfer stock directly to a system location.');
    }

    const transitLocationId = await this.getTransitLocationId();

    let committedId: number;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Generate sequential transfer number TRF-XXXXXX
      const seqRes = await client.query(
        `SELECT COALESCE(MAX(id), 0) + 1 AS next_id FROM stock_transfers`
      );
      const nextId = seqRes.rows[0].next_id;
      const transferNumber = `TRF-${String(nextId).padStart(6, '0')}`;

      // Insert transfer header
      const transferRes = await client.query(
        `INSERT INTO stock_transfers (
          transfer_number,
          from_location_id,
          to_location_id,
          status,
          sent_by,
          sent_at,
          notes
        ) VALUES ($1, $2, $3, 'in_transit', $4, CURRENT_TIMESTAMP, $5)
        RETURNING id, transfer_number, from_location_id, to_location_id, status, sent_by, sent_at, notes`,
        [
          transferNumber,
          fromShopId,
          dto.to_location_id,
          user.id,
          dto.notes || null,
        ]
      );
      const transfer = transferRes.rows[0];

      // Insert items and record stock movements
      for (const item of dto.items) {
        if (!item.qty_sent || item.qty_sent <= 0) {
          throw new BadRequestException('Quantity sent must be greater than zero.');
        }

        await client.query(
          `INSERT INTO stock_transfer_items (
            transfer_id,
            product_variation_id,
            qty_sent,
            qty_received
          ) VALUES ($1, $2, $3, 0)`,
          [transfer.id, item.product_variation_id, item.qty_sent]
        );

        // Movement: Source Shop -> In Transit (LOC-TRANSIT)
        await this.stockMovementService.recordMovement(
          {
            product_variation_id: item.product_variation_id,
            from_location_id: fromShopId,
            to_location_id: transitLocationId,
            quantity: item.qty_sent,
            movement_type: 'transfer_sent',
            source_type: 'stock_transfer',
            source_id: transferNumber,
            notes: `Transfer ${transferNumber} sent to shop ${dto.to_location_id}`,
            user_id: user.id,
          },
          client
        );
      }

      await client.query('COMMIT');
      committedId = transfer.id;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Read back after releasing the connection, so waiting sales cannot exhaust the pool.
    return this.getTransferById(committedId);
  }

  /**
   * Step 2: Receive Stock Transfer
   * Only a user assigned to the destination shop can confirm (Section 5.3).
   * Moves stock from 'In Transit' to destination shop.
   * Shortages require an explanation reason.
   */
  async receiveTransfer(
    transferId: number,
    dto: ReceiveTransferDto,
    user: User
  ): Promise<StockTransfer> {
    const existing = await this.getTransferById(transferId);
    if (!existing) {
      throw new NotFoundException(`Stock transfer #${transferId} not found.`);
    }

    if (existing.status !== 'in_transit') {
      throw new BadRequestException(
        `Transfer is already in '${existing.status}' status. Only transfers in 'in_transit' can be received.`
      );
    }

    // Rule 5.3: Only a user assigned to the destination shop can confirm
    if (user.role !== 'admin') {
      const assignedShops = user.assigned_shops?.map((s) => s.id) || [];
      if (!assignedShops.includes(existing.to_location_id)) {
        throw new ForbiddenException(
          `Access denied. Only a user assigned to destination shop '${existing.to_shop_name}' can confirm this transfer.`
        );
      }
    }

    const itemsMap = new Map<number, StockTransferItem>();
    for (const item of existing.items || []) {
      itemsMap.set(item.id, item);
    }

    // Validate received quantities & shortage reasons
    for (const inputItem of dto.items) {
      const dbItem = itemsMap.get(inputItem.item_id);
      if (!dbItem) {
        throw new BadRequestException(`Transfer item ID ${inputItem.item_id} does not belong to this transfer.`);
      }
      if (inputItem.qty_received < 0) {
        throw new BadRequestException('Received quantity cannot be negative.');
      }
      if (inputItem.qty_received > dbItem.qty_sent) {
        throw new BadRequestException(
          `Received quantity (${inputItem.qty_received}) cannot exceed sent quantity (${dbItem.qty_sent}) for item '${dbItem.product_name}'.`
        );
      }
      // Section 5.3: Shortage requires explanation
      const shortage = dbItem.qty_sent - inputItem.qty_received;
      if (shortage > 0 && (!inputItem.shortage_reason || !inputItem.shortage_reason.trim())) {
        throw new BadRequestException(
          `Shortage of ${shortage} item(s) for '${dbItem.product_name}' requires an explanation reason.`
        );
      }
    }

    const transitLocationId = await this.getTransitLocationId();
    let committedId: number;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const inputItem of dto.items) {
        const dbItem = itemsMap.get(inputItem.item_id)!;
        const qtyReceived = Number(inputItem.qty_received);
        const shortage = dbItem.qty_sent - qtyReceived;

        // 1. Move received quantity: In Transit -> Destination Shop
        if (qtyReceived > 0) {
          await this.stockMovementService.recordMovement(
            {
              product_variation_id: dbItem.product_variation_id,
              from_location_id: transitLocationId,
              to_location_id: existing.to_location_id,
              quantity: qtyReceived,
              movement_type: 'transfer_received',
              source_type: 'stock_transfer',
              source_id: existing.transfer_number,
              notes: `Received at ${existing.to_shop_name}`,
              user_id: user.id,
            },
            client
          );
        }

        // 2. If shortage exists, remove shortage from In Transit (e.g. lost/damaged in transit)
        if (shortage > 0) {
          await this.stockMovementService.recordMovement(
            {
              product_variation_id: dbItem.product_variation_id,
              from_location_id: transitLocationId,
              to_location_id: null,
              quantity: shortage,
              movement_type: 'transfer_shortage',
              source_type: 'stock_transfer',
              source_id: existing.transfer_number,
              notes: `Shortage in transfer: ${inputItem.shortage_reason}`,
              user_id: user.id,
            },
            client
          );
        }

        // Update transfer item record
        await client.query(
          `UPDATE stock_transfer_items
           SET qty_received = $1,
               shortage_reason = $2
           WHERE id = $3`,
          [qtyReceived, inputItem.shortage_reason || null, inputItem.item_id]
        );
      }

      // Update transfer status
      await client.query(
        `UPDATE stock_transfers
         SET status = 'received',
             received_by = $1,
             received_at = CURRENT_TIMESTAMP,
             notes = COALESCE($2, notes),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [user.id, dto.notes || null, transferId]
      );

      await client.query('COMMIT');
      committedId = transferId;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Read back after releasing the connection, so waiting sales cannot exhaust the pool.
    return this.getTransferById(committedId);
  }

  async listTransfers(
    status?: string,
    shopId?: number
  ): Promise<StockTransfer[]> {
    let sql = `
      SELECT 
        t.id,
        t.transfer_number,
        t.from_location_id,
        fl.name AS from_shop_name,
        fl.code AS from_shop_code,
        t.to_location_id,
        tl.name AS to_shop_name,
        tl.code AS to_shop_code,
        t.status,
        t.sent_by,
        su.name AS sent_by_name,
        t.sent_at,
        t.received_by,
        ru.name AS received_by_name,
        t.received_at,
        t.notes
      FROM stock_transfers t
      JOIN locations fl ON t.from_location_id = fl.id
      JOIN locations tl ON t.to_location_id = tl.id
      LEFT JOIN users su ON t.sent_by = su.id
      LEFT JOIN users ru ON t.received_by = ru.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (status) {
      params.push(status);
      sql += ` AND t.status = $${params.length}`;
    }

    if (shopId) {
      params.push(shopId);
      sql += ` AND (t.from_location_id = $${params.length} OR t.to_location_id = $${params.length})`;
    }

    sql += ` ORDER BY t.id DESC`;

    const res = await this.pool.query(sql, params);
    const transfers: StockTransfer[] = [];

    for (const row of res.rows) {
      const items = await this.getTransferItems(row.id);
      transfers.push({
        ...row,
        items,
      });
    }

    return transfers;
  }

  async getTransferById(id: number): Promise<StockTransfer> {
    const res = await this.pool.query(
      `SELECT 
        t.id,
        t.transfer_number,
        t.from_location_id,
        fl.name AS from_shop_name,
        fl.code AS from_shop_code,
        t.to_location_id,
        tl.name AS to_shop_name,
        tl.code AS to_shop_code,
        t.status,
        t.sent_by,
        su.name AS sent_by_name,
        t.sent_at,
        t.received_by,
        ru.name AS received_by_name,
        t.received_at,
        t.notes
      FROM stock_transfers t
      JOIN locations fl ON t.from_location_id = fl.id
      JOIN locations tl ON t.to_location_id = tl.id
      LEFT JOIN users su ON t.sent_by = su.id
      LEFT JOIN users ru ON t.received_by = ru.id
      WHERE t.id = $1`,
      [id]
    );

    if (res.rows.length === 0) {
      throw new NotFoundException(`Stock transfer #${id} not found.`);
    }

    const row = res.rows[0];
    const items = await this.getTransferItems(row.id);
    return {
      ...row,
      items,
    };
  }

  private async getTransferItems(transferId: number): Promise<StockTransferItem[]> {
    const res = await this.pool.query(
      `SELECT 
        ti.id,
        ti.transfer_id,
        ti.product_variation_id,
        p.name AS product_name,
        pv.size,
        pv.sku,
        ti.qty_sent,
        ti.qty_received,
        ti.shortage_reason
      FROM stock_transfer_items ti
      JOIN product_variations pv ON ti.product_variation_id = pv.id
      JOIN products p ON pv.product_id = p.id
      WHERE ti.transfer_id = $1
      ORDER BY ti.id ASC`,
      [transferId]
    );

    return res.rows.map((r) => ({
      ...r,
      qty_sent: Number(r.qty_sent),
      qty_received: Number(r.qty_received),
    }));
  }
}

