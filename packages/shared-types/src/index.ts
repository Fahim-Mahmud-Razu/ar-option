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
  | 'pos.edit_price'
  | 'pos.sell'
  | 'cash.reconcile'
  | 'expenses.create'
  | 'products.manage'
  | 'products.import'
  | 'ledger.post'
  | 'till.view'
  | 'till.open'
  | 'till.setup'
  | 'till.cash_in'
  | 'till.cash_out'
  | 'till.close';

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
  discount_limit_percent?: number;
  assigned_shops?: Shop[];
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
export type PaymentMethod = 'cash' | 'card' | 'bkash' | 'nagad' | 'rocket' | 'bank';

export interface Account {
  id: number;
  code: string;
  name: string;
  type: AccountType;
  location_id?: number | null;
  is_active: boolean;
  payment_method?: PaymentMethod | null;
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
  discount_limit_percent?: number;
}

export interface SetupStatus {
  needs_setup: boolean;
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
  cost_price: number;
  selling_price: number;
}

export interface Category {
  id: number;
  name: string;
  parent_id: number | null;
}

export interface Brand {
  id: number;
  name: string;
}

export interface Product {
  id: number;
  name: string;
  code: string;
  category_id?: number | null;
  sub_category_id?: number | null;
  brand_id?: number | null;
  category_name?: string;
  brand_name?: string;
  unit?: string;
  alert_quantity?: number;
  /** Price of the first size, kept for older screens. Each size has its own. */
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

// Step 3: Expenses Types
export interface ExpenseCategory {
  id: number;
  name: string;
  is_active: boolean;
}

export interface Expense {
  id: number;
  location_id: number;
  shop_name: string;
  shop_code: string;
  category_id: number;
  category_name: string;
  amount: number;
  payment_account_id: number;
  payment_account_name: string;
  entry_id?: string;
  ref_no?: string;
  notes?: string;
  created_by?: number;
  created_at: string;
}

export interface CreateExpenseDto {
  category_id: number;
  amount: number;
  payment_account_id: number;
  ref_no?: string;
  notes?: string;
}

// Step 3: POS & Sales Types
export interface SaleItem {
  id: number;
  sale_id: number;
  product_variation_id: number;
  product_name: string;
  size: string;
  sku: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  discount: number;
  total: number;
}

export interface Sale {
  id: number;
  invoice_number: string;
  location_id: number;
  shop_name: string;
  shop_code: string;
  client_ref?: string;
  customer_name?: string;
  customer_phone?: string;
  sale_type: 'counter' | 'courier';
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  paid_amount: number;
  payment_account_id?: number;
  payment_account_name?: string;
  entry_id?: string;
  created_by?: number;
  created_at: string;
  items?: SaleItem[];
}

export interface CreateSaleItemDto {
  product_variation_id: number;
  quantity: number;
  override_price?: number;
  discount?: number;
}

export interface CreateSaleDto {
  client_ref?: string;
  customer_name?: string;
  customer_phone?: string;
  sale_type?: 'counter' | 'courier';
  discount_amount?: number;
  payment_account_id: number;
  items: CreateSaleItemDto[];
}

export type ImportRowAction = 'new_product' | 'new_size' | 'update' | 'unchanged' | 'error';

export interface ImportRowResult {
  row: number;
  action: ImportRowAction;
  message: string;
  product_name: string;
  size: string;
  sku: string;
  category: string;
  selling_price: string;
  add_stock: number;
  shop: string;
}

export interface ImportTotals {
  total_rows: number;
  new_products: number;
  new_sizes: number;
  updated: number;
  unchanged: number;
  stock_added: number;
  errors: number;
}

export interface ImportPreview {
  rows: ImportRowResult[];
  totals: ImportTotals;
}

export interface ImportCommitResult {
  batch_no: string;
  totals: ImportTotals;
}

export interface ImportRequest {
  rows: Record<string, string>[];
  file_name?: string;
  /** The shop in the top bar, used when a row has no Shop. */
  active_shop_id?: number | null;
  /** Makes a retried commit return the first result. */
  client_ref?: string;
}

// ==========================================
// Step 4: Return & Exchange Types
// ==========================================

export type ReturnDirection = 'in' | 'out';
export type ReturnCondition = 'resaleable' | 'damaged' | 'unlisted' | 'exchange_out';
export type ReturnActionType = 'customer_paid' | 'refunded' | 'even' | 'store_credit';

export interface ReturnItem {
  id: number;
  return_id: number;
  direction: ReturnDirection;
  product_variation_id?: number | null;
  product_name?: string;
  size?: string;
  sku?: string;
  unlisted_title?: string;
  quantity: number;
  unit_cost: number;
  unit_price: number;
  condition: ReturnCondition;
  total: number;
}

export interface ReturnRecord {
  id: number;
  return_number: string;
  location_id: number;
  shop_name: string;
  shop_code: string;
  sale_id?: number | null;
  sale_invoice_number?: string | null;
  is_manual: boolean;
  customer_name?: string;
  customer_phone?: string;
  reason: string;
  notes?: string;
  inbound_subtotal: number;
  outbound_subtotal: number;
  net_amount: number;
  action_type: ReturnActionType;
  payment_account_id?: number | null;
  payment_account_name?: string | null;
  is_approved: boolean;
  approved_by?: number | null;
  entry_id?: string | null;
  created_by?: number;
  created_at: string;
  items?: ReturnItem[];
}

export interface CreateReturnItemDto {
  direction: ReturnDirection;
  product_variation_id?: number;
  unlisted_title?: string;
  quantity: number;
  unit_price?: number;
  condition: ReturnCondition;
}

export interface CreateReturnDto {
  sale_id?: number;
  is_manual?: boolean;
  customer_name?: string;
  customer_phone?: string;
  reason: string;
  notes?: string;
  payment_account_id?: number;
  action_type: ReturnActionType;
  items: CreateReturnItemDto[];
}

// ==========================================
// Step 5: Courier & Settlement Types
// ==========================================

export type CourierDeliveryStatus = 'booked' | 'in_transit' | 'delivered' | 'partly_delivered' | 'returned' | 'lost';
export type CourierPaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface CourierParcelItem {
  id: number;
  parcel_id: number;
  product_variation_id: number;
  product_name: string;
  size: string;
  sku: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  total: number;
  status: 'pending' | 'delivered' | 'returned';
}

export interface CourierParcel {
  id: number;
  parcel_code: string;
  location_id: number;
  shop_name: string;
  shop_code: string;
  sale_id?: number | null;
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  courier_name: string;
  tracking_number?: string;
  order_value: number;
  advance_amount: number;
  collectible_amount: number;
  delivery_charge: number;
  delivery_status: CourierDeliveryStatus;
  payment_status: CourierPaymentStatus;
  advance_account_id?: number | null;
  advance_account_name?: string | null;
  settlement_id?: number | null;
  booking_entry_id?: string | null;
  delivery_entry_id?: string | null;
  notes?: string;
  delivered_at?: string;
  settled_at?: string;
  created_by?: number;
  created_at: string;
  items?: CourierParcelItem[];
}

export interface BookCourierParcelDto {
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  courier_name: string;
  tracking_number?: string;
  advance_amount?: number;
  advance_account_id?: number;
  delivery_charge?: number;
  notes?: string;
  items: { product_variation_id: number; quantity: number }[];
}

export interface UpdateParcelDeliveryDto {
  delivery_status: CourierDeliveryStatus;
  delivered_items?: { item_id: number; status: 'delivered' | 'returned' }[];
  notes?: string;
}

export interface CourierSettlement {
  id: number;
  settlement_ref: string;
  location_id?: number | null;
  courier_name: string;
  parcel_count: number;
  total_receivable: number;
  amount_received: number;
  charges_deducted: number;
  discrepancy_amount: number;
  discrepancy_reason?: string;
  payment_account_id: number;
  payment_account_name?: string;
  entry_id?: string | null;
  created_by?: number;
  created_at: string;
  parcels?: CourierParcel[];
}

export interface CreateSettlementDto {
  courier_name: string;
  parcel_ids: number[];
  amount_received: number;
  charges_deducted: number;
  discrepancy_reason?: string;
  payment_account_id: number;
  notes?: string;
}

// Step 6: Go-Live & Daily Cash Drawer Reconciliation Types
export interface DailyCashClosing {
  id: number;
  location_id: number;
  location_name?: string;
  location_code?: string;
  user_id: number;
  user_name?: string;
  closing_date: string;
  opening_cash: number;
  cash_sales: number;
  cash_expenses: number;
  cash_returns: number;
  system_expected_cash: number;
  physical_counted_cash: number;
  discrepancy_amount: number;
  discrepancy_reason?: string;
  notes?: string;
  created_at: string;
}

export type TillMovementKind = 'pay_in' | 'pay_out' | 'owner_pull';

export interface TillMovement {
  id: number;
  session_id: number;
  kind: TillMovementKind;
  amount: number;
  category_id?: number | null;
  category_name?: string | null;
  note?: string | null;
  created_by?: number | null;
  user_name?: string | null;
  created_at: string;
}

/** Every figure is worked out by the server from the ledger. */
export interface TillSummary {
  current_cash: number;
  opening_float: number;
  cash_sales: number;
  digital_sales: number;
  pay_ins: number;
  petty_cash: number;
  refunds: number;
  other_cash: number;
}

export interface TillSession {
  id: number;
  location_id: number;
  status: 'open' | 'closed';
  opened_by?: number | null;
  opened_by_name?: string | null;
  opened_at: string;
  opening_float: number;
  open_adjustment: number;
  open_reason?: string | null;
  open_note?: string | null;
  closed_by?: number | null;
  closed_at?: string | null;
  expected_cash?: number | null;
  counted_cash?: number | null;
  difference?: number | null;
  difference_reason?: string | null;
  handover_amount?: number | null;
  retained_amount?: number | null;
  close_note?: string | null;
}

export interface TillStatus {
  shop_id: number;
  shop_name: string;
  shop_code: string;
  /** Ledger balance of the shop's cash account. */
  ledger_cash: number;
  session: TillSession | null;
  summary: TillSummary | null;
  movements: TillMovement[];
  /** True when the shop has never had a session, so the first open needs till.setup. */
  is_first_open: boolean;
}

export interface OpenTillDto {
  opening_float: number;
  note?: string;
  /** Required when the float differs from the cash the books expect, except on the first open. */
  reason?: string;
  client_ref: string;
}

export interface TillMovementDto {
  kind: TillMovementKind;
  amount: number;
  /** Required for pay_out. */
  category_id?: number;
  note?: string;
  client_ref: string;
}

export interface CloseTillDto {
  counted_cash: number;
  /** Required when the count differs from the ledger balance. */
  difference_reason?: string;
  /** Cash the owner takes out at close. The rest stays in the till. */
  handover_amount?: number;
  note?: string;
  client_ref: string;
}

export interface TillOverviewRow {
  shop_id: number;
  shop_name: string;
  shop_code: string;
  is_open: boolean;
  session_id: number | null;
  cash_in_hand: number;
  opening_float: number;
  cash_sales: number;
  petty_cash: number;
}

export interface TillOverview {
  shops: TillOverviewRow[];
  total_cash: number;
}
