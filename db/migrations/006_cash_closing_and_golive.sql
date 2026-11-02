-- Migration 006: Daily Cash Closing, Reconciliation & Pilot Go-Live
-- Step 6: Go-live: Single shop physical cash drawer reconciliation against system daily ledger (agent.md Section 9, Rule 1)

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

-- Role permissions for cash reconciliation
INSERT INTO role_permissions (role, permission)
VALUES
  ('manager', 'cash.reconcile'),
  ('cashier', 'cash.reconcile')
ON CONFLICT DO NOTHING;

