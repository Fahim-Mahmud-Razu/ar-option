-- 009_import_batches.sql
-- One row per committed catalog import. The batch number is the Stock In document number.

CREATE SEQUENCE IF NOT EXISTS import_batch_seq START WITH 1;

CREATE TABLE IF NOT EXISTS import_batches (
  id SERIAL PRIMARY KEY,
  batch_no VARCHAR(30) NOT NULL UNIQUE,
  client_ref VARCHAR(100) NOT NULL UNIQUE,
  file_name VARCHAR(255),
  totals JSONB NOT NULL,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO role_permissions (role, permission)
VALUES ('manager', 'products.import')
ON CONFLICT DO NOTHING;
