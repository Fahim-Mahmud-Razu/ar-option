-- 010_till.sql
-- Till sessions and movements, plus the accounts and permissions the till needs.

INSERT INTO accounts (code, name, type)
VALUES
  ('OWNER_DRAWINGS', 'Owner Drawings', 'equity'),
  ('TILL_OVER_SHORT', 'Till Over / Short', 'expense')
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS till_sessions (
  id BIGSERIAL PRIMARY KEY,
  location_id INTEGER NOT NULL REFERENCES locations(id),
  status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  opened_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  opening_float NUMERIC(15, 2) NOT NULL CHECK (opening_float >= 0),
  open_adjustment NUMERIC(15, 2) NOT NULL DEFAULT 0,
  open_reason TEXT,
  open_note TEXT,
  open_client_ref VARCHAR(100) NOT NULL UNIQUE,
  closed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  closed_at TIMESTAMPTZ,
  expected_cash NUMERIC(15, 2),
  counted_cash NUMERIC(15, 2),
  difference NUMERIC(15, 2),
  difference_reason TEXT,
  handover_amount NUMERIC(15, 2),
  retained_amount NUMERIC(15, 2),
  close_note TEXT,
  close_client_ref VARCHAR(100) UNIQUE,
  daily_closing_id BIGINT REFERENCES daily_cash_closings(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_till_sessions_one_open
  ON till_sessions(location_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_till_sessions_location ON till_sessions(location_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS till_movements (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES till_sessions(id),
  location_id INTEGER NOT NULL REFERENCES locations(id),
  kind VARCHAR(12) NOT NULL CHECK (kind IN ('pay_in', 'pay_out', 'owner_pull')),
  amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
  category_id INTEGER REFERENCES expense_categories(id),
  note TEXT,
  entry_id UUID,
  expense_id INTEGER,
  client_ref VARCHAR(100) NOT NULL UNIQUE,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_till_movements_session ON till_movements(session_id);

INSERT INTO role_permissions (role, permission)
VALUES
  ('manager', 'till.view'),
  ('manager', 'till.open'),
  ('manager', 'till.setup'),
  ('manager', 'till.cash_in'),
  ('manager', 'till.cash_out'),
  ('manager', 'till.close'),
  ('cashier', 'till.view'),
  ('cashier', 'till.open'),
  ('cashier', 'till.cash_in'),
  ('cashier', 'till.cash_out'),
  ('cashier', 'till.close')
ON CONFLICT DO NOTHING;
