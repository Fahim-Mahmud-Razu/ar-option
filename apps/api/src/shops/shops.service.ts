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
    const result = await this.pool.query(
      'INSERT INTO locations (name, code, is_system, is_active) VALUES ($1, $2, false, true) RETURNING id, name, code, is_active, is_system',
      [name.trim(), cleanCode]
    );
    const shop = result.rows[0];

    // Configure default shop cash account (Rule 1 & Rule 3: shop-owned cash account)
    const accountCode = `CASH_${cleanCode.replace(/[^A-Z0-9]/g, '_')}`;
    await this.pool.query(
      `INSERT INTO accounts (code, name, type, location_id, is_active)
       VALUES ($1, $2, 'asset', $3, true)
       ON CONFLICT (code) DO NOTHING`,
      [accountCode, `${shop.name} Cash`, shop.id]
    );

    return shop;
  }

  async updateShop(
    id: number,
    dto: { name?: string; is_active?: boolean }
  ): Promise<Shop> {
    const shop = await this.getShopById(id);
    if (!shop) {
      throw new BadRequestException(`Shop with ID ${id} not found.`);
    }
    if (shop.is_system) {
      throw new BadRequestException('System locations cannot be edited.');
    }

    const updates: string[] = [];
    const params: any[] = [id];

    if (dto.name !== undefined) {
      params.push(dto.name.trim());
      updates.push(`name = $${params.length}`);
    }
    if (dto.is_active !== undefined) {
      params.push(dto.is_active);
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      return shop;
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    const result = await this.pool.query(
      `UPDATE locations SET ${updates.join(', ')} WHERE id = $1 RETURNING id, name, code, is_active, is_system`,
      params
    );
    return result.rows[0];
  }
}
