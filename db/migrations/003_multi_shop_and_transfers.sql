-- 003_multi_shop_and_transfers.sql
-- Products, Variations (sizes), Stock, Stock Movements, and Two-Step Stock Transfers

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  code VARCHAR(50) NOT NULL UNIQUE,
  category_name VARCHAR(100),
  brand_name VARCHAR(100),
  cost_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  selling_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (selling_price >= 0),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variations (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size VARCHAR(50) NOT NULL DEFAULT 'Standard',
  sku VARCHAR(70) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock (
  id SERIAL PRIMARY KEY,
  product_variation_id INTEGER NOT NULL REFERENCES product_variations(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  qty_available NUMERIC(14, 2) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_variation_location UNIQUE(product_variation_id, location_id)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGSERIAL PRIMARY KEY,
  product_variation_id INTEGER NOT NULL REFERENCES product_variations(id),
  from_location_id INTEGER REFERENCES locations(id),
  to_location_id INTEGER REFERENCES locations(id),
  quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
  movement_type VARCHAR(50) NOT NULL,
  source_type VARCHAR(50),
  source_id VARCHAR(100),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id SERIAL PRIMARY KEY,
  transfer_number VARCHAR(50) NOT NULL UNIQUE,
  from_location_id INTEGER NOT NULL REFERENCES locations(id),
  to_location_id INTEGER NOT NULL REFERENCES locations(id),
  status VARCHAR(20) NOT NULL DEFAULT 'in_transit' CHECK (status IN ('to_send', 'in_transit', 'received', 'cancelled')),
  sent_by INTEGER REFERENCES users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  received_by INTEGER REFERENCES users(id),
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS stock_transfer_items (
  id SERIAL PRIMARY KEY,
  transfer_id INTEGER NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  product_variation_id INTEGER NOT NULL REFERENCES product_variations(id),
  qty_sent NUMERIC(14, 2) NOT NULL CHECK (qty_sent > 0),
  qty_received NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  shortage_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_stock_var_loc ON stock(product_variation_id, location_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_var ON stock_movements(product_variation_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_from_loc ON stock_movements(from_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_to_loc ON stock_movements(to_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_to ON stock_transfers(from_location_id, to_location_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_status ON stock_transfers(status);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer ON stock_transfer_items(transfer_id);

