-- 008_catalog.sql
-- Categories, brands and per-size prices. The old product-level columns stay until migration 011,
-- so the previous release keeps working while this one is rolled out.

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE RESTRICT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_categories_parent_name
  ON categories (COALESCE(parent_id, 0), lower(name));

CREATE TABLE IF NOT EXISTS brands (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_brands_name ON brands (lower(name));

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS sub_category_id INTEGER REFERENCES categories(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand_id INTEGER REFERENCES brands(id);
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(20) NOT NULL DEFAULT 'pcs';
ALTER TABLE products ADD COLUMN IF NOT EXISTS alert_quantity INTEGER NOT NULL DEFAULT 0;

-- Backfill categories and brands from the old text columns.
-- to_jsonb reads the column by name, so this still works after migration 011 drops it.
INSERT INTO categories (name)
SELECT DISTINCT ON (lower(btrim(to_jsonb(p)->>'category_name'))) btrim(to_jsonb(p)->>'category_name')
FROM products p
WHERE btrim(COALESCE(to_jsonb(p)->>'category_name', '')) <> ''
ON CONFLICT DO NOTHING;

INSERT INTO brands (name)
SELECT DISTINCT ON (lower(btrim(to_jsonb(p)->>'brand_name'))) btrim(to_jsonb(p)->>'brand_name')
FROM products p
WHERE btrim(COALESCE(to_jsonb(p)->>'brand_name', '')) <> ''
ON CONFLICT DO NOTHING;

UPDATE products p
SET category_id = c.id
FROM categories c
WHERE p.category_id IS NULL
  AND c.parent_id IS NULL
  AND lower(c.name) = lower(btrim(COALESCE(to_jsonb(p)->>'category_name', '')));

UPDATE products p
SET brand_id = b.id
FROM brands b
WHERE p.brand_id IS NULL
  AND lower(b.name) = lower(btrim(COALESCE(to_jsonb(p)->>'brand_name', '')));

-- Prices belong to the size.
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS cost_price NUMERIC(14, 2);
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS selling_price NUMERIC(14, 2);
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE product_variations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE product_variations pv
SET cost_price = COALESCE((to_jsonb(p)->>'cost_price')::numeric, 0),
    selling_price = COALESCE((to_jsonb(p)->>'selling_price')::numeric, 0)
FROM products p
WHERE p.id = pv.product_id
  AND (pv.cost_price IS NULL OR pv.selling_price IS NULL);

UPDATE product_variations SET cost_price = 0 WHERE cost_price IS NULL;
UPDATE product_variations SET selling_price = 0 WHERE selling_price IS NULL;

ALTER TABLE product_variations ALTER COLUMN cost_price SET DEFAULT 0;
ALTER TABLE product_variations ALTER COLUMN cost_price SET NOT NULL;
ALTER TABLE product_variations ALTER COLUMN selling_price SET DEFAULT 0;
ALTER TABLE product_variations ALTER COLUMN selling_price SET NOT NULL;

ALTER TABLE product_variations DROP CONSTRAINT IF EXISTS chk_variations_prices;
ALTER TABLE product_variations ADD CONSTRAINT chk_variations_prices
  CHECK (cost_price >= 0 AND selling_price >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS uq_variations_product_size
  ON product_variations (product_id, lower(size));

-- Automatic product codes start at 100001.
CREATE SEQUENCE IF NOT EXISTS product_sku_seq START WITH 100001;

-- Offset account for stock revaluation.
INSERT INTO accounts (code, name, type)
VALUES ('INVENTORY_ADJUSTMENT', 'Inventory Adjustment', 'expense')
ON CONFLICT (code) DO NOTHING;
