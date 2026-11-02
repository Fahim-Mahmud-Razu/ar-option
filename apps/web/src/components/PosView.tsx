import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  AlertCircle,
  Printer,
  X,
  CreditCard,
  User,
  Phone,
  RotateCcw,
  ArrowLeft,
  Receipt,
  Store,
} from 'lucide-react';
import type { Shop, Account, CreateSaleDto, Sale, StockByShopGridItem } from '@ar-option/shared-types';
import { apiFetch } from '../lib/api';

interface PosViewProps {
  activeShop: Shop | null;
  apiUrl: string;
  onExit: () => void;
  onSaleCompleted?: () => void;
}

interface CartItem {
  variation_id: number;
  product_id: number;
  product_name: string;
  product_code: string;
  size: string;
  sku: string;
  unit_price: number;
  unit_cost: number;
  quantity: number;
  max_stock: number;
  discount: number;
}

export const PosView: React.FC<PosViewProps> = ({
  activeShop,
  apiUrl,
  onExit,
  onSaleCompleted,
}) => {
  const [stockGrid, setStockGrid] = useState<StockByShopGridItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderDiscount, setOrderDiscount] = useState<number>(0);
  const [selectedProductForSize, setSelectedProductForSize] = useState<{
    product_id: number;
    product_name: string;
    product_code: string;
    selling_price: number;
    cost_price: number;
    items: StockByShopGridItem[];
  } | null>(null);

  // Checkout modal state
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState<boolean>(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [customerName, setCustomerName] = useState<string>('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Thermal Receipt state
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [recentSales, setRecentSales] = useState<Sale[]>([]);
  const [showRecentSales, setShowRecentSales] = useState<boolean>(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  // Rule 6: one reference per sale attempt, so a retry after a lost reply cannot sell twice.
  const clientRefRef = useRef<string | null>(null);

  // Fetch stock and accounts
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
      fetchRecentSales(activeShop.id);
    }
  }, [activeShop, apiUrl]);

  // Autofocus search on desktop and tablet (>= 744px), but NOT on phones (DESIGN.md line 534-535)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 744) {
      searchInputRef.current?.focus();
    }
  }, []);

  // Group stock items by product
  const productsGrouped = useMemo(() => {
    const map = new Map<
      number,
      {
        product_id: number;
        product_name: string;
        product_code: string;
        selling_price: number;
        cost_price: number;
        items: StockByShopGridItem[];
      }
    >();

    for (const item of stockGrid) {
      if (!map.has(item.product_id)) {
        map.set(item.product_id, {
          product_id: item.product_id,
          product_name: item.product_name,
          product_code: item.product_code,
          selling_price: item.selling_price,
          cost_price: item.cost_price,
          items: [],
        });
      }
      map.get(item.product_id)!.items.push(item);
    }

    return Array.from(map.values());
  }, [stockGrid]);

  // Filter products by search query
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return productsGrouped;
    return productsGrouped.filter(
      (p) =>
        p.product_name.toLowerCase().includes(q) ||
        p.product_code.toLowerCase().includes(q) ||
        p.items.some((v) => v.size.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q))
    );
  }, [productsGrouped, searchQuery]);

  // Cart calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.unit_price * item.quantity - (item.discount || 0), 0);
  }, [cart]);

  const cartTotal = useMemo(() => {
    const discount = Math.min(orderDiscount, cartSubtotal);
    return Math.max(0, cartSubtotal - discount);
  }, [cartSubtotal, orderDiscount]);

  const totalItemCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // A changed cart is a new sale attempt.
  useEffect(() => {
    clientRefRef.current = null;
  }, [cart, orderDiscount, paymentAccountId]);

  // Add variation to cart
  const addToCart = (
    item: StockByShopGridItem,
    product: {
      product_id: number;
      product_name: string;
      product_code: string;
      selling_price: number;
      cost_price: number;
    }
  ) => {
    if (!activeShop) return;

    // Current shop stock count
    const shopStock = item.stocks.find((s) => s.location_id === activeShop.id)?.qty || 0;
    if (shopStock <= 0) {
      return; // Cannot add out of stock
    }

    setCart((prevCart) => {
      const existing = prevCart.find((ci) => ci.variation_id === item.variation_id);
      if (existing) {
        if (existing.quantity >= shopStock) {
          alert(`Only ${shopStock} items available in ${activeShop.name}.`);
          return prevCart;
        }
        return prevCart.map((ci) =>
          ci.variation_id === item.variation_id ? { ...ci, quantity: ci.quantity + 1 } : ci
        );
      } else {
        return [
          ...prevCart,
          {
            variation_id: item.variation_id,
            product_id: product.product_id,
            product_name: product.product_name,
            product_code: product.product_code,
            size: item.size,
            sku: item.sku,
            unit_price: product.selling_price,
            unit_cost: product.cost_price,
            quantity: 1,
            max_stock: shopStock,
            discount: 0,
          },
        ];
      }
    });

    // Close size picker if open
    setSelectedProductForSize(null);
  };

  const updateQuantity = (variation_id: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.variation_id === variation_id) {
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
        .filter(Boolean) as CartItem[]
    );
  };

  const removeFromCart = (variation_id: number) => {
    setCart((prev) => prev.filter((item) => item.variation_id !== variation_id));
  };

  // Handle Checkout submission
  const handleCheckout = async () => {
    if (!activeShop) {
      setErrorMsg('No active shop selected. Please choose a shop first.');
      return;
    }
    if (cart.length === 0) {
      setErrorMsg('Cart is empty.');
      return;
    }
    if (!paymentAccountId) {
      setErrorMsg('This shop has no payment account. Ask an admin to set one up.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      clientRefRef.current ??= `pos-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      const payload: CreateSaleDto = {
        client_ref: clientRefRef.current,
        customer_name: customerName.trim() || 'Walk-in Customer',
        customer_phone: customerPhone.trim() || undefined,
        payment_account_id: paymentAccountId,
        discount_amount: orderDiscount,
        items: cart.map((ci) => ({
          product_variation_id: ci.variation_id,
          quantity: ci.quantity,
          discount: ci.discount || 0,
        })),
      };

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
      setCart([]);
      setOrderDiscount(0);

      // Refresh stock data and recent sales
      fetchStockData();
      fetchRecentSales(activeShop.id);
      if (onSaleCompleted) onSaleCompleted();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to complete sale');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] max-w-full overflow-hidden bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text">
      {/* POS Top Navigation Bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border">
        <div className="flex items-center space-x-3">
          <button
            type="button"
            onClick={onExit}
            aria-label="Back"
            data-testid="pos-back"
            className="w-11 h-11 -ml-2 flex items-center justify-center rounded-xl text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center space-x-2">
            <ShoppingCart className="w-5 h-5 text-primary dark:text-primary-tint" />
            <span className="font-extrabold text-sm md:text-base">Point of Sale</span>
          </div>
          {activeShop && (
            <span className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary dark:text-primary-tint border border-primary/20">
              <Store className="w-3.5 h-3.5" />
              <span>{activeShop.name} ({activeShop.code})</span>
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setShowRecentSales(!showRecentSales)}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              showRecentSales
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-light-surface-hover dark:bg-dark-surface-hover border-light-border dark:border-dark-border text-light-text dark:text-dark-text'
            }`}
          >
            <Receipt className="w-4 h-4" />
            <span className="hidden sm:inline">Receipts</span>
          </button>
        </div>
      </div>

      {/* Main POS Layout */}
      {!activeShop ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <Store className="w-8 h-8 stroke-1 mb-2 opacity-50" />
          <p className="text-sm font-semibold">Choose a shop to start selling</p>
          <p className="text-xs mt-1 text-light-text-muted dark:text-dark-text-muted">
            Use the shop button in the top bar. A sale always belongs to one shop.
          </p>
        </div>
      ) : showRecentSales ? (
        /* Recent Sales & Receipt Reprint View */
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base md:text-lg font-bold">Recent Receipts ({activeShop?.name || 'All'})</h2>
            <button
              type="button"
              onClick={() => setShowRecentSales(false)}
              className="text-xs text-primary font-bold hover:underline"
            >
              Back to Catalog
            </button>
          </div>

          {recentSales.length === 0 ? (
            <div className="text-center py-12 text-light-text-muted dark:text-dark-text-muted">
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
                    <span className="text-[11px] text-light-text-muted dark:text-dark-text-muted">
                      {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    Customer: {sale.customer_name} {sale.customer_phone ? `(${sale.customer_phone})` : ''}
                  </div>
                  <div className="flex items-center justify-between text-xs pt-2 border-t border-light-border dark:border-dark-border">
                    <span className="font-semibold">{sale.items?.length || 0} items</span>
                    <span className="font-mono font-extrabold text-sm">৳{sale.total_amount.toFixed(2)}</span>
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
        /* Standard POS Terminal: Left Cart panel (Tablet/Desktop) + Right Products Grid */
        <div className="flex-1 flex overflow-hidden">
          {/* CART PANEL: Visible on Tablet/Desktop (320px tablet, 360px laptop, 400px desktop per DESIGN.md lines 530-532) */}
          <aside className="hidden md:flex flex-col w-[320px] lg:w-[360px] xl:w-[400px] flex-shrink-0 bg-light-surface dark:bg-dark-surface border-r border-light-border dark:border-dark-border h-full">
            <div className="p-3 border-b border-light-border dark:border-dark-border flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-primary" />
                <span className="font-bold text-sm">Current Order ({totalItemCount})</span>
              </div>
              {cart.length > 0 && (
                <button
                  type="button"
                  onClick={() => setCart([])}
                  className="text-xs text-danger hover:underline flex items-center space-x-1"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Clear</span>
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center text-light-text-muted dark:text-dark-text-muted">
                  <ShoppingCart className="w-8 h-8 stroke-1 mb-2 opacity-50" />
                  <p className="text-xs font-semibold">Cart is empty</p>
                  <p className="text-[11px] mt-1">Tap products on the right to start a sale</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div
                    key={item.variation_id}
                    className="p-2.5 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border space-y-2"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-xs font-bold leading-tight">{item.product_name}</div>
                        <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted font-mono mt-0.5">
                          Size: <span className="font-bold text-primary dark:text-primary-tint">{item.size}</span> | {item.sku}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeFromCart(item.variation_id)}
                        className="text-light-text-muted hover:text-danger p-1"
                        aria-label="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      {/* Quantity stepper */}
                      <div className="flex items-center border border-light-border dark:border-dark-border rounded-lg bg-light-surface dark:bg-dark-surface">
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variation_id, -1)}
                          className="w-7 h-7 flex items-center justify-center hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover text-light-text dark:text-dark-text rounded-l-lg"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-xs font-bold font-mono">
                          {item.quantity}
                        </span>
                        <button
                          type="button"
                          onClick={() => updateQuantity(item.variation_id, 1)}
                          disabled={item.quantity >= item.max_stock}
                          className="w-7 h-7 flex items-center justify-center hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover text-light-text dark:text-dark-text rounded-r-lg disabled:opacity-40"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <div className="text-right">
                        <div className="font-mono text-xs font-bold">
                          ৳{(item.unit_price * item.quantity).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted">
                          ৳{item.unit_price} each
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart Footer: Summary & Checkout button (At least 48px tall) */}
            <div className="p-3 bg-light-surface-hover dark:bg-dark-surface-hover border-t border-light-border dark:border-dark-border space-y-2">
              <div className="space-y-1 text-xs">
                <div className="flex justify-between text-light-text-muted dark:text-dark-text-muted">
                  <span>Subtotal</span>
                  <span className="font-mono">৳{cartSubtotal.toFixed(2)}</span>
                </div>
                {orderDiscount > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>Discount</span>
                    <span className="font-mono">-৳{orderDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-light-border dark:border-dark-border">
                  <span>Total Amount</span>
                  <span className="font-mono text-base text-primary dark:text-primary-tint">
                    ৳{cartTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setIsCheckoutOpen(true)}
                className="w-full h-12 flex items-center justify-center space-x-2 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-bold text-sm shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CreditCard className="w-4 h-4" />
                <span>Proceed to Checkout</span>
              </button>
            </div>
          </aside>

          {/* PRODUCTS CATALOG: Search-first + Product Grid */}
          <main className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Search Bar (Search-first POS per agent.md Step 3 & DESIGN.md lines 534-535) */}
            <div className="p-3 md:p-4 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-light-text-muted dark:text-dark-text-muted" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by product name, code, SKU or size..."
                  className="w-full h-11 pl-9 pr-8 rounded-xl text-xs md:text-sm bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-3 text-light-text-muted hover:text-light-text"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Products Grid */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4">
              {loading ? (
                <div className="flex items-center justify-center h-48 text-xs text-light-text-muted">
                  Loading catalog & stock counts...
                </div>
              ) : filteredProducts.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-center text-light-text-muted">
                  <AlertCircle className="w-8 h-8 stroke-1 mb-2 opacity-50" />
                  <p className="text-xs font-semibold">No products found</p>
                  <p className="text-[11px] mt-1">Try another search or import products</p>
                </div>
              ) : (
                /* Responsive columns per DESIGN.md lines 529-532:
                   Phone: 2 columns
                   Tablet: 2 or 3 columns
                   Laptop: 3 or 4 columns
                   Desktop: 4 or more columns
                */
                <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 md:gap-3.5">
                  {filteredProducts.map((prod) => {
                    // Check stock in active shop across all variations
                    const totalShopStock = prod.items.reduce((sum, v) => {
                      const s = v.stocks.find((st) => st.location_id === activeShop?.id);
                      return sum + (s?.qty || 0);
                    }, 0);

                    const hasSizes = prod.items.length > 1;

                    return (
                      <div
                        key={prod.product_id}
                        onClick={() => {
                          if (hasSizes) {
                            setSelectedProductForSize(prod);
                          } else if (prod.items.length === 1) {
                            addToCart(prod.items[0], prod);
                          }
                        }}
                        className={`p-3 rounded-xl border transition-all text-left flex flex-col justify-between cursor-pointer select-none active:scale-[0.98] ${
                          totalShopStock > 0
                            ? 'bg-light-surface dark:bg-dark-surface border-light-border dark:border-dark-border hover:border-primary/50 shadow-sm'
                            : 'bg-light-surface/50 dark:bg-dark-surface/50 border-light-border/50 dark:border-dark-border/50 opacity-60'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-mono font-bold text-light-text-muted dark:text-dark-text-muted uppercase">
                              {prod.product_code}
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                totalShopStock > 0
                                  ? 'bg-success/10 text-success-text-light dark:text-success'
                                  : 'bg-danger/10 text-danger-text-light dark:text-danger'
                              }`}
                            >
                              {totalShopStock > 0 ? `${totalShopStock} in stock` : 'Out of stock'}
                            </span>
                          </div>
                          <h4 className="font-bold text-xs md:text-sm line-clamp-2 leading-tight">
                            {prod.product_name}
                          </h4>
                        </div>

                        <div className="mt-3 pt-2 border-t border-light-border/60 dark:border-dark-border/60 flex items-center justify-between">
                          <span className="font-mono font-extrabold text-xs md:text-sm text-primary dark:text-primary-tint">
                            ৳{prod.selling_price.toFixed(2)}
                          </span>
                          <span className="text-[10px] font-semibold text-light-text-muted dark:text-dark-text-muted bg-light-surface-hover dark:bg-dark-surface-hover px-1.5 py-0.5 rounded">
                            {hasSizes ? `${prod.items.length} sizes` : 'Standard'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Mobile Bottom Sticky Bar (DESIGN.md line 529: item count, total and Checkout) */}
            <div className="md:hidden p-3 bg-light-surface dark:bg-dark-surface border-t border-light-border dark:border-dark-border flex items-center justify-between shadow-lg">
              <div>
                <span className="text-[11px] text-light-text-muted dark:text-dark-text-muted block">
                  {totalItemCount} {totalItemCount === 1 ? 'item' : 'items'}
                </span>
                <span className="font-mono font-extrabold text-base text-primary dark:text-primary-tint">
                  ৳{cartTotal.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                disabled={cart.length === 0}
                onClick={() => setIsMobileCartOpen(true)}
                className="h-11 px-5 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-bold text-xs flex items-center space-x-1.5 shadow-md disabled:opacity-50"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>View Cart & Checkout</span>
              </button>
            </div>
          </main>
        </div>
      )}

      {/* SIZE PICKER MODAL / SHEET (DESIGN.md lines 540-545) */}
      {selectedProductForSize && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-xs p-0 md:p-4 animate-in fade-in">
          <div className="w-full md:max-w-md bg-light-surface dark:bg-dark-surface rounded-t-2xl md:rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-sm md:text-base">
                  {selectedProductForSize.product_name}
                </h3>
                <span className="text-xs text-light-text-muted dark:text-dark-text-muted font-mono">
                  {selectedProductForSize.product_code} • ৳{selectedProductForSize.selling_price.toFixed(2)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedProductForSize(null)}
                className="p-1 rounded-lg hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover text-light-text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
                Select Size:
              </span>
              {/* 48px touch tiles per DESIGN.md line 543 */}
              <div className="grid grid-cols-3 gap-2.5">
                {selectedProductForSize.items.map((v) => {
                  const currentShopQty =
                    v.stocks.find((s) => s.location_id === activeShop?.id)?.qty || 0;
                  const otherShopsStock = v.stocks
                    .filter((s) => !s.is_system && s.location_id !== activeShop?.id && s.qty > 0)
                    .map((s) => `${s.location_code}: ${s.qty}`)
                    .join(', ');

                  const isAvailable = currentShopQty > 0;

                  return (
                    <button
                      key={v.variation_id}
                      type="button"
                      disabled={!isAvailable}
                      onClick={() => addToCart(v, selectedProductForSize)}
                      className={`min-h-[48px] p-2 rounded-xl flex flex-col items-center justify-center border font-sans text-xs transition-all ${
                        isAvailable
                          ? 'bg-light-surface-hover dark:bg-dark-surface-hover border-light-border dark:border-dark-border hover:border-primary hover:bg-primary/5 active:scale-95'
                          : 'bg-light-surface/40 dark:bg-dark-surface/40 border-dashed border-light-border/60 text-light-text-muted opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <span className="font-extrabold text-sm">{v.size}</span>
                      <span
                        className={`text-[10px] font-mono mt-0.5 ${
                          isAvailable
                            ? 'text-success-text-light dark:text-success font-semibold'
                            : 'text-danger-text-light dark:text-danger'
                        }`}
                      >
                        {isAvailable ? `${currentShopQty} in shop` : '0 in shop'}
                      </span>
                      {!isAvailable && otherShopsStock && (
                        <span className="text-[9px] text-light-text-muted mt-0.5 truncate max-w-full">
                          {otherShopsStock}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MOBILE FULL-SCREEN CART SHEET (DESIGN.md line 529) */}
      {isMobileCartOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-light-surface dark:bg-dark-surface md:hidden animate-in slide-in-from-bottom">
          <div className="flex items-center justify-between p-4 border-b border-light-border dark:border-dark-border">
            <div className="flex items-center space-x-2">
              <ShoppingCart className="w-5 h-5 text-primary" />
              <h3 className="font-bold text-sm">Cart ({totalItemCount} items)</h3>
            </div>
            <button
              type="button"
              onClick={() => setIsMobileCartOpen(false)}
              className="p-1.5 rounded-lg hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {cart.map((item) => (
              <div
                key={item.variation_id}
                className="p-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-xs font-bold">{item.product_name}</div>
                    <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted font-mono">
                      Size: {item.size} • ৳{item.unit_price}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(item.variation_id)}
                    className="p-1 text-danger"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center border border-light-border dark:border-dark-border rounded-lg bg-light-surface dark:bg-dark-surface">
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.variation_id, -1)}
                      className="w-8 h-8 flex items-center justify-center"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-9 text-center text-xs font-bold font-mono">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateQuantity(item.variation_id, 1)}
                      disabled={item.quantity >= item.max_stock}
                      className="w-8 h-8 flex items-center justify-center disabled:opacity-40"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <span className="font-mono font-extrabold text-sm">
                    ৳{(item.unit_price * item.quantity).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-light-text-muted">Total Payable</span>
              <span className="font-mono font-extrabold text-lg text-primary dark:text-primary-tint">
                ৳{cartTotal.toFixed(2)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsMobileCartOpen(false);
                setIsCheckoutOpen(true);
              }}
              className="w-full h-12 rounded-xl bg-primary text-on-primary font-bold text-sm shadow-md"
            >
              Proceed to Checkout
            </button>
          </div>
        </div>
      )}

      {/* CHECKOUT MODAL (DESIGN.md line 538) */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <div className="flex items-center space-x-2">
                <CreditCard className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-base">Complete Checkout</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCheckoutOpen(false)}
                className="p-1 rounded-lg hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover text-light-text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger-text-light dark:text-danger text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <div className="space-y-3">
              {/* Customer Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-light-text-muted mb-1">
                    Customer Name
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 absolute left-3 top-3 text-light-text-muted" />
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Walk-in Customer"
                      className="w-full h-10 pl-9 pr-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-light-text-muted mb-1">
                    Customer Phone
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 absolute left-3 top-3 text-light-text-muted" />
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="017xxxxxxxx"
                      className="w-full h-10 pl-9 pr-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text"
                    />
                  </div>
                </div>
              </div>

              {/* Payment Account (Rule 8: Counter sales paid in full at checkout) */}
              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Payment Account *
                </label>
                <select
                  value={paymentAccountId ?? ''}
                  onChange={(e) => setPaymentAccountId(Number(e.target.value))}
                  className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-semibold"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-light-text-muted mt-1">
                  Counter sales are paid in full at checkout.
                </p>
              </div>

              {/* Discount Field */}
              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Discount Amount (৳)
                </label>
                <input
                  type="number"
                  min="0"
                  value={orderDiscount || ''}
                  onChange={(e) => setOrderDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0.00"
                  className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono"
                />
              </div>


              {/* Order Final Summary */}
              <div className="p-3 rounded-xl bg-primary/5 border border-primary/20 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-light-text-muted">Total Items:</span>
                  <span className="font-semibold">{totalItemCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-light-text-muted">Subtotal:</span>
                  <span className="font-mono">৳{cartSubtotal.toFixed(2)}</span>
                </div>
                {orderDiscount > 0 && (
                  <div className="flex justify-between text-danger">
                    <span>Discount:</span>
                    <span className="font-mono">-৳{orderDiscount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-extrabold pt-2 border-t border-primary/20">
                  <span>Grand Total (Paid in Full):</span>
                  <span className="font-mono text-primary dark:text-primary-tint">
                    ৳{cartTotal.toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Payment Buttons >= 48px tall per DESIGN.md line 537 */}
              <button
                type="button"
                disabled={submitting || cart.length === 0}
                onClick={handleCheckout}
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary-hover text-on-primary font-bold text-sm shadow-md transition-all flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {submitting ? (
                  <span>Processing & Posting to Ledger...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-5 h-5" />
                    <span>Complete Sale & Print ৳{cartTotal.toFixed(2)}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 80mm THERMAL RECEIPT PRINT MODAL (Rule 11 & Rule 7) */}
      {completedSale && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-white text-black p-6 rounded-lg shadow-2xl font-mono text-xs space-y-4 max-h-[95dvh] overflow-y-auto">
            {/* Header: Shop Name & sequential invoice */}
            <div className="text-center space-y-1 pb-3 border-b border-dashed border-black/40">
              <h2 className="text-base font-extrabold tracking-wider uppercase">AR OPTION</h2>
              <p className="text-[11px] font-semibold">{completedSale.shop_name}</p>
              <div className="pt-2 text-[11px] font-bold">
                RECEIPT #{completedSale.invoice_number}
              </div>
              <p className="text-[10px] text-gray-600">
                {new Date(completedSale.created_at).toLocaleString()}
              </p>
            </div>

            {/* Customer Info */}
            <div className="text-[10px] space-y-0.5 pb-2 border-b border-dashed border-black/40">
              <div>Customer: {completedSale.customer_name}</div>
              {completedSale.customer_phone && <div>Phone: {completedSale.customer_phone}</div>}
              <div>Cashier: #{completedSale.created_by}</div>
            </div>

            {/* Itemized lines */}
            <div className="space-y-1.5 pb-3 border-b border-dashed border-black/40">
              <div className="flex justify-between font-bold text-[10px] uppercase border-b border-black/20 pb-1">
                <span>Item [Size]</span>
                <span className="text-right">Qty x Price = Total</span>
              </div>
              {completedSale.items?.map((item) => (
                <div key={item.id} className="text-[11px] space-y-0.5">
                  <div className="font-semibold truncate">
                    {item.product_name} [{item.size}]
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-gray-600 font-mono">
                      {item.quantity} x ৳{item.unit_price.toFixed(2)}
                    </span>
                    <span className="font-bold font-mono">
                      ৳{item.total.toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals Calculation */}
            <div className="space-y-1 text-[11px] pb-3 border-b border-dashed border-black/40">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>৳{completedSale.subtotal.toFixed(2)}</span>
              </div>
              {completedSale.discount_amount > 0 && (
                <div className="flex justify-between">
                  <span>Discount:</span>
                  <span>-৳{completedSale.discount_amount.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-black/20">
                <span>TOTAL:</span>
                <span>৳{completedSale.total_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-[10px] pt-1">
                <span>PAID ({completedSale.payment_account_name || 'Paid'}):</span>
                <span>৳{completedSale.paid_amount.toFixed(2)}</span>
              </div>
            </div>

            {/* Policy & QR text */}
            <div className="text-center text-[9px] text-gray-700 space-y-1 pb-2">
              <p>Thank you for shopping at AR Option!</p>
              <p>Exchange policy: 7 days with original receipt and tags attached.</p>
              <p className="text-[8px] text-gray-500">System generated receipt • Rule 7 Verified</p>
            </div>

            {/* Action Buttons: Print & Close */}
            <div className="pt-2 grid grid-cols-2 gap-2 print:hidden font-sans">
              <button
                type="button"
                onClick={() => window.print()}
                className="h-10 bg-black text-white rounded-lg font-bold text-xs flex items-center justify-center space-x-1.5 hover:bg-gray-800"
              >
                <Printer className="w-4 h-4" />
                <span>Print (80mm)</span>
              </button>
              <button
                type="button"
                onClick={() => setCompletedSale(null)}
                className="h-10 bg-gray-200 text-black rounded-lg font-bold text-xs flex items-center justify-center space-x-1 hover:bg-gray-300"
              >
                <RotateCcw className="w-4 h-4" />
                <span>New Sale</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
