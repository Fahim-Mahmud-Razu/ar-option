-- Migration 005: Returns & Exchanges, Courier Parcels & Settlements

-- 1. System Location for Damaged Stock
INSERT INTO locations (name, code, is_system, is_active)
VALUES ('Damaged Goods', 'LOC-DAMAGED', true, true)
ON CONFLICT (code) DO NOTHING;

-- 2. Sales Returns Contra-Account
INSERT INTO accounts (code, name, type)
VALUES ('SALES_RETURNS', 'Sales Returns & Allowances', 'expense')
ON CONFLICT (code) DO NOTHING;

-- 3. Settings table for operational parameters
CREATE TABLE IF NOT EXISTS settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO settings (key, value, description)
VALUES ('manual_return_approval_limit', '2000.00', 'Threshold above which a manual return requires manager returns.approve permission')
ON CONFLICT (key) DO NOTHING;

-- 4. Returns & Exchanges
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
  net_amount NUMERIC(14, 2) NOT NULL DEFAULT 0.00, -- positive = customer pays, negative = shop refunds
  action_type VARCHAR(50) NOT NULL CHECK (action_type IN ('customer_paid', 'refunded', 'even', 'store_credit')),
  payment_account_id INTEGER REFERENCES accounts(id),
  is_approved BOOLEAN NOT NULL DEFAULT true,
  approved_by INTEGER REFERENCES users(id),
  entry_id UUID, -- ledger entry uuid
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
  unlisted_title VARCHAR(255), -- for manual unlisted returns
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  unit_price NUMERIC(14, 2) NOT NULL DEFAULT 0.00,
  condition VARCHAR(20) NOT NULL CHECK (condition IN ('resaleable', 'damaged', 'unlisted', 'exchange_out')),
  total NUMERIC(14, 2) NOT NULL DEFAULT 0.00
);

CREATE INDEX IF NOT EXISTS idx_return_items_return_id ON return_items(return_id);
CREATE INDEX IF NOT EXISTS idx_return_items_variation_id ON return_items(product_variation_id);

-- 5. Courier Settlements
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

-- 6. Courier Parcels
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

