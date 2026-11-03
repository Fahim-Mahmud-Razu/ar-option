-- 013_settings_and_sizes.sql
-- Sizes become a business setting. Off means one variation per product and no size on any screen.

INSERT INTO settings (key, value, description)
VALUES ('use_sizes', 'false', 'When false, each product has one price, SKU and stock line, and sizes are hidden')
ON CONFLICT (key) DO NOTHING;
