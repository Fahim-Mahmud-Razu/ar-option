import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../database/database.module';
import { StockMovementService } from './stock-movement.service';
import { Product, ProductVariation } from '@ar-option/shared-types';

export interface CreateProductDto {
  name: string;
  code: string;
  category_name?: string;
  brand_name?: string;
  cost_price: number;
  selling_price: number;
  sizes?: string[];
}

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly stockMovementService: StockMovementService
  ) {}

  /**
   * Creates a product with size variations.
   * Rule 4: Stock is tracked per size. A product with no sizes uses one default variation.
   */
  async createProduct(dto: CreateProductDto): Promise<Product> {
    if (!dto.name || !dto.code) {
      throw new BadRequestException('Product name and code are required.');
    }

    const cleanCode = dto.code.trim().toUpperCase();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const prodRes = await client.query(
        `INSERT INTO products (name, code, category_name, brand_name, cost_price, selling_price, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, true)
         RETURNING id, name, code, category_name, brand_name, cost_price, selling_price, is_active`,
        [
          dto.name.trim(),
          cleanCode,
          dto.category_name || null,
          dto.brand_name || null,
          dto.cost_price || 0,
          dto.selling_price || 0,
        ]
      );
      const product = prodRes.rows[0];

      // Variations
      const sizes = dto.sizes && dto.sizes.length > 0 ? dto.sizes : ['Standard'];
      const variations: ProductVariation[] = [];

      for (const size of sizes) {
        const cleanSize = size.trim();
        const sku = `${cleanCode}-${cleanSize.replace(/\s+/g, '_').toUpperCase()}`;
        const varRes = await client.query(
          `INSERT INTO product_variations (product_id, size, sku)
           VALUES ($1, $2, $3)
           RETURNING id, product_id, size, sku`,
          [product.id, cleanSize, sku]
        );
        variations.push(varRes.rows[0]);
      }

      await client.query('COMMIT');

      return {
        ...product,
        cost_price: Number(product.cost_price),
        selling_price: Number(product.selling_price),
        variations,
      };
    } catch (err: any) {
      await client.query('ROLLBACK');
      if (err.code === '23505') {
        throw new BadRequestException(`Product code or SKU already exists.`);
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async listProducts(): Promise<Product[]> {
    const prodRes = await this.pool.query(
      `SELECT id, name, code, category_name, brand_name, cost_price, selling_price, is_active
       FROM products
       WHERE is_active = true
       ORDER BY name ASC`
    );

    const products: Product[] = [];
    for (const p of prodRes.rows) {
      const varRes = await this.pool.query(
        `SELECT id, product_id, size, sku
         FROM product_variations
         WHERE product_id = $1
         ORDER BY id ASC`,
        [p.id]
      );
      products.push({
        ...p,
        cost_price: Number(p.cost_price),
        selling_price: Number(p.selling_price),
        variations: varRes.rows,
      });
    }

    return products;
  }

  async getProductById(id: number): Promise<Product> {
    const prodRes = await this.pool.query(
      `SELECT id, name, code, category_name, brand_name, cost_price, selling_price, is_active
       FROM products
       WHERE id = $1`,
      [id]
    );
    if (prodRes.rows.length === 0) {
      throw new NotFoundException(`Product with ID ${id} not found.`);
    }
    const p = prodRes.rows[0];
    const varRes = await this.pool.query(
      `SELECT id, product_id, size, sku
       FROM product_variations
       WHERE product_id = $1
       ORDER BY id ASC`,
      [id]
    );
    return {
      ...p,
      cost_price: Number(p.cost_price),
      selling_price: Number(p.selling_price),
      variations: varRes.rows,
    };
  }

  /**
   * Adds initial stock to a shop or location via the Movement Service.
   */
  async addInitialStock(
    variationId: number,
    locationId: number,
    quantity: number,
    userId?: number
  ): Promise<{ movement_id: string }> {
    return this.stockMovementService.recordMovement({
      product_variation_id: variationId,
      from_location_id: null,
      to_location_id: locationId,
      quantity,
      movement_type: 'initial_stock',
      notes: 'Initial stock intake',
      user_id: userId,
    });
  }
}

