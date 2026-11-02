-- Migration 011: POS rebuild (sale_payments and contacts)
-- MultiPay support: counter sales can take multiple payments that together equal the total.
-- Customer contacts: counter and courier sales can link to registered customer contacts.

CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  email VARCHAR(100),
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(lower(name));

CREATE TABLE IF NOT EXISTS sale_payments (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  payment_account_id INTEGER NOT NULL REFERENCES accounts(id),
  payment_method VARCHAR(30) NOT NULL,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  reference_note VARCHAR(150),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale_id ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_acc_id ON sale_payments(payment_account_id);

ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES contacts(id);

INSERT INTO role_permissions (role, permission)
VALUES
  ('admin', 'contacts.view'), ('admin', 'contacts.manage'),
  ('manager', 'contacts.view'), ('manager', 'contacts.manage'),
  ('cashier', 'contacts.view'), ('cashier', 'contacts.manage')
ON CONFLICT DO NOTHING;
