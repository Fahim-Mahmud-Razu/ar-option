/**
 * Every business table, parents before children. Backup reads this list, restore inserts in this
 * order, and reset truncates from it. A new table must be added here, or backups will miss it.
 */
export const BACKUP_TABLES = [
  'locations',
  'users',
  'user_locations',
  'role_permissions',
  'settings',
  'accounts',
  'expense_categories',
  'categories',
  'brands',
  'products',
  'product_variations',
  'contacts',
  'stock',
  'stock_movements',
  'stock_transfers',
  'stock_transfer_items',
  'sales',
  'sale_items',
  'sale_payments',
  'expenses',
  'returns',
  'return_items',
  'courier_settlements',
  'courier_parcels',
  'courier_parcel_items',
  'daily_cash_closings',
  'till_sessions',
  'till_movements',
  'import_batches',
  'account_transactions',
] as const;

/** Named sequences that are not owned by an id column. */
export const BACKUP_SEQUENCES = ['product_sku_seq', 'import_batch_seq'] as const;

/** Sales, stock, cash and ledger. "Clear transactions" empties exactly these. */
export const TRANSACTION_TABLES = [
  'account_transactions',
  'till_movements',
  'till_sessions',
  'daily_cash_closings',
  'courier_parcel_items',
  'courier_parcels',
  'courier_settlements',
  'return_items',
  'returns',
  'expenses',
  'sale_payments',
  'sale_items',
  'sales',
  'stock_transfer_items',
  'stock_transfers',
  'stock_movements',
  'stock',
  'import_batches',
] as const;

/** Catalog and contacts. "Factory reset" also empties these. */
export const CATALOG_TABLES = ['product_variations', 'products', 'categories', 'brands', 'contacts'] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Shop Rent',
  'Utilities & Electricity',
  'Staff Meals & Entertainment',
  'Supplies & Packaging',
  'Shop Maintenance & Repairs',
  'Marketing & Promotion',
];

export const RESET_CONFIRM = { transactions: 'RESET', factory: 'FACTORY RESET' } as const;
