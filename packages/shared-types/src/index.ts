export interface HealthResponse {
  status: 'ok' | 'error';
  migration: number;
  latestMigration: number;
}

export type PermissionKey =
  | 'shops.manage'
  | 'transfers.send'
  | 'transfers.receive'
  | 'returns.create'
  | 'returns.manual'
  | 'returns.approve'
  | 'courier.view'
  | 'courier.manage'
  | 'courier.settle'
  | 'pos.edit_price';

export interface Shop {
  id: number;
  name: string;
  code: string;
  is_active: boolean;
  is_system: boolean;
  created_at?: string;
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
  assigned_shops?: Shop[];
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export interface Account {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  location_id?: number | null;
  is_active: boolean;
}

export type LedgerDirection = 'debit' | 'credit';

export interface LedgerLine {
  account_code: string;
  direction: LedgerDirection;
  amount: number;
  notes?: string;
}

export interface PostEntryDto {
  shop_id?: number | null;
  entry_type: string;
  source_type?: string;
  source_id?: string;
  client_ref?: string;
  notes?: string;
  lines: LedgerLine[];
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  permissions: string[];
}

export interface CreateUserDto {
  name: string;
  email: string;
  password: string;
  role: 'admin' | 'manager' | 'cashier' | 'staff';
  shop_ids?: number[];
}

export interface TrialBalanceItem {
  account_code: string;
  account_name: string;
  account_type: AccountType;
  total_debit: number;
  total_credit: number;
  net_balance: number;
}

// Product & Stock Types (Step 2)
export interface ProductVariation {
  id: number;
  product_id: number;
  size: string;
  sku: string;
}

export interface Product {
  id: number;
  name: string;
  code: string;
  category_name?: string;
  brand_name?: string;
  cost_price: number;
  selling_price: number;
  is_active: boolean;
  variations?: ProductVariation[];
}

export interface StockItem {
  id: number;
  product_variation_id: number;
  location_id: number;
  qty_available: number;
}

export type StockTransferStatus = 'to_send' | 'in_transit' | 'received' | 'cancelled';

export interface StockTransferItem {
  id: number;
  transfer_id: number;
  product_variation_id: number;
  product_name: string;
  size: string;
  sku: string;
  qty_sent: number;
  qty_received: number;
  shortage_reason?: string;
}

export interface StockTransfer {
  id: number;
  transfer_number: string;
  from_location_id: number;
  from_shop_name: string;
  from_shop_code: string;
  to_location_id: number;
  to_shop_name: string;
  to_shop_code: string;
  status: StockTransferStatus;
  sent_by?: number;
  sent_by_name?: string;
  sent_at: string;
  received_by?: number;
  received_by_name?: string;
  received_at?: string;
  notes?: string;
  items?: StockTransferItem[];
}

export interface CreateTransferDto {
  to_location_id: number;
  notes?: string;
  items: {
    product_variation_id: number;
    qty_sent: number;
  }[];
}

export interface ReceiveTransferItemDto {
  item_id: number;
  qty_received: number;
  shortage_reason?: string;
}

export interface ReceiveTransferDto {
  items: ReceiveTransferItemDto[];
  notes?: string;
}

export interface StockByShopGridItem {
  product_id: number;
  product_name: string;
  product_code: string;
  variation_id: number;
  size: string;
  sku: string;
  cost_price: number;
  selling_price: number;
  stocks: {
    location_id: number;
    location_name: string;
    location_code: string;
    is_system: boolean;
    qty: number;
  }[];
}

export interface DashboardKpis {
  total_shops: number;
  total_sales: number;
  stock_value: number;
  pending_transfers: number;
  is_trial_balance_balanced: boolean;
}
