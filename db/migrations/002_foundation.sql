-- 002_foundation.sql
-- Foundation tables: Locations (Shops), Users, Permissions, Accounts, Ledger (account_transactions)

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

-- Rule 10: Production gets no seed data except system accounts and system locations
INSERT INTO locations (name, code, is_system, is_active)
VALUES 
  ('With Courier', 'LOC-COURIER', true, true),
  ('In Transit', 'LOC-TRANSIT', true, true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO accounts (code, name, type)
VALUES
  ('INVENTORY', 'Inventory', 'asset'),
  ('COURIER_RECEIVABLE', 'Courier Receivable', 'asset'),
  ('CUSTOMER_ADVANCES', 'Customer Advances', 'liability'),
  ('COURIER_PAYABLE', 'Courier Payable', 'liability'),
  ('OWNER_EQUITY', 'Owner Equity', 'equity'),
  ('SALES_REVENUE', 'Sales Revenue', 'revenue'),
  ('COGS', 'Cost of Goods Sold', 'expense'),
  ('COURIER_CHARGES', 'Courier Charges', 'expense'),
  ('OPERATING_EXPENSES', 'Operating Expenses', 'expense')
ON CONFLICT (code) DO NOTHING;

INSERT INTO role_permissions (role, permission)
VALUES
  ('manager', 'shops.manage'),
  ('manager', 'transfers.send'),
  ('manager', 'transfers.receive'),
  ('manager', 'returns.create'),
  ('manager', 'returns.manual'),
  ('manager', 'returns.approve'),
  ('manager', 'courier.view'),
  ('manager', 'courier.manage'),
  ('manager', 'courier.settle'),
  ('manager', 'pos.edit_price'),
  ('cashier', 'returns.create'),
  ('cashier', 'courier.view')
ON CONFLICT DO NOTHING;

