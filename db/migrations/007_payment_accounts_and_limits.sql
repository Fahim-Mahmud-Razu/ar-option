-- 007_payment_accounts_and_limits.sql
-- Marks which accounts take money, adds each user's discount limit, and seeds route permissions.

ALTER TABLE accounts ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);

ALTER TABLE accounts DROP CONSTRAINT IF EXISTS chk_accounts_payment_method;
ALTER TABLE accounts ADD CONSTRAINT chk_accounts_payment_method
  CHECK (payment_method IS NULL OR payment_method IN ('cash', 'card', 'bkash', 'nagad', 'rocket', 'bank'));

UPDATE accounts
SET payment_method = 'cash'
WHERE payment_method IS NULL
  AND type = 'asset'
  AND location_id IS NOT NULL
  AND code LIKE 'CASH\_%' ESCAPE '\';

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_shop_cash
  ON accounts(location_id) WHERE payment_method = 'cash';

ALTER TABLE users ADD COLUMN IF NOT EXISTS discount_limit_percent NUMERIC(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_discount_limit;
ALTER TABLE users ADD CONSTRAINT chk_users_discount_limit
  CHECK (discount_limit_percent >= 0 AND discount_limit_percent <= 100);

INSERT INTO role_permissions (role, permission)
VALUES
  ('manager', 'pos.sell'),
  ('manager', 'expenses.create'),
  ('manager', 'products.manage'),
  ('cashier', 'pos.sell'),
  ('cashier', 'expenses.create')
ON CONFLICT DO NOTHING;
