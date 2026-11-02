-- Baseline schema for AR Option
-- Keep schema up to date with all migrations

CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS locations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  code VARCHAR(20) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_system BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'staff',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_locations (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, location_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role VARCHAR(50) NOT NULL,
  permission VARCHAR(100) NOT NULL,
  PRIMARY KEY (role, permission)
);

CREATE TABLE IF NOT EXISTS accounts (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
  location_id INTEGER REFERENCES locations(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS account_transactions (
  id BIGSERIAL PRIMARY KEY,
  entry_id UUID NOT NULL,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  location_id INTEGER REFERENCES locations(id),
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('debit', 'credit')),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  entry_type VARCHAR(50) NOT NULL,
  source_type VARCHAR(50),
  source_id VARCHAR(100),
  client_ref VARCHAR(100),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_account_tx_entry_id ON account_transactions(entry_id);
CREATE INDEX IF NOT EXISTS idx_account_tx_location_id ON account_transactions(location_id);
CREATE INDEX IF NOT EXISTS idx_account_tx_account_id ON account_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_account_tx_entry_type ON account_transactions(entry_type);
CREATE INDEX IF NOT EXISTS idx_account_tx_client_ref ON account_transactions(client_ref) WHERE client_ref IS NOT NULL;

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

CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS expenses (
  id SERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  category_id INTEGER NOT NULL REFERENCES expense_categories(id),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  payment_account_id INTEGER NOT NULL REFERENCES accounts(id),
  entry_id UUID,
  ref_no VARCHAR(50),
  notes TEXT,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sales (
  id SERIAL PRIMARY KEY,
  invoice_number VARCHAR(50) NOT NULL UNIQUE,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  client_ref VARCHAR(100) UNIQUE,
  customer_name VARCHAR(100),
  customer_phone VARCHAR(50),
  sale_type VARCHAR(20) NOT NULL DEFAULT 'counter' CHECK (sale_type IN ('counter', 'courier')),
  subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  payment_account_id INTEGER REFERENCES accounts(id),
  entry_id UUID,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sale_items (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_variation_id INTEGER NOT NULL REFERENCES product_variations(id),
  quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  discount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  total NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (total >= 0)
);

CREATE INDEX IF NOT EXISTS idx_expenses_location_id ON expenses(location_id);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_sales_location_id ON sales(location_id);
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_client_ref ON sales(client_ref) WHERE client_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_var_id ON sale_items(product_variation_id);

INSERT INTO expense_categories (name)
VALUES
  ('Shop Rent'),
  ('Utilities & Electricity'),
  ('Staff Meals & Entertainment'),
  ('Supplies & Packaging'),
  ('Shop Maintenance & Repairs'),
  ('Marketing & Promotion')
ON CONFLICT (name) DO NOTHING;


-- ========================================================
-- STEP 4 & 5: Returns & Exchanges, Courier & Settlement
-- ========================================================

INSERT INTO locations (name, code, is_system, is_active)
VALUES ('Damaged Goods', 'LOC-DAMAGED', true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO accounts (code, name, type)
VALUES ('SALES_RETURNS', 'Sales Returns & Allowances', 'expense')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (key, value, description)
VALUES ('manual_return_approval_limit', '2000.00', 'Threshold above which a manual return requires manager returns.approve permission')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS returns (
  id BIGSERIAL PRIMARY KEY,
  return_number VARCHAR(50) NOT NULL UNIQUE,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  sale_id BIGINT REFERENCES sales(id),
  is_manual BOOLEAN NOT NULL DEFAULT false,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  reason TEXT NOT NULL,
  notes TEXT,
  inbound_subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  outbound_subtotal NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  net_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('customer_paid', 'refunded', 'even', 'store_credit')),
  payment_account_id INTEGER REFERENCES accounts(id),
  is_approved BOOLEAN NOT NULL DEFAULT true,
  approved_by INTEGER REFERENCES users(id),
  entry_id UUID,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_returns_location_id ON returns(location_id);
CREATE INDEX IF NOT EXISTS idx_returns_sale_id ON returns(sale_id);
CREATE INDEX IF NOT EXISTS idx_returns_is_manual ON returns(is_manual);

CREATE TABLE IF NOT EXISTS return_items (
  id BIGSERIAL PRIMARY KEY,
  return_id BIGINT NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('in', 'out')),
  product_variation_id INTEGER REFERENCES product_variations(id),
  unlisted_title VARCHAR(255),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  condition VARCHAR(20) NOT NULL CHECK (condition IN ('resaleable', 'damaged', 'unlisted', 'exchange_out')),
  total NUMERIC(14, 2) NOT NULL DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_variation_id ON return_items(product_variation_id);

CREATE TABLE IF NOT EXISTS courier_settlements (
  id BIGSERIAL PRIMARY KEY,
  settlement_ref VARCHAR(50) NOT NULL UNIQUE,
  location_id INTEGER REFERENCES locations(id),
  courier_name VARCHAR(100) NOT NULL,
  parcel_count INTEGER NOT NULL DEFAULT 0,
  total_receivable NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  amount_received NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  charges_deducted NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  discrepancy_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  discrepancy_reason TEXT,
  payment_account_id INTEGER NOT NULL REFERENCES accounts(id),
  entry_id UUID,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS courier_parcels (
  id BIGSERIAL PRIMARY KEY,
  parcel_code VARCHAR(50) NOT NULL UNIQUE,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  sale_id BIGINT REFERENCES sales(id),
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(50) NOT NULL,
  customer_address TEXT NOT NULL,
  courier_name VARCHAR(100) NOT NULL,
  tracking_number VARCHAR(100),
  order_value NUMERIC(14, 2) NOT NULL CHECK (order_value >= 0),
  advance_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00 CHECK (advance_amount >= 0),
  collectible_amount NUMERIC(14, 2) NOT NULL CHECK (collectible_amount >= 0),
  delivery_charge NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  delivery_status VARCHAR(50) NOT NULL DEFAULT 'booked' 
    CHECK (delivery_status IN ('booked', 'in_transit', 'delivered', 'partly_delivered', 'returned', 'lost')),
  payment_status VARCHAR(50) NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'partial', 'paid')),
  advance_account_id INTEGER REFERENCES accounts(id),
  settlement_id BIGINT REFERENCES courier_settlements(id),
  booking_entry_id UUID,
  delivery_entry_id UUID,
  notes TEXT,
  delivered_at TIMESTAMPTZ,
  settled_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_courier_parcels_location_id ON courier_parcels(location_id);
CREATE INDEX IF NOT EXISTS idx_courier_parcels_delivery_status ON courier_parcels(delivery_status);
CREATE INDEX IF NOT EXISTS idx_courier_parcels_payment_status ON courier_parcels(payment_status);
CREATE INDEX IF NOT EXISTS idx_courier_parcels_tracking_number ON courier_parcels(tracking_number);

CREATE TABLE IF NOT EXISTS courier_parcel_items (
  id BIGSERIAL PRIMARY KEY,
  parcel_id BIGINT NOT NULL REFERENCES courier_parcels(id) ON DELETE CASCADE,
  product_variation_id INTEGER NOT NULL REFERENCES product_variations(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(14, 2) NOT NULL,
  unit_cost NUMERIC(14, 2) NOT NULL,
  total NUMERIC(14, 2) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'returned'))
);

CREATE INDEX IF NOT EXISTS idx_courier_parcel_items_parcel_id ON courier_parcel_items(parcel_id);

CREATE TABLE IF NOT EXISTS daily_cash_closings (
  id BIGSERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  closing_date DATE NOT NULL DEFAULT CURRENT_DATE,
  opening_cash NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  cash_sales NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  cash_expenses NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  cash_returns NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  system_expected_cash NUMERIC(15, 2) NOT NULL,
  physical_counted_cash NUMERIC(15, 2) NOT NULL,
  discrepancy_amount NUMERIC(15, 2) NOT NULL DEFAULT 0.00,
  discrepancy_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_cash_closings_location_id ON daily_cash_closings(location_id);
CREATE INDEX IF NOT EXISTS idx_daily_cash_closings_closing_date ON daily_cash_closings(closing_date);
