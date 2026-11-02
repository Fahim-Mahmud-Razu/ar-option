-- 004_daily_screens.sql
-- Expenses per shop, Sales (POS), Sale Items, Sequential Shop Receipt Sequences

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

-- Seed default company-wide expense categories
INSERT INTO expense_categories (name)
VALUES
  ('Shop Rent'),
  ('Utilities & Electricity'),
  ('Staff Meals & Entertainment'),
  ('Supplies & Packaging'),
  ('Shop Maintenance & Repairs'),
  ('Marketing & Promotion')
ON CONFLICT (name) DO NOTHING;

