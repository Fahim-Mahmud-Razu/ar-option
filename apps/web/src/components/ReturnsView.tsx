import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Plus,
  Trash2,
  Search,
  X,
  History,
} from 'lucide-react';
import type {
  Shop,
  Account,
  ReturnRecord,
  StockByShopGridItem,
  Sale,
} from '@ar-option/shared-types';
import { apiFetch } from '../lib/api';
import { sizeLabel, useSizes } from '../lib/settings';

interface ReturnsViewProps {
  activeShop: Shop | null;
  apiUrl: string;
  onReturnCompleted?: () => void;
}

interface InboundReturnItem {
  variation_id?: number;
  product_name: string;
  size: string;
  sku: string;
  quantity: number;
  max_returnable_qty?: number;
  unit_price: number;
  unit_cost: number;
  condition: 'resaleable' | 'damaged' | 'unlisted';
  unlisted_title?: string;
}

interface OutboundExchangeItem {
  variation_id: number;
  product_name: string;
  size: string;
  sku: string;
  quantity: number;
  unit_price: number;
  unit_cost: number;
}

export const ReturnsView: React.FC<ReturnsViewProps> = ({
  activeShop,
  apiUrl,
  onReturnCompleted,
}) => {
  const sizesOn = useSizes();
  const [activeSubTab, setActiveSubTab] = useState<'create' | 'history'>('create');
  const [mobileStep, setMobileStep] = useState<1 | 2 | 3>(1); // 1: Coming back, 2: Going out, 3: Settle

  // Return mode
  const [isManualReturn, setIsManualReturn] = useState<boolean>(false);
  const [invoiceLookupQuery, setInvoiceLookupQuery] = useState<string>('');
  const [linkedSale, setLinkedSale] = useState<Sale | null>(null);
  const [lookupLoading, setLookupLoading] = useState<boolean>(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Return items state
  const [inboundItems, setInboundItems] = useState<InboundReturnItem[]>([]);
  const [outboundItems, setOutboundItems] = useState<OutboundExchangeItem[]>([]);

  // Unlisted item modal state (for manual returns only)
  const [showUnlistedModal, setShowUnlistedModal] = useState<boolean>(false);
  const [unlistedTitle, setUnlistedTitle] = useState<string>('');
  const [unlistedPrice, setUnlistedPrice] = useState<string>('');
  const [unlistedQty, setUnlistedQty] = useState<number>(1);

  // Settlement and metadata
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);

  // Catalog stock for selecting exchange items or manual return items
  const [stockGrid, setStockGrid] = useState<StockByShopGridItem[]>([]);
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [showCatalogModal, setShowCatalogModal] = useState<'inbound' | 'outbound' | null>(null);

  // History state
  const [returnsList, setReturnsList] = useState<ReturnRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState<boolean>(false);

  // Submission state
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Fetch Accounts for active shop
  const fetchAccounts = useCallback(async (shopId: number) => {
    try {
      const res = await apiFetch(`${apiUrl}/ledger/payment-accounts?shop_id=${shopId}`);
      if (res.ok) {
        const data: Account[] = await res.json();
        const assetAccounts = data.filter((a) => a.type === 'asset');
        setAccounts(assetAccounts);
        if (assetAccounts.length > 0) {
          const cashAcc = assetAccounts.find((a) => a.code.startsWith('CASH_'));
          setPaymentAccountId(cashAcc ? cashAcc.id : assetAccounts[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, [apiUrl]);

  // Fetch Stock Catalog
  const fetchStockGrid = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiUrl}/reports/stock-by-shop`);
      if (res.ok) {
        const data: StockByShopGridItem[] = await res.json();
        setStockGrid(data);
      }
    } catch {
      // ignore
    }
  }, [apiUrl]);

  // Fetch Returns History
  const fetchReturnsList = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const url = activeShop
        ? `${apiUrl}/returns?shop_id=${activeShop.id}`
        : `${apiUrl}/returns`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data: ReturnRecord[] = await res.json();
        setReturnsList(data);
      }
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, [apiUrl, activeShop]);

  useEffect(() => {
    if (activeShop) {
      fetchAccounts(activeShop.id);
    }
    fetchStockGrid();
    fetchReturnsList();
  }, [activeShop, fetchAccounts, fetchStockGrid, fetchReturnsList]);

  // Invoice Lookup for Linked Returns
  const handleLookupInvoice = async () => {
    const q = invoiceLookupQuery.trim();
    if (!q) return;

    setLookupLoading(true);
    setLookupError(null);
    setLinkedSale(null);

    try {
      const res = await apiFetch(`${apiUrl}/pos/sales`);
      if (res.ok) {
        const sales: Sale[] = await res.json();
        const found = sales.find(
          (s) => s.invoice_number.toUpperCase() === q.toUpperCase() || String(s.id) === q
        );
        if (found) {
          setLinkedSale(found);
          setCustomerName(found.customer_name || '');
          setCustomerPhone(found.customer_phone || '');
        } else {
          setLookupError(`Invoice "${q}" not found in sales history.`);
        }
      }
    } catch {
      setLookupError('Failed to lookup invoice.');
    } finally {
      setLookupLoading(false);
    }
  };

  // Add Item from Linked Sale to Coming Back
  const addSaleItemToInbound = (item: any) => {
    const existing = inboundItems.find((i) => i.variation_id === item.product_variation_id);
    if (existing) {
      if (existing.quantity >= item.quantity) {
        alert(`Cannot exceed originally purchased quantity of ${item.quantity}.`);
        return;
      }
      setInboundItems((prev) =>
        prev.map((i) =>
          i.variation_id === item.product_variation_id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setInboundItems((prev) => [
        ...prev,
        {
          variation_id: item.product_variation_id,
          product_name: item.product_name,
          size: item.size,
          sku: item.sku,
          quantity: 1,
          max_returnable_qty: item.quantity,
          unit_price: Number(item.unit_price) - (Number(item.discount || 0) / Number(item.quantity)),
          unit_cost: Number(item.unit_cost || 0),
          condition: 'resaleable',
        },
      ]);
    }
  };

  // Add Item from Catalog to Outbound (Exchange)
  const addCatalogItemToOutbound = (item: StockByShopGridItem) => {
    const existing = outboundItems.find((i) => i.variation_id === item.variation_id);
    const shopQty = item.stocks.find((s) => s.location_id === activeShop?.id)?.qty || 0;

    if (shopQty <= 0) {
      alert(`Item is out of stock in ${activeShop?.name}.`);
      return;
    }

    if (existing) {
      if (existing.quantity >= shopQty) {
        alert(`Cannot exceed ${shopQty} available in shop.`);
        return;
      }
      setOutboundItems((prev) =>
        prev.map((i) =>
          i.variation_id === item.variation_id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setOutboundItems((prev) => [
        ...prev,
        {
          variation_id: item.variation_id,
          product_name: item.product_name,
          size: item.size,
          sku: item.sku,
          quantity: 1,
          unit_price: item.selling_price,
          unit_cost: item.cost_price,
        },
      ]);
    }
    setShowCatalogModal(null);
  };

  // Add Item from Catalog to Inbound (Manual Return)
  const addCatalogItemToInbound = (item: StockByShopGridItem) => {
    const existing = inboundItems.find((i) => i.variation_id === item.variation_id);
    if (existing) {
      setInboundItems((prev) =>
        prev.map((i) =>
          i.variation_id === item.variation_id ? { ...i, quantity: i.quantity + 1 } : i
        )
      );
    } else {
      setInboundItems((prev) => [
        ...prev,
        {
          variation_id: item.variation_id,
          product_name: item.product_name,
          size: item.size,
          sku: item.sku,
          quantity: 1,
          unit_price: item.selling_price,
          unit_cost: item.cost_price,
          condition: 'resaleable',
        },
      ]);
    }
    setShowCatalogModal(null);
  };

  // Add unlisted item
  const handleAddUnlisted = () => {
    const p = parseFloat(unlistedPrice);
    if (!unlistedTitle.trim() || isNaN(p) || p <= 0) {
      alert('Please enter a valid title and positive refund amount.');
      return;
    }

    setInboundItems((prev) => [
      ...prev,
      {
        product_name: unlistedTitle.trim(),
        unlisted_title: unlistedTitle.trim(),
        size: 'N/A',
        sku: 'UNLISTED',
        quantity: unlistedQty,
        unit_price: p,
        unit_cost: 0,
        condition: 'unlisted',
      },
    ]);
    setShowUnlistedModal(false);
    setUnlistedTitle('');
    setUnlistedPrice('');
    setUnlistedQty(1);
  };

  // Totals & Net Calculation (DESIGN.md line 557)
  const inboundSubtotal = useMemo(() => {
    return inboundItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  }, [inboundItems]);

  const outboundSubtotal = useMemo(() => {
    return outboundItems.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  }, [outboundItems]);

  const netAmount = outboundSubtotal - inboundSubtotal;

  // Plain English net text per DESIGN.md line 557
  const netSentence = useMemo(() => {
    if (inboundItems.length === 0 && outboundItems.length === 0) {
      return 'No items selected';
    }
    if (netAmount > 0) {
      return `Customer pays ৳${netAmount.toFixed(2)}`;
    } else if (netAmount < 0) {
      return `Refund ৳${Math.abs(netAmount).toFixed(2)}`;
    } else {
      return '৳0.00 — Even Exchange';
    }
  }, [netAmount, inboundItems.length, outboundItems.length]);

  // Submit Return
  const handleSubmitReturn = async () => {
    if (!activeShop) {
      setFeedback({ type: 'error', message: 'Shop is required. Please select a shop.' });
      return;
    }
    if (inboundItems.length === 0 && outboundItems.length === 0) {
      setFeedback({ type: 'error', message: 'Please add at least one item to return or exchange.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const finalReason = reason.trim() || (isManualReturn ? 'Manual return' : 'Return / Exchange');
      const payload = {
        sale_id: isManualReturn ? undefined : linkedSale?.id,
        is_manual: isManualReturn,
        customer_name: customerName.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        reason: finalReason,
        notes: notes.trim() || undefined,
        payment_account_id: paymentAccountId || undefined,
        action_type: netAmount > 0 ? 'customer_paid' : netAmount < 0 ? 'refunded' : 'even',
        items: [
          ...inboundItems.map((item) => ({
            direction: 'in' as const,
            product_variation_id: item.variation_id,
            unlisted_title: item.unlisted_title,
            quantity: item.quantity,
            unit_price: item.unit_price,
            condition: item.condition,
          })),
          ...outboundItems.map((item) => ({
            direction: 'out' as const,
            product_variation_id: item.variation_id,
            quantity: item.quantity,
            condition: 'exchange_out' as const,
          })),
        ],
      };

      const res = await apiFetch(`${apiUrl}/returns`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Id': String(activeShop.id),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Return failed: ${res.statusText}`);
      }

      const created: ReturnRecord = await res.json();
      setFeedback({
        type: 'success',
        message: `Return & Exchange #${created.return_number} saved and balanced on the ledger! (${netSentence})`,
      });

      // Reset form
      setInboundItems([]);
      setOutboundItems([]);
      setLinkedSale(null);
      setInvoiceLookupQuery('');
      setReason('');
      setNotes('');
      setCustomerName('');
      setCustomerPhone('');
      setMobileStep(1);

      fetchReturnsList();
      fetchStockGrid();
      if (onReturnCompleted) onReturnCompleted();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to submit return' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Sub-Tab Navigation */}
      <div className="bg-light-surface dark:bg-dark-surface p-4 md:p-6 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <RotateCcw className="w-6 h-6 text-primary dark:text-primary-tint" />
            <h2 className="text-lg md:text-xl font-bold">Return & Exchange</h2>
          </div>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
            Section 5.1: Unified document for returns, size swaps and net cash settlement
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex p-1 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-xs">
            <button
              type="button"
              onClick={() => setActiveSubTab('create')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-colors ${
                activeSubTab === 'create'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-light-text-muted hover:text-light-text'
              }`}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Return / Exchange</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('history')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-colors ${
                activeSubTab === 'history'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-light-text-muted hover:text-light-text'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>Return History</span>
            </button>
          </div>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-xl text-xs flex items-center space-x-2 ${
            feedback.type === 'success'
              ? 'bg-success/10 text-success-text-light dark:text-success border border-success/20'
              : 'bg-danger/10 text-danger-text-light dark:text-danger border border-danger/20'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {activeSubTab === 'history' ? (
        /* RETURNS HISTORY TABLE */
        <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-light-border dark:border-dark-border flex items-center justify-between">
            <h3 className="font-bold text-sm">Past Returns & Exchanges</h3>
            <span className="text-xs text-light-text-muted">Section 5.1 & Manual Returns Log</span>
          </div>

          {historyLoading ? (
            <div className="p-8 text-center text-xs text-light-text-muted">Loading returns...</div>
          ) : returnsList.length === 0 ? (
            <div className="p-8 text-center text-xs text-light-text-muted">No returns recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">Return # & Date</th>
                    <th className="py-3 px-4 font-semibold">Type</th>
                    <th className="py-3 px-4 font-semibold">Customer</th>
                    <th className="py-3 px-4 font-semibold">Reason</th>
                    <th className="py-3 px-4 font-semibold text-right">Inbound (৳)</th>
                    <th className="py-3 px-4 font-semibold text-right">Outbound (৳)</th>
                    <th className="py-3 px-4 font-semibold text-right">Net Settlement</th>
                    <th className="py-3 px-4 font-semibold text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-border dark:divide-dark-border">
                  {returnsList.map((ret) => (
                    <tr key={ret.id} className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover">
                      <td className="py-3 px-4">
                        <div className="font-mono font-bold text-primary dark:text-primary-tint">
                          {ret.return_number}
                        </div>
                        <div className="text-[10px] text-light-text-muted mt-0.5">
                          {new Date(ret.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {ret.is_manual ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20">
                            Manual
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary dark:text-primary-tint">
                            Linked ({ret.sale_invoice_number || `Sale #${ret.sale_id}`})
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold">{ret.customer_name || 'Walk-in'}</div>
                        {ret.customer_phone && (
                          <div className="text-[10px] font-mono text-light-text-muted">{ret.customer_phone}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate">{ret.reason}</td>
                      <td className="py-3 px-4 text-right font-mono">৳{ret.inbound_subtotal.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono">৳{ret.outbound_subtotal.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span
                          className={
                            ret.net_amount > 0
                              ? 'text-primary dark:text-primary-tint'
                              : ret.net_amount < 0
                              ? 'text-danger'
                              : 'text-light-text'
                          }
                        >
                          {ret.net_amount > 0
                            ? `+৳${ret.net_amount.toFixed(2)} (Paid)`
                            : ret.net_amount < 0
                            ? `-৳${Math.abs(ret.net_amount).toFixed(2)} (Refund)`
                            : '৳0.00 (Even)'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        {ret.is_approved ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success-text-light dark:text-success">
                            Approved
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger/10 text-danger-text-light dark:text-danger">
                            Pending Approval
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* CREATE RETURN / EXCHANGE VIEW (DESIGN.md lines 550-560) */
        <div className="space-y-4">
          {/* Linked vs Manual Return Mode Selector */}
          <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <label className="flex items-center space-x-2 cursor-pointer text-xs font-bold">
                <input
                  type="radio"
                  name="returnMode"
                  checked={!isManualReturn}
                  onChange={() => {
                    setIsManualReturn(false);
                    setInboundItems([]);
                  }}
                  className="text-primary focus:ring-primary"
                />
                <span>Linked Return (Original Receipt Lookup)</span>
              </label>

              <label className="flex items-center space-x-2 cursor-pointer text-xs font-bold">
                <input
                  type="radio"
                  name="returnMode"
                  checked={isManualReturn}
                  onChange={() => {
                    setIsManualReturn(true);
                    setLinkedSale(null);
                    setInboundItems([]);
                  }}
                  className="text-primary focus:ring-primary"
                />
                <span>Manual Return (No Receipt)</span>
              </label>
            </div>

            {/* If linked: Search by invoice */}
            {!isManualReturn ? (
              <div className="flex items-center space-x-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-light-text-muted" />
                  <input
                    type="text"
                    value={invoiceLookupQuery}
                    onChange={(e) => setInvoiceLookupQuery(e.target.value)}
                    placeholder="Invoice # (e.g. BAN-01-000001)..."
                    className="w-full h-10 pl-9 pr-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleLookupInvoice}
                  disabled={lookupLoading || !invoiceLookupQuery.trim()}
                  className="h-10 px-4 rounded-xl bg-primary text-on-primary text-xs font-bold disabled:opacity-50"
                >
                  {lookupLoading ? 'Searching...' : 'Find Sale'}
                </button>
              </div>
            ) : null}
          </div>

          {lookupError && (
            <div className="p-3 rounded-xl bg-danger/10 text-danger text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4" />
              <span>{lookupError}</span>
            </div>
          )}

          {/* Linked Sale Items Preview */}
          {!isManualReturn && linkedSale && (
            <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-primary dark:text-primary-tint">
                    Sale #{linkedSale.invoice_number}
                  </span>
                  <span className="text-xs text-light-text-muted ml-2">
                    Customer: {linkedSale.customer_name} ({linkedSale.customer_phone || 'No phone'})
                  </span>
                </div>
                <span className="text-xs font-mono font-bold">Total: ৳{linkedSale.total_amount.toFixed(2)}</span>
              </div>

              <div className="text-xs font-semibold text-light-text-muted mt-2">
                Click an item below to add to "Coming Back":
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mt-1">
                {linkedSale.items?.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => addSaleItemToInbound(item)}
                    className="p-2.5 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary cursor-pointer flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-xs">{item.product_name}</div>
                      <div className="text-[10px] text-light-text-muted font-mono">
                        {sizeLabel(item.size, sizesOn) && `Size: ${sizeLabel(item.size, sizesOn)} • `}Qty: {item.quantity} • ৳{item.unit_price}
                      </div>
                    </div>
                    <Plus className="w-4 h-4 text-primary" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* RESPONSIVE LAYOUT (DESIGN.md lines 554-556):
              Phone: 3 steps (Coming back, Going out, Settle). Sticky net bar through all 3.
              Tablet: 2 columns with Coming back and Going out, Settle bar below.
              Laptop and wider: 3 columns.
          */}

          {/* Mobile Step Switcher */}
          <div className="md:hidden flex rounded-xl border border-light-border dark:border-dark-border overflow-hidden text-xs">
            <button
              type="button"
              onClick={() => setMobileStep(1)}
              className={`flex-1 py-2 font-bold text-center ${
                mobileStep === 1 ? 'bg-primary text-on-primary' : 'bg-light-surface dark:bg-dark-surface text-light-text-muted'
              }`}
            >
              1. Return ({inboundItems.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileStep(2)}
              className={`flex-1 py-2 font-bold text-center ${
                mobileStep === 2 ? 'bg-primary text-on-primary' : 'bg-light-surface dark:bg-dark-surface text-light-text-muted'
              }`}
            >
              2. Exchange ({outboundItems.length})
            </button>
            <button
              type="button"
              onClick={() => setMobileStep(3)}
              className={`flex-1 py-2 font-bold text-center ${
                mobileStep === 3 ? 'bg-primary text-on-primary' : 'bg-light-surface dark:bg-dark-surface text-light-text-muted'
              }`}
            >
              3. Settle
            </button>
          </div>

          {/* Mobile Sticky Net Bar through all three steps (DESIGN.md line 554) */}
          <div className="md:hidden sticky top-16 z-20 bg-light-surface dark:bg-dark-surface p-3 rounded-xl border border-light-border dark:border-dark-border shadow-md flex items-center justify-between">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-light-text-muted">Net Amount</div>
              <div className="text-sm font-extrabold font-mono text-primary dark:text-primary-tint">{netSentence}</div>
            </div>
            {mobileStep < 3 ? (
              <button
                type="button"
                onClick={() => setMobileStep((s) => (s + 1) as 1 | 2 | 3)}
                className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold"
              >
                Next Step →
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmitReturn}
                disabled={submitting}
                className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50"
              >
                {submitting ? 'Posting...' : 'Complete Return'}
              </button>
            )}
          </div>

          {/* Multi-Column Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* COLUMN 1: COMING BACK (Inbound) */}
            <div
              className={`space-y-3 bg-light-surface dark:bg-dark-surface p-4 rounded-2xl border border-light-border dark:border-dark-border ${
                mobileStep !== 1 ? 'hidden md:block' : ''
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-light-border dark:border-dark-border">
                <div>
                  <h3 className="font-bold text-sm">Coming Back (Return)</h3>
                  <span className="text-[11px] text-light-text-muted font-mono">
                    Subtotal: ৳{inboundSubtotal.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center space-x-1">
                  {isManualReturn && (
                    <button
                      type="button"
                      onClick={() => setShowUnlistedModal(true)}
                      className="px-2 py-1 text-[11px] font-bold rounded-lg bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border hover:text-primary"
                    >
                      + Unlisted
                    </button>
                  )}
                  {isManualReturn && (
                    <button
                      type="button"
                      onClick={() => setShowCatalogModal('inbound')}
                      className="px-2 py-1 text-[11px] font-bold rounded-lg bg-primary/10 text-primary border border-primary/20"
                    >
                      + Catalog
                    </button>
                  )}
                </div>
              </div>

              {inboundItems.length === 0 ? (
                <div className="text-center py-8 text-xs text-light-text-muted">
                  No items coming back yet.{' '}
                  {!isManualReturn
                    ? 'Find an invoice above to pick items.'
                    : 'Tap + Catalog or + Unlisted above.'}
                </div>
              ) : (
                <div className="space-y-2">
                  {inboundItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-xs">{item.product_name}</div>
                          <div className="text-[10px] text-light-text-muted font-mono">
                            {sizeLabel(item.size, sizesOn) && `Size: ${sizeLabel(item.size, sizesOn)} • `}৳{item.unit_price.toFixed(2)} each
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setInboundItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-danger p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* Condition Tag (DESIGN.md line 558: resaleable or damaged) */}
                      {item.condition !== 'unlisted' ? (
                        <div className="flex items-center space-x-2 pt-1 border-t border-light-border dark:border-dark-border">
                          <span className="text-[10px] font-semibold text-light-text-muted">Condition:</span>
                          <button
                            type="button"
                            onClick={() =>
                              setInboundItems((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, condition: 'resaleable' } : it))
                              )
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.condition === 'resaleable'
                                ? 'bg-success/20 text-success-text-light dark:text-success border border-success'
                                : 'bg-light-surface dark:bg-dark-surface border border-light-border text-light-text-muted'
                            }`}
                          >
                            Resaleable
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setInboundItems((prev) =>
                                prev.map((it, i) => (i === idx ? { ...it, condition: 'damaged' } : it))
                              )
                            }
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              item.condition === 'damaged'
                                ? 'bg-danger/20 text-danger-text-light dark:text-danger border border-danger'
                                : 'bg-light-surface dark:bg-dark-surface border border-light-border text-light-text-muted'
                            }`}
                          >
                            Damaged
                          </button>
                        </div>
                      ) : (
                        <div className="text-[10px] font-bold text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded inline-block">
                          Unlisted Item (Cash effect only)
                        </div>
                      )}

                      <div className="flex items-center justify-between text-xs pt-1">
                        <span className="text-[11px] text-light-text-muted">Qty: {item.quantity}</span>
                        <span className="font-mono font-bold">৳{(item.unit_price * item.quantity).toFixed(2)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* COLUMN 2: GOING OUT (Exchange Outbound) */}
            <div
              className={`space-y-3 bg-light-surface dark:bg-dark-surface p-4 rounded-2xl border border-light-border dark:border-dark-border ${
                mobileStep !== 2 ? 'hidden md:block' : ''
              }`}
            >
              <div className="flex items-center justify-between pb-2 border-b border-light-border dark:border-dark-border">
                <div>
                  <h3 className="font-bold text-sm">Going Out (Exchange)</h3>
                  <span className="text-[11px] text-light-text-muted font-mono">
                    Subtotal: ৳{outboundSubtotal.toFixed(2)}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCatalogModal('outbound')}
                  className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-primary/10 text-primary border border-primary/20"
                >
                  + Add Item
                </button>
              </div>

              {outboundItems.length === 0 ? (
                <div className="text-center py-8 text-xs text-light-text-muted">
                  No exchange items going out. Tap "+ Add Item" to select a replacement size or product.
                </div>
              ) : (
                <div className="space-y-2">
                  {outboundItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border space-y-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-xs">{item.product_name}</div>
                          <div className="text-[10px] text-light-text-muted font-mono">
                            {sizeLabel(item.size, sizesOn) && `Size: ${sizeLabel(item.size, sizesOn)} • `}৳{item.unit_price.toFixed(2)} each
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOutboundItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-danger p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex items-center justify-between text-xs pt-1 border-t border-light-border dark:border-dark-border">
                        <span className="text-[11px] text-light-text-muted">Qty: {item.quantity}</span>
                        <span className="font-mono font-bold text-primary dark:text-primary-tint">
                          ৳{(item.unit_price * item.quantity).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* COLUMN 3: SETTLEMENT & DETAILS */}
            <div
              className={`space-y-4 bg-light-surface dark:bg-dark-surface p-4 rounded-2xl border border-light-border dark:border-dark-border md:col-span-2 lg:col-span-1 ${
                mobileStep !== 3 ? 'hidden lg:block' : ''
              }`}
            >
              <div className="pb-2 border-b border-light-border dark:border-dark-border">
                <h3 className="font-bold text-sm">Settlement & Verification</h3>
                <span className="text-[11px] text-light-text-muted">Single Transaction Post (Rule 3)</span>
              </div>

              {/* Net Banner prominently visible (DESIGN.md line 557) */}
              <div
                className={`p-4 rounded-xl border text-center space-y-1 ${
                  netAmount > 0
                    ? 'bg-primary/10 border-primary text-primary dark:text-primary-tint'
                    : netAmount < 0
                    ? 'bg-danger/10 border-danger text-danger'
                    : 'bg-light-surface-hover dark:bg-dark-surface-hover border-light-border dark:border-dark-border'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">Net Amount</div>
                <div className="text-xl font-extrabold font-mono">{netSentence}</div>
              </div>

              {/* Form fields */}
              <div className="space-y-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-light-text-muted mb-1">
                    Return Reason
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Size exchange, Defective button, Color swap..."
                    className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-light-text-muted mb-1">
                      Customer Name
                    </label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                      className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-light-text-muted mb-1">
                      Phone Number
                    </label>
                    <input
                      type="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="017xxxxxxxx"
                      className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border"
                    />
                  </div>
                </div>

                {netAmount !== 0 && (
                  <div>
                    <label className="block text-[11px] font-semibold text-light-text-muted mb-1">
                      {netAmount > 0 ? 'Receive Cash Into Account' : 'Refund Cash From Account'}
                    </label>
                    <select
                      value={paymentAccountId || ''}
                      onChange={(e) => setPaymentAccountId(parseInt(e.target.value, 10))}
                      className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-semibold"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[11px] font-semibold text-light-text-muted mb-1">
                    Notes
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Staff notes..."
                    className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border"
                  />
                </div>
              </div>

              {/* Submit Button (At least 48px tall) */}
              <button
                type="button"
                disabled={submitting || (inboundItems.length === 0 && outboundItems.length === 0)}
                onClick={handleSubmitReturn}
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary-tint text-on-primary font-bold text-xs flex items-center justify-center space-x-2 shadow-md disabled:opacity-50 transition-colors"
              >
                {submitting ? (
                  <span>Recording Return & Posting Ledger...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Complete & Post ({netSentence})</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CATALOG PICKER MODAL (For exchange items or manual return items) */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-2xl space-y-4 max-h-[90dvh] flex flex-col">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <h3 className="font-bold text-base">
                {showCatalogModal === 'outbound' ? 'Select Exchange Item (Going Out)' : 'Select Manual Return Item'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCatalogModal(null)}
                className="p-1 rounded-lg hover:bg-light-surface-hover text-light-text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-light-text-muted" />
              <input
                type="text"
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search catalog products..."
                className="w-full h-9 pl-9 pr-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2">
              {stockGrid
                .filter(
                  (item) =>
                    !catalogSearch ||
                    item.product_name.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                    item.product_code.toLowerCase().includes(catalogSearch.toLowerCase()) ||
                    item.size.toLowerCase().includes(catalogSearch.toLowerCase())
                )
                .map((item) => {
                  const shopQty =
                    item.stocks.find((s) => s.location_id === activeShop?.id)?.qty || 0;
                  return (
                    <div
                      key={item.variation_id}
                      onClick={() => {
                        if (showCatalogModal === 'outbound') {
                          addCatalogItemToOutbound(item);
                        } else {
                          addCatalogItemToInbound(item);
                        }
                      }}
                      className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-xs">{item.product_name}</div>
                        <div className="text-[10px] text-light-text-muted font-mono">
                          {sizeLabel(item.size, sizesOn) && <>Size: <span className="font-bold text-primary">{sizeLabel(item.size, sizesOn)}</span> | </>}{item.sku}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-xs">৳{item.selling_price.toFixed(2)}</div>
                        <div
                          className={`text-[10px] font-bold ${
                            shopQty > 0 ? 'text-success' : 'text-danger'
                          }`}
                        >
                          {shopQty} in shop
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* UNLISTED ITEM MODAL (Section 5.1: Cash effect only, no stock effect) */}
      {showUnlistedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <h3 className="font-bold text-sm">Add Unlisted Return Item</h3>
              <button
                type="button"
                onClick={() => setShowUnlistedModal(false)}
                className="p-1 rounded-lg text-light-text-muted"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Item Description *
                </label>
                <input
                  type="text"
                  required
                  value={unlistedTitle}
                  onChange={(e) => setUnlistedTitle(e.target.value)}
                  placeholder="e.g. Vintage Leather Belt, Custom Cap..."
                  className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Refund Price (৳) *
                </label>
                <input
                  type="number"
                  required
                  min="1"
                  value={unlistedPrice}
                  onChange={(e) => setUnlistedPrice(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border font-mono font-bold"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-amber-500/10 text-[10px] text-amber-700 dark:text-amber-400">
                Rule 5.1: Unlisted items affect cash refund balance only and have NO stock effect.
              </div>

              <button
                type="button"
                onClick={handleAddUnlisted}
                className="w-full h-11 rounded-xl bg-primary text-on-primary font-bold text-xs"
              >
                Add Unlisted Item
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
