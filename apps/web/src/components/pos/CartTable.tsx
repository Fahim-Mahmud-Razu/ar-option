import React, { useState, useMemo } from 'react';
import {
  ShoppingCart,
  Trash2,
  Minus,
  Plus,
  Banknote,
  CreditCard,
  Smartphone,
  Layers,
  Pause,
  X,
  AlertCircle,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react';
import type { Account } from '@ar-option/shared-types';
import type { CartLineItem } from './types';
import { taka } from '../../lib/money';

interface CartTableProps {
  cart: CartLineItem[];
  onUpdateQuantity: (variationId: number, delta: number) => void;
  onUpdatePrice: (variationId: number, price: number) => void;
  onUpdateLineDiscount: (variationId: number, discount: number) => void;
  onRemoveItem: (variationId: number) => void;
  onClearCart: () => void;
  orderDiscount: number;
  discountType: 'taka' | 'percent';
  onChangeDiscount: (amount: number, type: 'taka' | 'percent') => void;
  usableAccounts: Account[];
  canEditPrice: boolean;
  onSuspend: () => void;
  onCancel: () => void;
  onQuickPay: (method: 'cash' | 'card' | 'bkash', accountId: number, details?: { reference?: string }) => void;
  onOpenMultiPay: () => void;
  onProceedToCheckout: () => void;
  submitting: boolean;
}

export const CartTable: React.FC<CartTableProps> = ({
  cart,
  onUpdateQuantity,
  onUpdatePrice,
  onUpdateLineDiscount,
  onRemoveItem,
  onClearCart,
  orderDiscount,
  discountType,
  onChangeDiscount,
  usableAccounts,
  canEditPrice,
  onSuspend,
  onCancel,
  onQuickPay,
  onOpenMultiPay,
  onProceedToCheckout,
  submitting,
}) => {
  const [bKashModalOpen, setBKashModalOpen] = useState(false);
  const [bKashTrxId, setBKashTrxId] = useState('');
  const [bKashSender, setBKashSender] = useState('');
  const [bKashError, setBKashError] = useState<string | null>(null);

  // Cart calculations
  const totalItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => {
      const lineDisc = item.discount || 0;
      return sum + Math.max(0, item.unit_price * item.quantity - lineDisc);
    }, 0);
  }, [cart]);

  const discountAmount = useMemo(() => {
    if (discountType === 'percent') {
      return Math.round(((cartSubtotal * orderDiscount) / 100) * 100) / 100;
    }
    return Math.min(orderDiscount, cartSubtotal);
  }, [cartSubtotal, orderDiscount, discountType]);

  const grandTotal = useMemo(() => {
    return Math.max(0, cartSubtotal - discountAmount);
  }, [cartSubtotal, discountAmount]);

  // Account lookups for payment methods
  const cashAccount = usableAccounts.find((a) => a.payment_method === 'cash') || null;
  const cardAccount = usableAccounts.find((a) => a.payment_method === 'card' || a.payment_method === 'bank') || null;
  const bKashAccount = usableAccounts.find((a) => a.payment_method === 'bkash' || a.name.toLowerCase().includes('bkash')) || null;

  const handleBKashSubmit = () => {
    if (bKashSender.trim()) {
      const cleanPhone = bKashSender.trim();
      const isValid = /^01[3-9]\d{8}$/.test(cleanPhone);
      if (!isValid) {
        setBKashError('Sender phone must be a valid 11-digit Bangladeshi mobile (e.g. 017xxxxxxxx).');
        return;
      }
    }
    if (!bKashAccount) {
      setBKashError('No bKash or mobile money account configured for this shop.');
      return;
    }

    setBKashError(null);
    setBKashModalOpen(false);
    const ref = [bKashTrxId.trim(), bKashSender.trim() ? `from ${bKashSender.trim()}` : ''].filter(Boolean).join(' ');
    onQuickPay('bkash', bKashAccount.id, { reference: ref || undefined });
  };

  return (
    <aside className="flex flex-col h-full bg-light-surface dark:bg-dark-surface border-r border-light-border dark:border-dark-border select-none">
      {/* Header: Order info & Clear */}
      <div className="p-3 border-b border-light-border dark:border-dark-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-primary dark:text-primary-tint" />
          <span className="font-extrabold text-sm">
            Current Order ({totalItemCount} {totalItemCount === 1 ? 'item' : 'items'})
          </span>
        </div>
        {cart.length > 0 && (
          <button
            type="button"
            onClick={onClearCart}
            className="text-xs text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-1 font-semibold"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Cart Lines List */}
      <div className="flex-1 min-h-[160px] overflow-y-auto p-3 space-y-2">
        {cart.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-light-text-muted dark:text-dark-text-muted">
            <ShoppingCart className="w-8 h-8 stroke-1 mb-2 opacity-50" />
            <p className="text-xs font-semibold">Cart is empty</p>
            <p className="text-[11px] mt-1">Tap a size card on the right or scan a SKU</p>
          </div>
        ) : (
          cart.map((item) => {
            const lineTotal = Math.max(0, item.unit_price * item.quantity - (item.discount || 0));

            return (
              <div
                key={item.variation_id}
                className="p-2.5 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border space-y-2 shadow-2xs"
              >
                {/* Title & Size Badge & Remove */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold leading-tight truncate">
                      {item.product_name}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 text-[11px] text-light-text-muted font-mono">
                      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary dark:text-primary-tint font-bold">
                        Size: {item.size}
                      </span>
                      <span className="truncate">{item.sku}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.variation_id)}
                    className="text-light-text-muted hover:text-rose-600 p-1 rounded-md transition-colors"
                    aria-label="Remove item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Line Inputs: Qty Stepper, Editable Price, Editable Disc, Line Total */}
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-light-border/60 dark:border-dark-border/60">
                  {/* Quantity Stepper */}
                  <div className="flex items-center border border-light-border dark:border-dark-border rounded-lg bg-light-surface dark:bg-dark-surface">
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.variation_id, -1)}
                      className="w-7 h-7 flex items-center justify-center hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover rounded-l-lg"
                      aria-label="Decrease quantity"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="w-8 text-center text-xs font-bold font-mono">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateQuantity(item.variation_id, 1)}
                      disabled={item.quantity >= item.max_stock}
                      className="w-7 h-7 flex items-center justify-center hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover rounded-r-lg disabled:opacity-40"
                      aria-label="Increase quantity"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Price input (editable if pos.edit_price) */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-light-text-muted">Price:</span>
                    {canEditPrice ? (
                      <input
                        type="number"
                        min="0"
                        value={item.unit_price}
                        onChange={(e) =>
                          onUpdatePrice(item.variation_id, Math.max(0, parseFloat(e.target.value) || 0))
                        }
                        className="w-18 h-7 px-1.5 text-right text-xs font-mono font-bold rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border focus:ring-1 focus:ring-focus-ring"
                      />
                    ) : (
                      <span className="font-mono text-xs font-bold">{taka(item.unit_price)}</span>
                    )}
                  </div>

                  {/* Line Disc input */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-light-text-muted">Disc:</span>
                    <input
                      type="number"
                      min="0"
                      value={item.discount || ''}
                      placeholder="0"
                      onChange={(e) =>
                        onUpdateLineDiscount(
                          item.variation_id,
                          Math.max(0, parseFloat(e.target.value) || 0)
                        )
                      }
                      className="w-14 h-7 px-1 text-right text-xs font-mono rounded-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border focus:ring-1 focus:ring-focus-ring"
                    />
                  </div>

                  {/* Line Total */}
                  <div className="text-right">
                    <div className="font-mono text-xs font-extrabold text-primary dark:text-primary-tint">
                      {taka(lineTotal)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Cart Footer: Discount, Combined Summary & Compact Action Grid */}
      <div className="p-3 bg-light-surface-hover dark:bg-dark-surface-hover border-t border-light-border dark:border-dark-border space-y-2 shrink-0">
        {/* Cart-level Discount Selector */}
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-light-border dark:border-dark-border overflow-hidden bg-light-surface dark:bg-dark-surface shrink-0 h-8">
            <button
              type="button"
              onClick={() => onChangeDiscount(orderDiscount, 'taka')}
              className={`px-2.5 text-xs font-bold transition-colors ${
                discountType === 'taka'
                  ? 'bg-primary text-on-primary'
                  : 'text-light-text dark:text-dark-text hover:bg-light-surface-hover'
              }`}
            >
              ৳ Taka
            </button>
            <button
              type="button"
              onClick={() => onChangeDiscount(orderDiscount, 'percent')}
              className={`px-2.5 text-xs font-bold transition-colors ${
                discountType === 'percent'
                  ? 'bg-primary text-on-primary'
                  : 'text-light-text dark:text-dark-text hover:bg-light-surface-hover'
              }`}
            >
              % Off
            </button>
          </div>

          <div className="relative flex-1">
            <input
              type="number"
              min="0"
              value={orderDiscount || ''}
              onChange={(e) =>
                onChangeDiscount(Math.max(0, parseFloat(e.target.value) || 0), discountType)
              }
              placeholder={discountType === 'percent' ? 'Discount % (F9)' : 'Discount ৳ (F9)'}
              aria-label="Order Discount"
              className="w-full h-8 px-2.5 rounded-lg text-xs bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border font-mono text-right"
            />
          </div>
        </div>

        {/* Grand Payable Total & Subtotal Integrated Display */}
        <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/25 space-y-1">
          <div className="flex items-center justify-between text-xs text-light-text-muted dark:text-dark-text-muted">
            <span>Items ({totalItemCount}) Subtotal:</span>
            <span className="font-mono font-bold text-light-text dark:text-dark-text">
              {taka(cartSubtotal)}
            </span>
          </div>
          {discountAmount > 0 && (
            <div className="flex items-center justify-between text-xs text-rose-600 dark:text-rose-400 font-semibold">
              <span>Order Disc ({discountType === 'percent' ? `${orderDiscount}%` : 'Flat'}):</span>
              <span className="font-mono">-{taka(discountAmount)}</span>
            </div>
          )}
          <div className="flex items-center justify-between pt-1 border-t border-primary/20">
            <div>
              <div className="text-[10px] font-extrabold uppercase tracking-wide text-light-text-muted dark:text-dark-text-muted">
                Grand Payable Total
              </div>
              <div className="text-[10px] text-light-text-muted">Paid in Full</div>
            </div>
            <div className="font-mono text-xl sm:text-2xl font-black text-primary dark:text-primary-tint">
              {taka(grandTotal)}
            </div>
          </div>
        </div>

        {/* Action Grid: Suspend, Cancel, Cash, Card, bKash, MultiPay, Courier */}
        <div className="space-y-1.5">
          {/* CASH: Primary Payment Button (At least 48px per DESIGN.md line 557) */}
          <button
            type="button"
            disabled={cart.length === 0 || submitting || !cashAccount}
            onClick={() => {
              if (cashAccount) onQuickPay('cash', cashAccount.id);
            }}
            title={cashAccount ? 'Pay with Cash' : 'No Cash account configured for this shop'}
            className="w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-30 disabled:pointer-events-none"
          >
            <Banknote className="w-5 h-5" />
            <span>Cash {taka(grandTotal)}</span>
          </button>

          {/* Secondary Payment Methods Grid: Card, bKash, MultiPay */}
          <div className="grid grid-cols-3 gap-1.5">
            {/* CARD */}
            <button
              type="button"
              disabled={cart.length === 0 || submitting || !cardAccount}
              onClick={() => {
                if (cardAccount) onQuickPay('card', cardAccount.id);
              }}
              title={cardAccount ? 'Pay with Card / Bank' : 'No Card account configured for this shop'}
              className="h-11 rounded-xl border border-blue-500/40 hover:border-blue-500 bg-blue-500/10 hover:bg-blue-500/20 text-blue-600 dark:text-blue-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-[0.99] disabled:opacity-30 disabled:border-light-border dark:disabled:border-dark-border disabled:bg-light-surface dark:disabled:bg-dark-surface disabled:text-light-text-muted dark:disabled:text-dark-text-muted disabled:pointer-events-none"
            >
              <CreditCard className="w-3.5 h-3.5 text-blue-500" />
              <span>Card</span>
            </button>

            {/* bKash */}
            <button
              type="button"
              disabled={cart.length === 0 || submitting || !bKashAccount}
              onClick={() => setBKashModalOpen(true)}
              title={bKashAccount ? 'Pay with bKash / Mobile Money' : 'No Mobile Money account configured'}
              className="h-11 rounded-xl border border-[#e2136e]/40 hover:border-[#e2136e] bg-[#e2136e]/10 hover:bg-[#e2136e]/20 text-[#e2136e] font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-[0.99] disabled:opacity-30 disabled:border-light-border dark:disabled:border-dark-border disabled:bg-light-surface dark:disabled:bg-dark-surface disabled:text-light-text-muted dark:disabled:text-dark-text-muted disabled:pointer-events-none"
            >
              <Smartphone className="w-3.5 h-3.5 text-[#e2136e]" />
              <span>bKash</span>
            </button>

            {/* MultiPay (F4) */}
            <button
              type="button"
              disabled={cart.length === 0 || submitting}
              onClick={onOpenMultiPay}
              title="Split payment across multiple accounts (F4)"
              className="h-11 rounded-xl border-2 border-dashed border-purple-500/50 hover:border-purple-500 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-300 text-xs font-black flex items-center justify-center gap-1.5 transition-all shadow-xs active:scale-[0.99] disabled:opacity-30 disabled:border-light-border dark:disabled:border-dark-border disabled:bg-light-surface dark:disabled:bg-dark-surface disabled:text-light-text-muted dark:disabled:text-dark-text-muted disabled:pointer-events-none"
            >
              <Layers className="w-3.5 h-3.5 text-purple-500" />
              <span>MultiPay</span>
            </button>
          </div>

          {/* Aux Actions: Park, Cancel, Courier / Checkout */}
          <div className="grid grid-cols-3 gap-1.5 pt-0.5">
            <button
              type="button"
              disabled={cart.length === 0}
              onClick={onSuspend}
              title="Park cart on this device (F8)"
              className="h-9 px-2 rounded-xl border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover text-xs font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-40"
            >
              <Pause className="w-3 h-3 text-amber-600" />
              <span>Park (F8)</span>
            </button>

            <button
              type="button"
              disabled={cart.length === 0}
              onClick={onCancel}
              title="Cancel and clear order"
              className="h-9 px-2 rounded-xl border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface hover:bg-rose-500/10 text-rose-600 text-xs font-semibold flex items-center justify-center gap-1 transition-colors disabled:opacity-40"
            >
              <Trash2 className="w-3 h-3" />
              <span>Cancel</span>
            </button>

            <button
              type="button"
              disabled={cart.length === 0 || submitting}
              onClick={onProceedToCheckout}
              data-testid="proceed-to-checkout"
              title="Open Delivery / Courier Checkout"
              className="h-9 px-2 rounded-xl border border-primary/50 hover:border-primary bg-primary/10 hover:bg-primary/20 text-primary dark:text-primary-tint font-bold text-xs flex items-center justify-center gap-1 transition-all shadow-2xs hover:shadow-xs active:scale-[0.99] disabled:opacity-30 disabled:pointer-events-none group"
            >
              <span>Courier</span>
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* bKash Prompt Modal */}
      {bKashModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border p-5 rounded-2xl shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Smartphone className="w-4 h-4 text-pink-600" />
                <span>bKash Payment — {taka(grandTotal)}</span>
              </div>
              <button
                type="button"
                onClick={() => setBKashModalOpen(false)}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-light-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {bKashError && (
              <div className="p-2.5 rounded-xl bg-rose-500/10 text-rose-600 text-xs flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{bKashError}</span>
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-light-text-muted mb-1">
                  Transaction ID (TrxID)
                </label>
                <input
                  type="text"
                  value={bKashTrxId}
                  onChange={(e) => setBKashTrxId(e.target.value.toUpperCase())}
                  placeholder="e.g. BL92A4K91P"
                  className="w-full h-10 px-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono text-xs uppercase"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-light-text-muted mb-1">
                  Sender Mobile (Optional, 11 digits)
                </label>
                <input
                  type="tel"
                  value={bKashSender}
                  onChange={(e) => setBKashSender(e.target.value)}
                  placeholder="017XXXXXXXX"
                  maxLength={11}
                  className="w-full h-10 px-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBKashModalOpen(false)}
                className="flex-1 h-10 rounded-xl border border-light-border dark:border-dark-border text-xs font-semibold hover:bg-light-surface-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBKashSubmit}
                className="flex-1 h-10 rounded-xl bg-primary hover:bg-primary-hover text-on-primary text-xs font-bold flex items-center justify-center gap-1"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm Payment</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
