import type { Contact } from '@ar-option/shared-types';

export interface CartLineItem {
  variation_id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  size: string;
  sku: string;
  unit_price: number;
  catalog_price: number;
  unit_cost: number;
  quantity: number;
  max_stock: number;
  discount: number; // in taka per line or unit
}

export interface SuspendedCart {
  id: string;
  shop_id: number;
  suspended_at: string;
  customer: Contact | { name: string; phone?: string } | null;
  items: CartLineItem[];
  order_discount: number;
  discount_type: 'taka' | 'percent';
  total: number;
}

export interface MultiPayRow {
  id: string;
  account_id: number;
  amount: number | '';
  reference?: string;
}
