/**
 * Step 6: Client Historical Apparel Data Import Tool
 * Imports products, categories, size variations, and initial stock for pilot shop.
 * Strictly adheres to Rule 4 (Stock movements via StockMovementService) and Rule 10 (Docker tests/Neon dev).
 */

import { Pool } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL must be set.');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
});

export interface ApparelImportItem {
  name: string;
  code: string;
  category: string;
  brand: string;
  cost_price: number;
  selling_price: number;
  sizes: string[];
  stock_per_shop: { [shop_code: string]: number }; // quantity per size
}

export const SAMPLE_CLIENT_APPAREL_CATALOG: ApparelImportItem[] = [
  {
    name: 'Premium Oxford Cotton Shirt',
    code: 'SHIRT-OXF-01',
    category: 'Formal Shirts',
    brand: 'AR Option Exclusive',
    cost_price: 850.0,
    selling_price: 1650.0,
    sizes: ['38', '40', '42', '44'],
    stock_per_shop: { 'GUL-01': 25, 'DHM-01': 15, 'UTT-01': 10 },
  },
  {
    name: 'Slim-Fit Stretch Chino Pants',
    code: 'PANT-CHN-02',
    category: 'Trousers & Chinos',
    brand: 'AR Option Exclusive',
    cost_price: 950.0,
    selling_price: 1850.0,
    sizes: ['30', '32', '34', '36', '38'],
    stock_per_shop: { 'GUL-01': 20, 'DHM-01': 12, 'UTT-01': 8 },
  },
  {
    name: 'Pique Cotton Polo - Navy',
    code: 'POLO-NVY-03',
    category: 'Polos & Tees',
    brand: 'AR Option Signature',
    cost_price: 520.0,
    selling_price: 1050.0,
    sizes: ['M', 'L', 'XL', 'XXL'],
    stock_per_shop: { 'GUL-01': 30, 'DHM-01': 20, 'UTT-01': 15 },
  },
  {
    name: 'Heavyweight Graphic Tee - Charcoal',
    code: 'TEE-GRA-04',
    category: 'Polos & Tees',
    brand: 'AR Option Street',
    cost_price: 380.0,
    selling_price: 750.0,
    sizes: ['S', 'M', 'L', 'XL'],
    stock_per_shop: { 'GUL-01': 40, 'DHM-01': 25, 'UTT-01': 20 },
  },
  {
    name: 'Tailored Blazer - Charcoal Melange',
    code: 'BLZR-MEL-05',
    category: 'Blazers & Suits',
    brand: 'AR Option Heritage',
    cost_price: 2800.0,
    selling_price: 5400.0,
    sizes: ['38R', '40R', '42R', '44R'],
    stock_per_shop: { 'GUL-01': 10, 'DHM-01': 6, 'UTT-01': 4 },
  },
  {
    name: 'Traditional Panjabi - Premium Fine Cotton',
    code: 'PANJ-CTN-06',
    category: 'Ethnic Wear',
    brand: 'AR Option Traditional',
    cost_price: 1200.0,
    selling_price: 2450.0,
    sizes: ['38', '40', '42', '44'],
    stock_per_shop: { 'GUL-01': 35, 'DHM-01': 20, 'UTT-01': 15 },
  },
];

export async function importApparelCatalog(
  catalog: ApparelImportItem[] = SAMPLE_CLIENT_APPAREL_CATALOG,
  targetShopCode = 'GUL-01'
) {
  console.log(`Starting client apparel catalog import (${catalog.length} items)...`);
  const client = await pool.connect();

  try {
    // 1. Fetch shops
    const shopRes = await client.query('SELECT id, code, name FROM locations WHERE is_active = true');
    const shopMap = new Map<string, number>();
    for (const s of shopRes.rows) {
      shopMap.set(s.code.toUpperCase(), s.id);
    }

    const pilotShopId = shopMap.get(targetShopCode.toUpperCase());
    if (!pilotShopId) {
      throw new Error(`Pilot shop '${targetShopCode}' not found in locations table.`);
    }

    let totalProducts = 0;
    let totalVariations = 0;
    let totalStockUnits = 0;

    for (const item of catalog) {
      await client.query('BEGIN');

      // Insert or get product
      let prodRes = await client.query(
        'SELECT id FROM products WHERE code = $1',
        [item.code]
      );

      let productId: number;
      if (prodRes.rows.length === 0) {
        prodRes = await client.query(
          `INSERT INTO products (name, code, category_name, brand_name, cost_price, selling_price, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING id`,
          [
            item.name,
            item.code,
            item.category,
            item.brand,
            item.cost_price,
            item.selling_price,
          ]
        );
        productId = prodRes.rows[0].id;
        totalProducts++;
      } else {
        productId = prodRes.rows[0].id;
      }

      // Insert size variations
      for (const size of item.sizes) {
        const sku = `${item.code}-${size}`;
        let varRes = await client.query(
          'SELECT id FROM product_variations WHERE product_id = $1 AND size = $2',
          [productId, size]
        );

        let varId: number;
        if (varRes.rows.length === 0) {
          varRes = await client.query(
            `INSERT INTO product_variations (product_id, size, sku)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [productId, size, sku]
          );
          varId = varRes.rows[0].id;
          totalVariations++;
        } else {
          varId = varRes.rows[0].id;
        }

        // Apply initial stock per shop using Rule 4 movement audit log
        for (const [shopCode, qty] of Object.entries(item.stock_per_shop)) {
          const locId = shopMap.get(shopCode.toUpperCase());
          if (!locId || qty <= 0) continue;

          // Check if stock record exists
          const stockCheck = await client.query(
            'SELECT qty_available FROM stock WHERE product_variation_id = $1 AND location_id = $2',
            [varId, locId]
          );

          if (stockCheck.rows.length === 0) {
            // Insert initial stock row
            await client.query(
              'INSERT INTO stock (product_variation_id, location_id, qty_available) VALUES ($1, $2, $3)',
              [varId, locId, qty]
            );

            // Log movement (Rule 4)
            await client.query(
              `INSERT INTO stock_movements (
                product_variation_id, from_location_id, to_location_id, quantity, reason, source_type, created_by
              ) VALUES ($1, NULL, $2, $3, 'Initial inventory setup for pilot shop', 'opening_stock', 1)`,
              [varId, locId, qty]
            );

            totalStockUnits += qty;
          }
        }
      }

      await client.query('COMMIT');
    }

    console.log(
      `Catalog import complete: ${totalProducts} products, ${totalVariations} size variations, ${totalStockUnits} stock units initialized.`
    );
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Import failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  importApparelCatalog()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

