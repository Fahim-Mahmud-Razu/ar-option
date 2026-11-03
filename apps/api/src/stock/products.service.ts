import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { StockMovementService } from './stock-movement.service';
import { LedgerService } from '../ledger/ledger.service';
import { SettingsService } from '../settings/settings.service';
import {
  Product,
  ProductVariation,
  Category,
  Brand,
} from '@ar-option/shared-types';

export interface OpeningStockDto {
  shop_id: number;
  quantity: number;
}

export interface CreateVariationDto {
  size: string;
  sku?: string;
  cost_price?: number;
  selling_price?: number;
  opening_stock?: OpeningStockDto[];
}

export interface CreateProductDto {
  name: string;
  /** Leave empty to take the next automatic code. */
  code?: string;
  category_id?: number | null;
  sub_category_id?: number | null;
  brand_id?: number | null;
  category_name?: string;
  sub_category_name?: string;
  brand_name?: string;
  unit?: string;
  alert_quantity?: number;
  /** Default prices for sizes that do not set their own. */
  cost_price?: number;
  selling_price?: number;
  sizes?: string[];
  variations?: CreateVariationDto[];
}

export interface UpdateVariationDto extends CreateVariationDto {
  /** Present for a saved size. Its SKU and name cannot change. */
  id?: number;
}

export interface UpdateProductDto {
  name?: string;
  category_id?: number | null;
  sub_category_id?: number | null;
  brand_id?: number | null;
  category_name?: string;
  sub_category_name?: string;
  brand_name?: string;
  unit?: string;
  alert_quantity?: number;
  variations?: UpdateVariationDto[];
}

const SKU_LOCK_KEY = 'catalog_sku';

const toMoney = (value: unknown, label: string): number => {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) {
    throw new BadRequestException(`${label} must be zero or more.`);
  }
  return Math.round(n * 100) / 100;
};

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly stockMovementService: StockMovementService,
    private readonly ledgerService: LedgerService,
    private readonly settingsService: SettingsService
  ) {}

  /**
   * Creates a product with size variations, prices per size and optional opening stock,
   * all in one transaction. Rule 4: stock is tracked per size.
   */
  async createProduct(dto: CreateProductDto, userId?: number): Promise<Product> {
    const client = await this.pool.connect();
    let productId: number;
    try {
      await client.query('BEGIN');
      productId = await this.createProductInTx(client, dto, userId);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getProductById(productId);
  }

  /**
   * Same as createProduct, inside a transaction the caller owns (used by import).
   */
  async createProductInTx(
    client: PoolClient,
    dto: CreateProductDto,
    userId?: number,
    sourceId?: string
  ): Promise<number> {
    if (!dto.name || !dto.name.trim()) {
      throw new BadRequestException('Product name is required.');
    }

    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [SKU_LOCK_KEY]);

    const categoryId = dto.category_id ?? (await this.findOrCreateCategory(client, dto.category_name));
    const brandId = dto.brand_id ?? (await this.findOrCreateBrand(client, dto.brand_name));
    const subCategoryId =
      dto.sub_category_id ??
      (categoryId && dto.sub_category_name?.trim()
        ? (await this.insertCategory(client, dto.sub_category_name.trim(), categoryId)).id
        : null);

    const code = dto.code && dto.code.trim()
      ? dto.code.trim().toUpperCase()
      : await this.takeNextCode(client);
    await this.assertSkuFree(client, code, 'Product code');

    const defaultCost = toMoney(dto.cost_price, 'Cost price');
    const defaultSelling = toMoney(dto.selling_price, 'Selling price');

    let variations: CreateVariationDto[] =
      dto.variations && dto.variations.length > 0
        ? dto.variations
        : (dto.sizes && dto.sizes.length > 0 ? dto.sizes : ['Standard']).map((size) => ({ size }));

    // Sizes off: one hidden Standard variation whose SKU is the product code.
    const useSizes = await this.settingsService.useSizes(client);
    if (!useSizes) {
      if (variations.length > 1) {
        throw new BadRequestException('Sizes are turned off. A product has one price and one stock line.');
      }
      const only = variations[0];
      const askedSku = only.sku?.trim().toUpperCase();
      if (askedSku && askedSku !== code) {
        throw new BadRequestException('Sizes are turned off, so the SKU is the product code. Leave the SKU empty or enter the same code.');
      }
      variations = [{ ...only, size: 'Standard', sku: undefined }];
    }

    const seenSizes = new Set<string>();
    const seenSkus = new Set<string>([code]);
    for (const v of variations) {
      const key = (v.size || '').trim().toLowerCase();
      if (!key) throw new BadRequestException('Every size needs a name.');
      if (seenSizes.has(key)) {
        throw new BadRequestException(`Size '${v.size.trim()}' appears twice.`);
      }
      seenSizes.add(key);
    }

    const prodRes = await client.query(
      `INSERT INTO products (name, code, category_id, sub_category_id, brand_id, unit, alert_quantity, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7, true)
       RETURNING id`,
      [
        dto.name.trim(),
        code,
        categoryId,
        subCategoryId,
        brandId,
        (dto.unit || 'pcs').trim(),
        Math.max(0, Math.floor(Number(dto.alert_quantity || 0))),
      ]
    );
    const productId: number = prodRes.rows[0].id;

    for (const v of variations) {
      const size = v.size.trim();
      const sku = !useSizes
        ? code
        : v.sku && v.sku.trim()
          ? v.sku.trim().toUpperCase()
          : `${code}-${size.replace(/\s+/g, '_').toUpperCase()}`;
      if (useSizes && seenSkus.has(sku)) {
        throw new BadRequestException(`SKU '${sku}' appears twice in this product.`);
      }
      seenSkus.add(sku);
      if (sku.length > 70) {
        throw new BadRequestException(`SKU '${sku}' is longer than 70 characters.`);
      }
      // With sizes off the SKU is the code, which was checked above.
      if (useSizes) await this.assertSkuFree(client, sku, 'SKU');

      const cost = v.cost_price !== undefined ? toMoney(v.cost_price, 'Cost price') : defaultCost;
      const selling =
        v.selling_price !== undefined ? toMoney(v.selling_price, 'Selling price') : defaultSelling;

      const varRes = await client.query(
        `INSERT INTO product_variations (product_id, size, sku, cost_price, selling_price)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [productId, size, sku, cost, selling]
      );

      for (const stock of v.opening_stock || []) {
        await this.receiveOpeningStock(
          client,
          varRes.rows[0].id,
          stock.shop_id,
          stock.quantity,
          cost,
          userId,
          sourceId
        );
      }
    }

    return productId;
  }

  /**
   * Opening stock moves stock in and posts Dr Inventory, Cr Owner Equity at cost,
   * so the ledger and the stock value stay equal (Rule 3 and Rule 4).
   */
  async receiveOpeningStock(
    client: PoolClient,
    variationId: number,
    shopId: number,
    quantity: number,
    unitCost: number,
    userId?: number,
    sourceId?: string
  ): Promise<void> {
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0) {
      throw new BadRequestException('Opening stock must be a whole number above zero.');
    }

    const shopRes = await client.query(
      'SELECT id, name, is_system, is_active FROM locations WHERE id = $1',
      [shopId]
    );
    if (shopRes.rows.length === 0 || !shopRes.rows[0].is_active) {
      throw new BadRequestException(`Shop #${shopId} does not exist or is inactive.`);
    }
    if (shopRes.rows[0].is_system) {
      throw new BadRequestException(
        `'${shopRes.rows[0].name}' is a system location and cannot hold opening stock.`
      );
    }

    await this.stockMovementService.recordMovement(
      {
        product_variation_id: variationId,
        from_location_id: null,
        to_location_id: shopId,
        quantity: qty,
        movement_type: 'opening_stock',
        source_type: 'opening_stock',
        source_id: sourceId,
        notes: 'Opening stock',
        user_id: userId,
      },
      client
    );

    const value = Math.round(unitCost * qty * 100) / 100;
    if (value > 0) {
      await this.ledgerService.postEntry(
        {
          shop_id: shopId,
          entry_type: 'opening_stock',
          source_type: 'opening_stock',
          source_id: sourceId,
          notes: `Opening stock for variation #${variationId}`,
          lines: [
            { account_code: 'INVENTORY', direction: 'debit', amount: value },
            { account_code: 'OWNER_EQUITY', direction: 'credit', amount: value },
          ],
        },
        userId,
        client
      );
    }
  }

  /**
   * Edits a product. A new cost on a size that holds stock posts a company-wide revaluation
   * (Rule 3: past entries stay as they are, the change is a new entry).
   */
  async updateProduct(id: number, dto: UpdateProductDto, userId?: number): Promise<Product> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await this.updateProductInTx(client, id, dto, userId);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getProductById(id);
  }

  /** Same as updateProduct, inside a transaction the caller owns (used by import). */
  async updateProductInTx(
    client: PoolClient,
    id: number,
    dto: UpdateProductDto,
    userId?: number,
    sourceId?: string
  ): Promise<void> {
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [SKU_LOCK_KEY]);

    const prodRes = await client.query('SELECT id, code, category_id FROM products WHERE id = $1 FOR UPDATE', [id]);
    if (prodRes.rows.length === 0) {
      throw new NotFoundException(`Product with ID ${id} not found.`);
    }
    const code: string = prodRes.rows[0].code;

    if (dto.name !== undefined && !dto.name.trim()) {
      throw new BadRequestException('Product name is required.');
    }
    const categoryId =
      dto.category_id !== undefined
        ? dto.category_id
        : dto.category_name !== undefined
          ? await this.findOrCreateCategory(client, dto.category_name)
          : undefined;
    const parentCategory = categoryId !== undefined ? categoryId : prodRes.rows[0].category_id;
    if (dto.sub_category_name?.trim() && parentCategory) {
      dto = { ...dto, sub_category_id: (await this.insertCategory(client, dto.sub_category_name.trim(), parentCategory)).id };
    }
    const brandId =
      dto.brand_id !== undefined
        ? dto.brand_id
        : dto.brand_name !== undefined
          ? await this.findOrCreateBrand(client, dto.brand_name)
          : undefined;

    await client.query(
      `UPDATE products SET
         name = COALESCE($2, name),
         category_id = CASE WHEN $3::boolean THEN $4 ELSE category_id END,
         sub_category_id = CASE WHEN $5::boolean THEN $6 ELSE sub_category_id END,
         brand_id = CASE WHEN $7::boolean THEN $8 ELSE brand_id END,
         unit = COALESCE($9, unit),
         alert_quantity = COALESCE($10, alert_quantity),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $1`,
      [
        id,
        dto.name?.trim() ?? null,
        categoryId !== undefined,
        categoryId ?? null,
        dto.sub_category_id !== undefined,
        dto.sub_category_id ?? null,
        brandId !== undefined,
        brandId ?? null,
        dto.unit?.trim() ?? null,
        dto.alert_quantity !== undefined ? Math.max(0, Math.floor(Number(dto.alert_quantity))) : null,
      ]
    );

    let revaluation = 0;
    for (const v of dto.variations || []) {
      if (v.id) {
        const cur = await client.query(
          'SELECT id, cost_price, selling_price FROM product_variations WHERE id = $1 AND product_id = $2 FOR UPDATE',
          [v.id, id]
        );
        if (cur.rows.length === 0) {
          throw new NotFoundException(`Size #${v.id} does not belong to this product.`);
        }
        const oldCost = Number(cur.rows[0].cost_price);
        const newCost = v.cost_price !== undefined ? toMoney(v.cost_price, 'Cost price') : oldCost;
        const newSelling =
          v.selling_price !== undefined ? toMoney(v.selling_price, 'Selling price') : Number(cur.rows[0].selling_price);

        if (newCost !== oldCost) {
          // Lock the stock rows so a sale cannot slip in between the count and the entry.
          const qtyRes = await client.query(
            'SELECT COALESCE(SUM(qty_available), 0) AS qty FROM (SELECT qty_available FROM stock WHERE product_variation_id = $1 ORDER BY id FOR UPDATE) s',
            [v.id]
          );
          revaluation += Math.round((newCost - oldCost) * Number(qtyRes.rows[0].qty) * 100) / 100;
        }

        await client.query(
          `UPDATE product_variations SET cost_price = $2, selling_price = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [v.id, newCost, newSelling]
        );
        // Stock added with this edit is valued at the new cost, after the existing stock is restated.
        for (const stock of v.opening_stock || []) {
          await this.receiveOpeningStock(client, v.id, stock.shop_id, stock.quantity, newCost, userId, sourceId);
        }
      } else {
        if (!(await this.settingsService.useSizes(client))) {
          throw new BadRequestException('Sizes are turned off. Turn them on in Settings to add a size.');
        }
        const size = (v.size || '').trim();
        if (!size) throw new BadRequestException('Every size needs a name.');
        const sku = v.sku && v.sku.trim() ? v.sku.trim().toUpperCase() : `${code}-${size.replace(/\s+/g, '_').toUpperCase()}`;
        const dup = await client.query(
          'SELECT 1 FROM product_variations WHERE product_id = $1 AND lower(size) = lower($2)',
          [id, size]
        );
        if (dup.rows.length > 0) {
          throw new BadRequestException(`Size '${size}' already exists on this product.`);
        }
        await this.assertSkuFree(client, sku, 'SKU');
        const cost = toMoney(v.cost_price, 'Cost price');
        const varRes = await client.query(
          `INSERT INTO product_variations (product_id, size, sku, cost_price, selling_price)
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [id, size, sku, cost, toMoney(v.selling_price, 'Selling price')]
        );
        for (const stock of v.opening_stock || []) {
          await this.receiveOpeningStock(client, varRes.rows[0].id, stock.shop_id, stock.quantity, cost, userId, sourceId);
        }
      }
    }

    if (revaluation !== 0) {
      const amount = Math.abs(revaluation);
      await this.ledgerService.postEntry(
        {
          shop_id: null,
          entry_type: 'inventory_revaluation',
          source_type: 'product',
          source_id: code,
          notes: `Cost change on ${code}`,
          lines:
            revaluation > 0
              ? [
                  { account_code: 'INVENTORY', direction: 'debit', amount },
                  { account_code: 'INVENTORY_ADJUSTMENT', direction: 'credit', amount },
                ]
              : [
                  { account_code: 'INVENTORY_ADJUSTMENT', direction: 'debit', amount },
                  { account_code: 'INVENTORY', direction: 'credit', amount },
                ],
        },
        userId,
        client
      );
    }
  }

  async addInitialStock(
    variationId: number,
    locationId: number,
    quantity: number,
    userId?: number
  ): Promise<{ movement_id: string }> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const varRes = await client.query(
        'SELECT cost_price FROM product_variations WHERE id = $1 FOR SHARE',
        [variationId]
      );
      if (varRes.rows.length === 0) {
        throw new NotFoundException(`Variation #${variationId} not found.`);
      }
      await this.receiveOpeningStock(
        client,
        variationId,
        locationId,
        quantity,
        Number(varRes.rows[0].cost_price),
        userId
      );
      const mv = await client.query(
        'SELECT id FROM stock_movements WHERE product_variation_id = $1 ORDER BY id DESC LIMIT 1',
        [variationId]
      );
      await client.query('COMMIT');
      return { movement_id: String(mv.rows[0].id) };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async listProducts(): Promise<Product[]> {
    const prodRes = await this.pool.query(
      `SELECT p.id, p.name, p.code, p.unit, p.alert_quantity, p.is_active,
              p.category_id, p.sub_category_id, p.brand_id,
              c.name AS category_name, b.name AS brand_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.is_active = true
       ORDER BY p.name ASC`
    );
    const varRes = await this.pool.query(
      `SELECT id, product_id, size, sku, cost_price, selling_price
       FROM product_variations
       WHERE is_active = true
       ORDER BY id ASC`
    );

    const byProduct = new Map<number, ProductVariation[]>();
    for (const v of varRes.rows) {
      const list = byProduct.get(v.product_id) || [];
      list.push(this.mapVariation(v));
      byProduct.set(v.product_id, list);
    }

    return prodRes.rows.map((p) => this.mapProduct(p, byProduct.get(p.id) || []));
  }

  async getProductById(id: number): Promise<Product> {
    const prodRes = await this.pool.query(
      `SELECT p.id, p.name, p.code, p.unit, p.alert_quantity, p.is_active,
              p.category_id, p.sub_category_id, p.brand_id,
              c.name AS category_name, b.name AS brand_name
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.id = $1`,
      [id]
    );
    if (prodRes.rows.length === 0) {
      throw new NotFoundException(`Product with ID ${id} not found.`);
    }
    const varRes = await this.pool.query(
      `SELECT id, product_id, size, sku, cost_price, selling_price
       FROM product_variations
       WHERE product_id = $1 AND is_active = true
       ORDER BY id ASC`,
      [id]
    );
    return this.mapProduct(prodRes.rows[0], varRes.rows.map((v) => this.mapVariation(v)));
  }

  /** Shows the next automatic code without using it up. */
  async peekNextSku(): Promise<{ sku: string }> {
    const res = await this.pool.query('SELECT last_value, is_called FROM product_sku_seq');
    const { last_value, is_called } = res.rows[0];
    return { sku: String(is_called ? Number(last_value) + 1 : Number(last_value)) };
  }

  async skuAvailable(
    code: string
  ): Promise<{ available: boolean; owner?: { product_name: string; size?: string } }> {
    const clean = (code || '').trim().toUpperCase();
    if (!clean) throw new BadRequestException('A code is required.');
    const owner = await this.findSkuOwner(this.pool, clean);
    return owner ? { available: false, owner } : { available: true };
  }

  async listCategories(): Promise<Category[]> {
    const res = await this.pool.query(
      'SELECT id, name, parent_id FROM categories WHERE is_active = true ORDER BY name ASC'
    );
    return res.rows;
  }

  async createCategory(name: string, parentId?: number | null): Promise<Category> {
    const clean = (name || '').trim();
    if (!clean) throw new BadRequestException('Category name is required.');
    const client = await this.pool.connect();
    try {
      return await this.insertCategory(client, clean, parentId ?? null);
    } finally {
      client.release();
    }
  }

  async listBrands(): Promise<Brand[]> {
    const res = await this.pool.query(
      'SELECT id, name FROM brands WHERE is_active = true ORDER BY name ASC'
    );
    return res.rows;
  }

  async createBrand(name: string): Promise<Brand> {
    const clean = (name || '').trim();
    if (!clean) throw new BadRequestException('Brand name is required.');
    const client = await this.pool.connect();
    try {
      return await this.insertBrand(client, clean);
    } finally {
      client.release();
    }
  }

  // ---------------------------------------------------------------- helpers

  private async insertCategory(
    db: Pool | PoolClient,
    name: string,
    parentId: number | null
  ): Promise<Category> {
    const res = await db.query(
      `INSERT INTO categories (name, parent_id) VALUES ($1, $2)
       ON CONFLICT (COALESCE(parent_id, 0), lower(name)) DO UPDATE SET is_active = true
       RETURNING id, name, parent_id`,
      [name, parentId]
    );
    return res.rows[0];
  }

  private async insertBrand(db: Pool | PoolClient, name: string): Promise<Brand> {
    const res = await db.query(
      `INSERT INTO brands (name) VALUES ($1)
       ON CONFLICT (lower(name)) DO UPDATE SET is_active = true
       RETURNING id, name`,
      [name]
    );
    return res.rows[0];
  }

  private async findOrCreateCategory(client: PoolClient, name?: string): Promise<number | null> {
    const clean = (name || '').trim();
    return clean ? (await this.insertCategory(client, clean, null)).id : null;
  }

  private async findOrCreateBrand(client: PoolClient, name?: string): Promise<number | null> {
    const clean = (name || '').trim();
    return clean ? (await this.insertBrand(client, clean)).id : null;
  }

  /** Product codes and size SKUs share one namespace. */
  private async findSkuOwner(
    db: Pool | PoolClient,
    code: string
  ): Promise<{ product_name: string; size?: string } | null> {
    const prod = await db.query(
      'SELECT name FROM products WHERE upper(code) = $1 LIMIT 1',
      [code]
    );
    if (prod.rows.length > 0) return { product_name: prod.rows[0].name };

    const variation = await db.query(
      `SELECT p.name, pv.size FROM product_variations pv
       JOIN products p ON p.id = pv.product_id
       WHERE upper(pv.sku) = $1 LIMIT 1`,
      [code]
    );
    return variation.rows.length > 0
      ? { product_name: variation.rows[0].name, size: variation.rows[0].size }
      : null;
  }

  private async assertSkuFree(client: PoolClient, code: string, label: string): Promise<void> {
    const owner = await this.findSkuOwner(client, code);
    if (owner) {
      throw new BadRequestException(
        `${label} '${code}' is already used by ${owner.product_name}${owner.size ? ` (${owner.size})` : ''}.`
      );
    }
  }

  private async takeNextCode(client: PoolClient): Promise<string> {
    for (let attempt = 0; attempt < 1000; attempt++) {
      const res = await client.query("SELECT nextval('product_sku_seq') AS n");
      const code = String(res.rows[0].n);
      if (!(await this.findSkuOwner(client, code))) return code;
    }
    throw new BadRequestException('Could not find a free automatic code. Enter one by hand.');
  }

  private mapVariation(row: any): ProductVariation {
    return {
      id: row.id,
      product_id: row.product_id,
      size: row.size,
      sku: row.sku,
      cost_price: Number(row.cost_price),
      selling_price: Number(row.selling_price),
    };
  }

  private mapProduct(row: any, variations: ProductVariation[]): Product {
    return {
      id: row.id,
      name: row.name,
      code: row.code,
      category_id: row.category_id,
      sub_category_id: row.sub_category_id,
      brand_id: row.brand_id,
      category_name: row.category_name ?? undefined,
      brand_name: row.brand_name ?? undefined,
      unit: row.unit,
      alert_quantity: row.alert_quantity,
      cost_price: variations[0]?.cost_price ?? 0,
      selling_price: variations[0]?.selling_price ?? 0,
      is_active: row.is_active,
      variations,
    };
  }
}
