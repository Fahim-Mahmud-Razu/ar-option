import { Injectable, Inject, BadRequestException } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { Shop } from '@ar-option/shared-types';

@Injectable()
export class ShopsService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /**
   * Rule 1: System locations never appear in shop pickers.
   */
  async listShops(includeSystem = false): Promise<Shop[]> {
    const sql = includeSystem
      ? 'SELECT id, name, code, is_active, is_system FROM locations ORDER BY id ASC'
      : 'SELECT id, name, code, is_active, is_system FROM locations WHERE is_system = false AND is_active = true ORDER BY id ASC';

    const result = await this.pool.query(sql);
    return result.rows;
  }

  async getShopById(id: number): Promise<Shop | null> {
    const result = await this.pool.query(
      'SELECT id, name, code, is_active, is_system FROM locations WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  async createShop(name: string, code: string): Promise<Shop> {
    if (!name || !code) {
      throw new BadRequestException('Shop name and code are required.');
    }
    const cleanCode = code.trim().toUpperCase();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        'INSERT INTO locations (name, code, is_system, is_active) VALUES ($1, $2, false, true) RETURNING id, name, code, is_active, is_system',
        [name.trim(), cleanCode]
      );
      const shop = result.rows[0];

      // Configure default shop payment accounts (Cash, Card, bKash)
      const sanitizedCode = cleanCode.replace(/[^A-Z0-9]/g, '_');
      await client.query(
        `INSERT INTO accounts (code, name, type, location_id, is_active, payment_method)
         VALUES 
           ($1, $2, 'asset', $3, true, 'cash'),
           ($4, $5, 'asset', $6, true, 'card'),
           ($7, $8, 'asset', $9, true, 'bkash')
         ON CONFLICT (code) DO NOTHING`,
        [
          `CASH_${sanitizedCode}`, `${shop.name} Cash`, shop.id,
          `CARD_${sanitizedCode}`, `${shop.name} Card`, shop.id,
          `BKASH_${sanitizedCode}`, `${shop.name} bKash`, shop.id,
        ]
      );

      await client.query('COMMIT');
      return shop;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * The code is the receipt prefix (GUL-000142) and older receipts carry it, so only the name changes.
   * The shop's own accounts ("Gulshan Cash") are renamed with it.
   */
  async updateShop(
    id: number,
    dto: { name?: string; is_active?: boolean }
  ): Promise<Shop> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const cur = await client.query(
        'SELECT id, name, code, is_active, is_system FROM locations WHERE id = $1 FOR UPDATE',
        [id]
      );
      const shop: Shop | undefined = cur.rows[0];
      if (!shop) {
        throw new BadRequestException(`Shop with ID ${id} not found.`);
      }
      if (shop.is_system) {
        throw new BadRequestException('System locations cannot be edited.');
      }

      let name = shop.name;
      if (dto.name !== undefined) {
        name = String(dto.name ?? '').replace(/\s+/g, ' ').trim();
        if (!name) throw new BadRequestException('Shop name is required.');
        if (name.length > 100) throw new BadRequestException('Shop name can be up to 100 characters.');
        const dup = await client.query(
          'SELECT 1 FROM locations WHERE lower(name) = lower($1) AND id <> $2 LIMIT 1',
          [name, id]
        );
        if (dup.rows.length > 0) {
          throw new BadRequestException(`Another shop is already named '${name}'.`);
        }
      }
      const isActive = dto.is_active !== undefined ? Boolean(dto.is_active) : shop.is_active;

      const result = await client.query(
        `UPDATE locations SET name = $2, is_active = $3, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1 RETURNING id, name, code, is_active, is_system`,
        [id, name, isActive]
      );

      if (name !== shop.name) {
        await client.query(
          `UPDATE accounts SET name = $3 || substr(name, length($2) + 1), updated_at = CURRENT_TIMESTAMP
           WHERE location_id = $1 AND left(name, length($2) + 1) = $2 || ' '`,
          [id, shop.name, name]
        );
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
