import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Store,
  Printer,
  CheckCircle2,
  AlertCircle,
  X,
  CreditCard,
  Keyboard,
  ShoppingCart,
} from 'lucide-react';
import type {
  Shop,
  Account,
  CreateSaleDto,
  Sale,
  StockByShopGridItem,
  Contact,
  SalePaymentDto,
} from '@ar-option/shared-types';
import { apiFetch } from '../lib/api';
import { taka, newClientRef } from '../lib/money';
import { Sheet } from './Sheet';
import { PosHeader } from './pos/PosHeader';
import { CartTable } from './pos/CartTable';
import { ProductGrid } from './pos/ProductGrid';
import { SizePickerSheet } from './pos/SizePickerSheet';
import { CustomerModal } from './pos/CustomerModal';
import { MultiPayModal } from './pos/MultiPayModal';
import { SuspendedCartsModal } from './pos/SuspendedCartsModal';
import { ThermalReceiptModal } from './pos/ThermalReceiptModal';
import type { CartLineItem, SuspendedCart } from './pos/types';

export interface PosViewProps {
  activeShop: Shop | null;
  apiUrl: string;
  onExit: () => void;
  onSaleCompleted?: () => void;
  permissions?: string[];
  onOpenTill?: () => void;
}

export const PosView: React.FC<PosViewProps> = ({
  activeShop,
  apiUrl,
  onExit,
  onSaleCompleted,
  permissions = [],
  onOpenTill,
}) => {
  const canEditPrice = permissions.includes('pos.edit_price');

  // Screen size detection (Phone < 744px, Tablet >= 744px)
  const [isPhone, setIsPhone] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.innerWidth < 744;
  });

  useEffect(() => {
    const handleResize = () => {
      setIsPhone(window.innerWidth < 744);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Data state
  const [stockGrid, setStockGrid] = useState<StockByShopGridItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [tillSession, setTillSession] = useState<{ isOpen: boolean; cash: number } | null>(null);

  // Search & SKU state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [skuValue, setSkuValue] = useState<string>('');
  const skuInputRef = useRef<HTMLInputElement>(null);

  // Cart & Customer state
  const [customer, setCustomer] = useState<Contact | null>(null);
  const [cart, setCart] = useState<CartLineItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<number>(0);
  const [discountType, setDiscountType] = useState<'taka' | 'percent'>('taka');
  const [suspendedCarts, setSuspendedCarts] = useState<SuspendedCart[]>([]);

  // Checkout modal state
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState<boolean>(false);
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Other modals
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isMultiPayOpen, setIsMultiPayOpen] = useState(false);
  const [isSuspendedModalOpen, setIsSuspendedModalOpen] = useState(false);
  const [showHotkeysModal, setShowHotkeysModal] = useState(false);
  const [showRecentSales, setShowRecentSales] = useState(false);
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [selectedProductForSize, setSelectedProductForSize] = useState<{
    product_id: number;
    product_name: string;
    product_code: string;
    items: StockByShopGridItem[];
  } | null>(null);

  // Rule 6: idempotent client_ref
  const clientRefRef = useRef<string | null>(null);

  // Load cart from localStorage for activeShop
  useEffect(() => {
    if (!activeShop) return;
    try {
      const savedCart = localStorage.getItem(`ar_option_cart_${activeShop.id}`);
      if (savedCart) {
        const parsed = JSON.parse(savedCart);
        if (Array.isArray(parsed)) {
          setCart(parsed);
        }
      } else {
        setCart([]);
      }

      const savedSuspended = localStorage.getItem(`ar_option_suspended_${activeShop.id}`);
      if (savedSuspended) {
        const parsed = JSON.parse(savedSuspended);
        if (Array.isArray(parsed)) {
          setSuspendedCarts(parsed);
        }
      } else {
        setSuspendedCarts([]);
      }
    } catch {
      // ignore
    }
  }, [activeShop?.id]);

  // Persist cart to localStorage on change
  useEffect(() => {
    if (!activeShop) return;
    try {
      localStorage.setItem(`ar_option_cart_${activeShop.id}`, JSON.stringify(cart));
    } catch {
      // ignore
    }
    clientRefRef.current = null;
  }, [cart, activeShop?.id]);

  // Persist suspended carts to localStorage
  const saveSuspendedCarts = (newSuspended: SuspendedCart[]) => {
    if (!activeShop) return;
    setSuspendedCarts(newSuspended);
    try {
      localStorage.setItem(`ar_option_suspended_${activeShop.id}`, JSON.stringify(newSuspended));
    } catch {
      // ignore
    }
  };

  // Fetch stock data
  const fetchStockData = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`${apiUrl}/reports/stock-by-shop`);
      if (res.ok) {
        const data: StockByShopGridItem[] = await res.json();
        setStockGrid(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  // Fetch payment accounts
  const fetchAccounts = async (shopId: number) => {
    try {
      const res = await apiFetch(`${apiUrl}/ledger/payment-accounts?shop_id=${shopId}`);
      if (res.ok) {
        const data: Account[] = await res.json();
        setAccounts(data);
        const cashAcc = data.find((a) => a.payment_method === 'cash');
        setPaymentAccountId(cashAcc?.id ?? data[0]?.id ?? null);
      }
    } catch {
      // ignore
    }
  };

  // Fetch till status
  const fetchTillStatus = async (shopId: number) => {
    try {
      const res = await apiFetch(`${apiUrl}/till/status`, {
        headers: { 'X-Shop-Id': String(shopId) },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.session && data.session.status === 'open') {
          setTillSession({
            isOpen: true,
            cash: data.summary?.current_cash ?? data.ledger_cash ?? 0,
          });
        } else {
          setTillSession({
            isOpen: false,
            cash: data.ledger_cash ?? 0,
          });
        }
      }
    } catch {
      // ignore
    }
  };

  // Fetch recent sales
  const fetchRecentSales = async (shopId: number) => {
    try {
      const res = await apiFetch(`${apiUrl}/pos/sales?shop_id=${shopId}`);
      if (res.ok) {
        const data: Sale[] = await res.json();
        setRecentSales(data);
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchStockData();
    if (activeShop) {
      fetchAccounts(activeShop.id);
      fetchTillStatus(activeShop.id);
      fetchRecentSales(activeShop.id);
    }
  }, [activeShop, apiUrl]);

  // Autofocus SKU input on tablet and desktop (>= 744px)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 744) {
      skuInputRef.current?.focus();
    }
  }, []);

  // Keyboard hotkeys per DESIGN.md line 562
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsCustomerModalOpen(false);
        setIsMultiPayOpen(false);
        setIsSuspendedModalOpen(false);
        setIsCheckoutOpen(false);
        setIsMobileCartOpen(false);
        setSelectedProductForSize(null);
        setShowHotkeysModal(false);
        return;
      }
      if (e.key === 'F2') {
        e.preventDefault();
        skuInputRef.current?.focus();
      } else if (e.key === 'F4') {
        e.preventDefault();
        if (cart.length > 0) setIsMultiPayOpen(true);
      } else if (e.key === 'F8') {
        e.preventDefault();
        if (cart.length > 0) handleSuspendCart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart]);

  // Cart operations
  const addToCart = (item: StockByShopGridItem) => {
    if (!activeShop) return;
    const shopStock = item.stocks.find((s) => s.location_id === activeShop.id)?.qty || 0;
    if (shopStock <= 0) return;

    setCart((prev) => {
      const existing = prev.find((ci) => ci.variation_id === item.variation_id);
      if (existing) {
        if (existing.quantity >= shopStock) {
          alert(`Only ${shopStock} items available in ${activeShop.name}.`);
          return prev;
        }
        return prev.map((ci) =>
          ci.variation_id === item.variation_id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      } else {
        return [
          ...prev,
          {
            variation_id: item.variation_id,
            product_id: item.product_id,
            product_name: item.product_name,
            product_code: item.product_code,
            size: item.size,
            sku: item.sku,
            unit_price: item.selling_price,
            catalog_price: item.selling_price,
            unit_cost: item.cost_price,
            quantity: 1,
            max_stock: shopStock,
            discount: 0,
          },
        ];
      }
    });

    setSelectedProductForSize(null);
  };

  const updateQuantity = (variationId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.variation_id === variationId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (newQty > item.max_stock) {
              alert(`Cannot exceed ${item.max_stock} available stock.`);
              return item;
            }
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(Boolean) as CartLineItem[]
    );
  };

  const updatePrice = (variationId: number, price: number) => {
    if (!canEditPrice) return;
    setCart((prev) =>
      prev.map((item) => (item.variation_id === variationId ? { ...item, unit_price: price } : item))
    );
  };

  const updateLineDiscount = (variationId: number, discount: number) => {
    setCart((prev) =>
      prev.map((item) => (item.variation_id === variationId ? { ...item, discount } : item))
    );
  };

  const removeItem = (variationId: number) => {
    setCart((prev) => prev.filter((item) => item.variation_id !== variationId));
  };

  const clearCart = () => {
    if (cart.length > 0 && !confirm('Are you sure you want to clear the current order?')) {
      return;
    }
    setCart([]);
    setOrderDiscount(0);
    setCustomer(null);
    clientRefRef.current = null;
  };

  // SKU scanner / manual input submission
  const handleSkuSubmit = () => {
    const code = skuValue.trim();
    if (!code) return;

    // 1. Exact SKU match
    const exactSkuMatch = stockGrid.find((item) => item.sku.toLowerCase() === code.toLowerCase());
    if (exactSkuMatch) {
      addToCart(exactSkuMatch);
      setSkuValue('');
      return;
    }

    // 2. Exact product code match
    const codeMatches = stockGrid.filter(
      (item) => item.product_code.toLowerCase() === code.toLowerCase()
    );
    if (codeMatches.length === 1) {
      addToCart(codeMatches[0]);
      setSkuValue('');
      return;
    } else if (codeMatches.length > 1) {
      setSelectedProductForSize({
        product_id: codeMatches[0].product_id,
        product_name: codeMatches[0].product_name,
        product_code: codeMatches[0].product_code,
        items: codeMatches,
      });
      setSkuValue('');
      return;
    }

    // 3. Name match
    const nameMatches = stockGrid.filter((item) =>
      item.product_name.toLowerCase().includes(code.toLowerCase())
    );
    if (nameMatches.length === 1) {
      addToCart(nameMatches[0]);
      setSkuValue('');
      return;
    } else if (nameMatches.length > 1) {
      setSelectedProductForSize({
        product_id: nameMatches[0].product_id,
        product_name: nameMatches[0].product_name,
        product_code: nameMatches[0].product_code,
        items: nameMatches,
      });
      setSkuValue('');
      return;
    }

    alert(`No matching product or variation found for "${code}".`);
  };

  // Cart calculations
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

  // Suspend Cart
  const handleSuspendCart = () => {
    if (cart.length === 0 || !activeShop) return;

    const newSuspendedCart: SuspendedCart = {
      id: `cart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      shop_id: activeShop.id,
      suspended_at: new Date().toISOString(),
      customer,
      items: [...cart],
      order_discount: orderDiscount,
      discount_type: discountType,
      total: grandTotal,
    };

    saveSuspendedCarts([newSuspendedCart, ...suspendedCarts]);
    setCart([]);
    setCustomer(null);
    setOrderDiscount(0);
    clientRefRef.current = null;
  };

  const handleResumeCart = (suspended: SuspendedCart) => {
    if (cart.length > 0 && !confirm('Replace current cart with suspended cart?')) {
      return;
    }
    setCart(suspended.items);
    setCustomer(suspended.customer as Contact | null);
    setOrderDiscount(suspended.order_discount);
    setDiscountType(suspended.discount_type);
    saveSuspendedCarts(suspendedCarts.filter((c) => c.id !== suspended.id));
    setIsSuspendedModalOpen(false);
  };

  const handleDiscardSuspended = (id: string) => {
    if (!confirm('Discard this parked cart?')) return;
    saveSuspendedCarts(suspendedCarts.filter((c) => c.id !== id));
  };

  // Checkout submission handler
  const executeSale = async (paymentsList?: SalePaymentDto[]) => {
    if (!activeShop) {
      setErrorMsg('No active shop selected. Please choose a shop first.');
      return;
    }
    if (cart.length === 0) {
      setErrorMsg('Cart is empty.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      clientRefRef.current ??= newClientRef('pos');

      const payload: CreateSaleDto = {
        client_ref: clientRefRef.current,
        customer_name: customer?.name || 'Walk-in Customer',
        customer_phone: customer?.phone || undefined,
        customer_id: customer?.id,
        discount_amount: discountAmount,
        items: cart.map((ci) => ({
          product_variation_id: ci.variation_id,
          quantity: ci.quantity,
          discount: ci.discount || 0,
        })),
      };

      if (paymentsList && paymentsList.length > 0) {
        payload.payments = paymentsList;
      } else {
        if (!paymentAccountId) {
          throw new Error('This shop has no payment account. Ask an admin to set one up.');
        }
        payload.payment_account_id = paymentAccountId;
      }

      const res = await apiFetch(`${apiUrl}/pos/sales`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Id': String(activeShop.id),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Checkout failed with status ${res.status}`);
      }

      const sale: Sale = await res.json();
      setCompletedSale(sale);
      setIsCheckoutOpen(false);
      setIsMobileCartOpen(false);
      setIsMultiPayOpen(false);
      setCart([]);
      setOrderDiscount(0);
      setCustomer(null);
      clientRefRef.current = null;

      // Refresh stock data, recent sales and till status
      fetchStockData();
      fetchRecentSales(activeShop.id);
      fetchTillStatus(activeShop.id);
      if (onSaleCompleted) onSaleCompleted();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to complete sale');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick pay handler from cart buttons
  const handleQuickPay = (
    _method: 'cash' | 'card' | 'bkash',
    accountId: number,
    details?: { reference?: string }
  ) => {
    setPaymentAccountId(accountId);
    if (grandTotal === 0) {
      executeSale([]);
      return;
    }
    const singlePayment: SalePaymentDto = {
      payment_account_id: accountId,
      amount: grandTotal,
      reference_note: details?.reference,
    };
    executeSale([singlePayment]);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-full overflow-hidden bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text">
      {/* POS Top Header & Action Strip */}
      <PosHeader
        activeShop={activeShop}
        onExit={onExit}
        customer={customer}
        onSelectCustomer={setCustomer}
        onOpenAddCustomer={() => setIsCustomerModalOpen(true)}
        skuInputRef={skuInputRef}
        skuValue={skuValue}
        onSkuChange={setSkuValue}
        onSkuSubmit={handleSkuSubmit}
        tillSession={tillSession}
        onOpenTill={() => {
          if (onOpenTill) {
            onOpenTill();
          } else {
            alert('Open Till drawer from the Till / Cash Closing screen.');
          }
        }}
        suspendedCount={suspendedCarts.length}
        onOpenSuspended={() => setIsSuspendedModalOpen(true)}
        onOpenHotkeys={() => setShowHotkeysModal(true)}
        apiUrl={apiUrl}
      />

      {/* Main Content Area */}
      {!activeShop ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Store className="w-8 h-8 stroke-1 mb-2 opacity-50" />
          <p className="text-sm font-semibold">Choose a shop to start selling</p>
          <p className="text-xs mt-1 text-light-text-muted dark:text-dark-text-muted">
            Use the shop button in the top bar. A sale always belongs to one shop.
          </p>
        </div>
      ) : showRecentSales ? (
        /* Recent Sales & Receipts List */
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-bold">
              Recent Receipts ({activeShop?.name || 'All'})
            </h2>
            <button
              type="button"
              onClick={() => setShowRecentSales(false)}
              className="text-xs text-primary font-bold hover:underline"
            >
              Back to Catalog
            </button>
          </div>

          {recentSales.length === 0 ? (
            <div className="text-center py-12 text-light-text-muted">
              No sales completed yet for this shop.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {recentSales.map((sale) => (
                <div
                  key={sale.id}
                  className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-primary dark:text-primary-tint">
                      {sale.invoice_number}
                    </span>
                    <span className="text-[11px] text-light-text-muted">
                      {new Date(sale.created_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                  <div className="text-xs text-light-text-muted">
                    Customer: {sale.customer_name}{' '}
                    {sale.customer_phone ? `(${sale.customer_phone})` : ''}
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-light-border dark:border-dark-border">
                    <span className="font-semibold">{sale.items?.length || 0} items</span>
                    <span className="font-mono font-extrabold text-sm">
                      {taka(sale.total_amount)}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setCompletedSale(sale)}
                    className="w-full mt-2 py-2 flex items-center justify-center space-x-1.5 text-xs font-semibold rounded-lg bg-light-surface-hover dark:bg-dark-surface-hover hover:bg-primary hover:text-on-primary transition-colors border border-light-border dark:border-dark-border"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print 80mm Receipt</span>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Standard Layout: Cart (Desktop/Tablet) + Product Grid */
        <div className="flex-1 flex overflow-hidden">
          {/* Desktop/Tablet Left Cart Panel — widened to give ample room for totals and payment options */}
          {!isPhone && (
            <div className="w-[360px] md:w-[380px] lg:w-[400px] xl:w-[440px] shrink-0 h-full">
              <CartTable
                cart={cart}
                onUpdateQuantity={updateQuantity}
                onUpdatePrice={updatePrice}
                onUpdateLineDiscount={updateLineDiscount}
                onRemoveItem={removeItem}
                onClearCart={clearCart}
                orderDiscount={orderDiscount}
                discountType={discountType}
                onChangeDiscount={(amount, type) => {
                  setOrderDiscount(amount);
                  setDiscountType(type);
                }}
                usableAccounts={accounts}
                canEditPrice={canEditPrice}
                onSuspend={handleSuspendCart}
                onCancel={clearCart}
                onQuickPay={handleQuickPay}
                onOpenMultiPay={() => setIsMultiPayOpen(true)}
                onProceedToCheckout={() => setIsCheckoutOpen(true)}
                submitting={submitting}
              />
            </div>
          )}

          {/* Right Product Grid */}
          <main className="flex-1 flex flex-col h-full overflow-hidden">
            <ProductGrid
              stockGrid={stockGrid}
              activeShop={activeShop}
              onAddToCart={addToCart}
              onOpenSizePicker={setSelectedProductForSize}
              loading={loading}
              searchQuery={searchQuery}
              setSearchQuery={setSearchQuery}
              isPhone={isPhone}
            />

            {/* Mobile Phone Sticky Bottom Checkout Bar per DESIGN.md line 532 */}
            {isPhone && (
              <div className="p-3 bg-light-surface dark:bg-dark-surface border-t border-light-border dark:border-dark-border flex items-center justify-between gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsMobileCartOpen(true)}
                  className="flex items-center gap-2 text-left"
                >
                  <div className="relative">
                    <ShoppingCart className="w-6 h-6 text-primary dark:text-primary-tint" />
                    {cart.length > 0 && (
                      <span className="absolute -top-1.5 -right-2 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-primary text-on-primary">
                        {cart.reduce((s, i) => s + i.quantity, 0)}
                      </span>
                    )}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase text-light-text-muted">Total</div>
                    <div className="font-mono text-base font-extrabold text-primary dark:text-primary-tint">
                      {taka(grandTotal)}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  disabled={cart.length === 0}
                  onClick={() => setIsMobileCartOpen(true)}
                  className="h-11 px-5 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-bold text-xs flex items-center gap-1.5 shadow-md disabled:opacity-40"
                >
                  <CreditCard className="w-4 h-4" />
                  <span>View Cart & Checkout</span>
                </button>
              </div>
            )}
          </main>
        </div>
      )}

      {/* Phone Mobile Cart Sheet */}
      {isPhone && isMobileCartOpen && (
        <Sheet
          title="Current Order & Checkout"
          onClose={() => setIsMobileCartOpen(false)}
          testId="mobile-cart-sheet"
        >
          <div className="h-[75vh]">
            <CartTable
              cart={cart}
              onUpdateQuantity={updateQuantity}
              onUpdatePrice={updatePrice}
              onUpdateLineDiscount={updateLineDiscount}
              onRemoveItem={removeItem}
              onClearCart={clearCart}
              orderDiscount={orderDiscount}
              discountType={discountType}
              onChangeDiscount={(amount, type) => {
                setOrderDiscount(amount);
                setDiscountType(type);
              }}
              usableAccounts={accounts}
              canEditPrice={canEditPrice}
              onSuspend={() => {
                handleSuspendCart();
                setIsMobileCartOpen(false);
              }}
              onCancel={() => {
                clearCart();
                setIsMobileCartOpen(false);
              }}
              onQuickPay={(method, accountId, details) => {
                handleQuickPay(method, accountId, details);
              }}
              onOpenMultiPay={() => {
                setIsMobileCartOpen(false);
                setIsMultiPayOpen(true);
              }}
              onProceedToCheckout={() => {
                setIsMobileCartOpen(false);
                setIsCheckoutOpen(true);
              }}
              submitting={submitting}
            />
          </div>
        </Sheet>
      )}

      {/* Size Picker Sheet for Phone & ambiguous SKU codes */}
      {selectedProductForSize && (
        <SizePickerSheet
          product={selectedProductForSize}
          activeShopId={activeShop?.id ?? null}
          onSelectVariation={(item) => addToCart(item)}
          onClose={() => setSelectedProductForSize(null)}
        />
      )}

      {/* Add Customer Modal */}
      {isCustomerModalOpen && (
        <CustomerModal
          apiUrl={apiUrl}
          onClose={() => setIsCustomerModalOpen(false)}
          onCreated={(c) => {
            setCustomer(c);
            setIsCustomerModalOpen(false);
          }}
        />
      )}

      {/* MultiPay Modal */}
      {isMultiPayOpen && (
        <MultiPayModal
          payableTotal={grandTotal}
          usableAccounts={accounts}
          onClose={() => setIsMultiPayOpen(false)}
          onSubmit={(paymentsList) => executeSale(paymentsList)}
          submitting={submitting}
        />
      )}

      {/* Suspended Carts Modal */}
      {isSuspendedModalOpen && (
        <SuspendedCartsModal
          carts={suspendedCarts}
          onClose={() => setIsSuspendedModalOpen(false)}
          onResume={handleResumeCart}
          onDiscard={handleDiscardSuspended}
        />
      )}

      {/* Structured Checkout Modal (Matching checkout.spec.ts: Proceed to Checkout -> Complete Sale) */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border p-6 rounded-2xl shadow-2xl space-y-4 max-h-[95dvh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-light-border dark:border-dark-border">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-primary dark:text-primary-tint" />
                <h3 className="font-extrabold text-base">Complete Checkout</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-light-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Customer Details */}
            <div className="p-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border space-y-1">
              <div className="text-[11px] font-bold text-light-text-muted uppercase">Customer</div>
              <div className="font-bold text-sm">{customer?.name || 'Walk-in Customer'}</div>
              {customer?.phone && (
                <div className="text-xs text-light-text-muted font-mono">{customer.phone}</div>
              )}
            </div>

            {/* Payment Account Selection */}
            <div>
              <label className="block text-xs font-bold text-light-text-muted mb-1.5">
                Deposit Into Account
              </label>
              <select
                value={paymentAccountId ?? ''}
                onChange={(e) => setPaymentAccountId(Number(e.target.value))}
                className="w-full h-11 px-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-xs font-semibold"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.code}) — {acc.payment_method?.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Order Summary */}
            <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-light-text-muted">Total Items:</span>
                <span className="font-semibold">{cart.reduce((s, i) => s + i.quantity, 0)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-light-text-muted">Subtotal:</span>
                <span className="font-mono">{taka(cartSubtotal)}</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Discount:</span>
                  <span className="font-mono">-{taka(discountAmount)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold pt-2 border-t border-primary/20">
                <span>Grand Total:</span>
                <span className="font-mono text-primary dark:text-primary-tint">
                  {taka(grandTotal)}
                </span>
              </div>
            </div>

            {/* Complete Sale Button (matches /Complete Sale/) */}
            <button
              type="button"
              disabled={submitting || cart.length === 0}
              onClick={() => executeSale()}
              className="w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <span>Posting to Ledger...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Complete Sale {taka(grandTotal)}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Hotkeys Modal */}
      {showHotkeysModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-sm bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border p-5 rounded-2xl shadow-xl space-y-3 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-light-border dark:border-dark-border">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Keyboard className="w-4 h-4 text-primary" />
                <span>Keyboard Shortcuts</span>
              </div>
              <button
                type="button"
                onClick={() => setShowHotkeysModal(false)}
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-light-surface-hover"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 py-2">
              <div className="flex justify-between items-center">
                <span className="text-light-text-muted">Focus SKU / Scanner:</span>
                <kbd className="px-2 py-0.5 rounded bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-bold">
                  F2
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-light-text-muted">Open MultiPay Modal:</span>
                <kbd className="px-2 py-0.5 rounded bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-bold">
                  F4
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-light-text-muted">Suspend / Park Cart:</span>
                <kbd className="px-2 py-0.5 rounded bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-bold">
                  F8
                </kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-light-text-muted">Close Top Modal / Sheet:</span>
                <kbd className="px-2 py-0.5 rounded bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-bold">
                  Esc
                </kbd>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 80mm Thermal Receipt Modal */}
      {completedSale && (
        <ThermalReceiptModal
          sale={completedSale}
          onClose={() => setCompletedSale(null)}
        />
      )}
    </div>
  );
};
