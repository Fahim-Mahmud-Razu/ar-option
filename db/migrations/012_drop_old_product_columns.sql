-- 012_drop_old_product_columns.sql
-- Drop deprecated product-level price and category/brand text columns.
-- Prices, categories and brands are now fully tracked via product_variations, categories and brands tables.

ALTER TABLE products DROP COLUMN IF EXISTS cost_price;
ALTER TABLE products DROP COLUMN IF EXISTS selling_price;
ALTER TABLE products DROP COLUMN IF EXISTS category_name;
ALTER TABLE products DROP COLUMN IF EXISTS brand_name;

