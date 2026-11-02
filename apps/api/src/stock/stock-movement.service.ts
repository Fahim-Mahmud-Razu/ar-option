import {
  Injectable,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';

export interface RecordMovementDto {
  product_variation_id: number;
  from_location_id?: number | null;
  to_location_id?: number | null;
  quantity: number;
  movement_type: string;
  source_type?: string;
  source_id?: string;
  notes?: string;
  user_id?: number;
}

@Injectable()
export class StockMovementService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Rule 4: Every stock change goes through the stock movement service.
   * No direct update of qty_available.
   * Decrements source location (with oversell check) and increments destination location.
   */
  async recordMovement(
    dto: RecordMovementDto,
    externalClient?: PoolClient
  ): Promise<{ movement_id: string }> {
    if (!dto.quantity || dto.quantity <= 0) {
      throw new BadRequestException('Stock movement quantity must be greater than zero.');
    }
    if (!dto.from_location_id && !dto.to_location_id) {
      throw new BadRequestException('A stock movement must specify at least from_location_id or to_location_id.');
    }
    if (dto.from_location_id && dto.from_location_id === dto.to_location_id) {
      throw new BadRequestException('Source location and destination location cannot be identical.');
    }

    const client = externalClient || (await this.pool.connect());
    const isOwner = !externalClient;

    try {
      if (isOwner) {
        await client.query('BEGIN');
      }

      // 1. Decrement from source location if present
      if (dto.from_location_id) {
        const fromStockRes = await client.query(
          `SELECT qty_available FROM stock
           WHERE product_variation_id = $1 AND location_id = $2
           FOR UPDATE`,
          [dto.product_variation_id, dto.from_location_id]
        );

        const currentQty = fromStockRes.rows.length > 0 ? Number(fromStockRes.rows[0].qty_available) : 0;
        if (currentQty < dto.quantity) {
          throw new BadRequestException(
            `Insufficient stock in source location (ID ${dto.from_location_id}). Available: ${currentQty}, Requested: ${dto.quantity}`
          );
        }

        await client.query(
          `UPDATE stock
           SET qty_available = qty_available - $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE product_variation_id = $2 AND location_id = $3`,
          [dto.quantity, dto.product_variation_id, dto.from_location_id]
        );
      }

      // 2. Increment to destination location if present
      if (dto.to_location_id) {
        await client.query(
          `INSERT INTO stock (product_variation_id, location_id, qty_available, updated_at)
           VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
           ON CONFLICT (product_variation_id, location_id)
           DO UPDATE SET
             qty_available = stock.qty_available + EXCLUDED.qty_available,
             updated_at = CURRENT_TIMESTAMP`,
          [dto.product_variation_id, dto.to_location_id, dto.quantity]
        );
      }

      // 3. Insert audit movement record
      const moveRes = await client.query(
        `INSERT INTO stock_movements (
          product_variation_id,
          from_location_id,
          to_location_id,
          quantity,
          movement_type,
          source_type,
          source_id,
          notes,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          dto.product_variation_id,
          dto.from_location_id || null,
          dto.to_location_id || null,
          dto.quantity,
          dto.movement_type,
          dto.source_type || null,
          dto.source_id || null,
          dto.notes || null,
          dto.user_id || null,
        ]
      );

      if (isOwner) {
        await client.query('COMMIT');
      }

      return { movement_id: moveRes.rows[0].id.toString() };
    } catch (err) {
      if (isOwner) {
        await client.query('ROLLBACK');
      }
      throw err;
    } finally {
      if (isOwner) {
        client.release();
      }
    }
  }

  /**
   * Definition of Done verification helper:
   * Proves that sum of inbound movements minus outbound movements matches stock.qty_available.
   */
  async verifyMovementHistoryMatchesStock(
    variationId: number,
    locationId: number
  ): Promise<{ matches: boolean; stockQty: number; calculatedQty: number }> {
    const stockRes = await this.pool.query(
      `SELECT COALESCE(qty_available, 0) as qty FROM stock
       WHERE product_variation_id = $1 AND location_id = $2`,
      [variationId, locationId]
    );
    const stockQty = stockRes.rows.length > 0 ? Number(stockRes.rows[0].qty) : 0;

    const inboundRes = await this.pool.query(
      `SELECT COALESCE(SUM(quantity), 0) as total FROM stock_movements
       WHERE product_variation_id = $1 AND to_location_id = $2`,
      [variationId, locationId]
    );
    const inboundTotal = Number(inboundRes.rows[0].total);

    const outboundRes = await this.pool.query(
      `SELECT COALESCE(SUM(quantity), 0) as total FROM stock_movements
       WHERE product_variation_id = $1 AND from_location_id = $2`,
      [variationId, locationId]
    );
    const outboundTotal = Number(outboundRes.rows[0].total);

    const calculatedQty = inboundTotal - outboundTotal;
    const matches = Math.abs(stockQty - calculatedQty) < 0.001;

    return {
      matches,
      stockQty,
      calculatedQty,
    };
  }
}

