import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeftRight,
  Plus,
  Truck,
  CheckCircle2,
  Clock,
  AlertCircle,
  X,
  ChevronRight,
} from 'lucide-react';
import type {
  Shop,
  StockTransfer,
  StockTransferStatus,
  StockByShopGridItem,
  CreateTransferDto,
  ReceiveTransferDto,
} from '@ar-option/shared-types';
import { apiFetch } from '../lib/api';

interface TransfersViewProps {
  activeShop: Shop | null;
  shops: Shop[];
  apiUrl: string;
}

export const TransfersView: React.FC<TransfersViewProps> = ({
  activeShop,
  shops,
  apiUrl,
}) => {
  const [tab, setTab] = useState<StockTransferStatus>('in_transit');
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Send transfer modal state
  const [showSendModal, setShowSendModal] = useState<boolean>(false);
  const [destShopId, setDestShopId] = useState<string>('');
  const [products, setProducts] = useState<StockByShopGridItem[]>([]);
  const [selectedVariationId, setSelectedVariationId] = useState<string>('');
  const [sendQty, setSendQty] = useState<string>('1');
  const [sendNotes, setSendNotes] = useState<string>('');
  const [sending, setSending] = useState<boolean>(false);

  // Receive modal state
  const [receivingTransfer, setReceivingTransfer] = useState<StockTransfer | null>(null);
  const [receiveQtys, setReceiveQtys] = useState<Record<number, number>>({});
  const [shortageReasons, setShortageReasons] = useState<Record<number, string>>({});
  const [receiving, setReceiving] = useState<boolean>(false);

  // Fetch transfers
  const fetchTransfers = useCallback(() => {
    setLoading(true);
    setError(null);
    const url = activeShop
      ? `${apiUrl}/transfers?status=${tab}&shop_id=${activeShop.id}`
      : `${apiUrl}/transfers?status=${tab}`;

    apiFetch(url)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load stock transfers');
        return res.json();
      })
      .then((data: StockTransfer[]) => {
        setTransfers(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [apiUrl, tab, activeShop]);

  useEffect(() => {
    fetchTransfers();
  }, [fetchTransfers]);

  // Fetch stock by shop for send modal
  const loadProductsForSend = () => {
    apiFetch(`${apiUrl}/reports/stock-by-shop`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: StockByShopGridItem[]) => {
        setProducts(data);
        if (data.length > 0) {
          setSelectedVariationId(data[0].variation_id.toString());
        }
      })
      .catch(() => {});
  };

  const handleOpenSend = () => {
    loadProductsForSend();
    // Default to first destination that isn't current shop
    const eligibleDests = shops.filter((s) => !s.is_system && s.id !== activeShop?.id);
    if (eligibleDests.length > 0) {
      setDestShopId(eligibleDests[0].id.toString());
    }
    setShowSendModal(true);
  };

  const handleSendSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShop) return;

    const toLocId = parseInt(destShopId, 10);
    const varId = parseInt(selectedVariationId, 10);
    const qty = parseFloat(sendQty);

    if (!toLocId || !varId || !qty || qty <= 0) {
      alert('Please fill out all transfer fields with a valid quantity.');
      return;
    }

    setSending(true);
    try {
      const dto: CreateTransferDto = {
        to_location_id: toLocId,
        notes: sendNotes || undefined,
        items: [{ product_variation_id: varId, qty_sent: qty }],
      };

      const res = await apiFetch(`${apiUrl}/transfers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Id': activeShop.id.toString(),
        },
        body: JSON.stringify(dto),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to send transfer');

      setShowSendModal(false);
      setSendQty('1');
      setSendNotes('');
      setTab('in_transit');
      fetchTransfers();
    } catch (err: any) {
      alert(err.message || 'Error sending transfer');
    } finally {
      setSending(false);
    }
  };

  // Open receive modal
  const handleOpenReceive = (transfer: StockTransfer) => {
    setReceivingTransfer(transfer);
    const initialQtys: Record<number, number> = {};
    const initialReasons: Record<number, string> = {};
    for (const item of transfer.items || []) {
      initialQtys[item.id] = item.qty_sent; // default to full receipt
      initialReasons[item.id] = '';
    }
    setReceiveQtys(initialQtys);
    setShortageReasons(initialReasons);
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!receivingTransfer) return;

    // Validate shortage reasons
    for (const item of receivingTransfer.items || []) {
      const rec = receiveQtys[item.id] ?? 0;
      const shortage = item.qty_sent - rec;
      if (shortage > 0 && !shortageReasons[item.id]?.trim()) {
        alert(`Shortage of ${shortage} for '${item.product_name}' requires an explanation reason per Section 5.3.`);
        return;
      }
    }

    setReceiving(true);
    try {
      const dto: ReceiveTransferDto = {
        items: (receivingTransfer.items || []).map((item) => ({
          item_id: item.id,
          qty_received: receiveQtys[item.id] ?? item.qty_sent,
          shortage_reason: shortageReasons[item.id] || undefined,
        })),
      };

      const res = await apiFetch(`${apiUrl}/transfers/${receivingTransfer.id}/receive`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeShop ? { 'X-Shop-Id': activeShop.id.toString() } : {}),
        },
        body: JSON.stringify(dto),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to confirm transfer receipt');

      setReceivingTransfer(null);
      setTab('received');
      fetchTransfers();
    } catch (err: any) {
      alert(err.message || 'Error receiving transfer');
    } finally {
      setReceiving(false);
    }
  };

  // Available stock in current shop for selected product
  const selectedProduct = products.find((p) => p.variation_id.toString() === selectedVariationId);
  const currentShopStock =
    selectedProduct?.stocks.find((s) => s.location_id === activeShop?.id)?.qty || 0;

  return (
    <div className="space-y-6">
      {/* Top Header with Transfer Action */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold flex items-center space-x-2">
            <ArrowLeftRight className="w-5 h-5 text-primary dark:text-primary-tint" />
            <span>Two-Step Stock Transfers</span>
          </h2>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
            Rule 5.3: Sent (source shop $\to$ In Transit) & Received (destination shop confirmation)
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={handleOpenSend}
            disabled={!activeShop}
            className="w-full sm:w-auto h-11 px-4 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center space-x-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Send Stock Transfer</span>
          </button>
        </div>
      </div>

      {!activeShop && (
        <div className="p-3 rounded-xl bg-amber-500/10 text-warning-text-light dark:text-warning text-xs flex items-center space-x-2 border border-amber-500/20">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Rule 1: Select an active shop in the top bar to send a transfer from that location.</span>
        </div>
      )}

      {/* Tabs: In transit, Received, To send per DESIGN.md line 583 */}
      <div className="flex items-center space-x-2 border-b border-light-border dark:border-dark-border pb-2">
        <button
          type="button"
          onClick={() => setTab('in_transit')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
            tab === 'in_transit'
              ? 'bg-primary text-on-primary'
              : 'text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>In Transit</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('received')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
            tab === 'received'
              ? 'bg-primary text-on-primary'
              : 'text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Received</span>
        </button>

        <button
          type="button"
          onClick={() => setTab('to_send')}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 ${
            tab === 'to_send'
              ? 'bg-primary text-on-primary'
              : 'text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover'
          }`}
        >
          <Truck className="w-3.5 h-3.5" />
          <span>To Send</span>
        </button>
      </div>

      {/* Transfers List / Table */}
      {loading ? (
        <div className="py-12 text-center text-xs text-light-text-muted dark:text-dark-text-muted">
          Loading transfers...
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-danger/10 text-danger text-xs text-center">{error}</div>
      ) : transfers.length === 0 ? (
        <div className="bg-light-surface dark:bg-dark-surface p-8 rounded-2xl border border-light-border dark:border-dark-border text-center space-y-2">
          <Truck className="w-8 h-8 text-light-text-muted dark:text-dark-text-muted mx-auto opacity-50" />
          <div className="text-sm font-semibold">No transfers found</div>
          <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
            {tab === 'in_transit'
              ? 'No packages currently in transit.'
              : `No transfers in '${tab}' status.`}
          </div>
        </div>
      ) : (
        <>
          {/* Mobile Card List (<744px) */}
          <div className="md:hidden space-y-3">
            {transfers.map((t) => (
              <div
                key={t.id}
                className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-primary dark:text-primary-tint">
                    {t.transfer_number}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                      t.status === 'received'
                        ? 'bg-success/10 text-success-text-light dark:text-success'
                        : 'bg-amber-500/10 text-warning-text-light dark:text-warning'
                    }`}
                  >
                    {t.status.replace('_', ' ')}
                  </span>
                </div>

                <div className="text-xs flex items-center space-x-2">
                  <span className="font-semibold">{t.from_shop_name}</span>
                  <ChevronRight className="w-3.5 h-3.5 text-light-text-muted dark:text-dark-text-muted" />
                  <span className="font-semibold">{t.to_shop_name}</span>
                </div>

                <div className="bg-light-surface-hover dark:bg-dark-surface-hover p-2.5 rounded-lg text-xs space-y-1">
                  {t.items?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-[11px]">
                      <span>
                        {item.product_name} ({item.size})
                      </span>
                      <span className="font-mono font-bold">
                        {t.status === 'received'
                          ? `${item.qty_received} / ${item.qty_sent} sent`
                          : `${item.qty_sent} pcs`}
                      </span>
                    </div>
                  ))}
                </div>

                {t.status === 'in_transit' && (
                  <button
                    type="button"
                    onClick={() => handleOpenReceive(t)}
                    className="w-full h-10 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover transition-colors flex items-center justify-center space-x-1.5"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Receipt at {t.to_shop_name}</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Tablet & Desktop Table (>=744px) */}
          <div className="hidden md:block bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border overflow-hidden shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-light-surface-hover dark:bg-dark-surface-hover border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Transfer #</th>
                  <th className="py-3 px-4">From</th>
                  <th className="py-3 px-4">To</th>
                  <th className="py-3 px-4">Items</th>
                  <th className="py-3 px-4">Sent At</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-border dark:divide-dark-border">
                {transfers.map((t) => (
                  <tr key={t.id} className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover">
                    <td className="py-3 px-4 font-mono font-bold text-primary dark:text-primary-tint">
                      {t.transfer_number}
                    </td>
                    <td className="py-3 px-4 font-medium">{t.from_shop_name}</td>
                    <td className="py-3 px-4 font-medium">{t.to_shop_name}</td>
                    <td className="py-3 px-4">
                      {t.items?.map((item) => (
                        <div key={item.id} className="text-[11px]">
                          {item.product_name} ({item.size}):{' '}
                          <span className="font-mono font-bold">
                            {t.status === 'received'
                              ? `${item.qty_received}/${item.qty_sent}`
                              : `${item.qty_sent}`}
                          </span>
                        </div>
                      ))}
                    </td>
                    <td className="py-3 px-4 text-light-text-muted dark:text-dark-text-muted">
                      {new Date(t.sent_at).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          t.status === 'received'
                            ? 'bg-success/10 text-success-text-light dark:text-success'
                            : 'bg-amber-500/10 text-warning-text-light dark:text-warning'
                        }`}
                      >
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {t.status === 'in_transit' && (
                        <button
                          type="button"
                          onClick={() => handleOpenReceive(t)}
                          className="h-8 px-3 rounded-lg text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover transition-colors"
                        >
                          Receive
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Modal 1: Send Transfer Dialog */}
      {showSendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-light-surface dark:bg-dark-surface w-full max-w-lg rounded-2xl border border-light-border dark:border-dark-border shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <h3 className="font-bold text-sm md:text-base flex items-center space-x-2">
                <Truck className="w-4 h-4 text-primary" />
                <span>Dispatch Stock Transfer</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowSendModal(false)}
                className="p-1 rounded-lg text-light-text-muted hover:text-light-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSendSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Source Shop (Current Location)
                </label>
                <input
                  type="text"
                  disabled
                  value={activeShop ? `${activeShop.name} (${activeShop.code})` : 'None'}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-semibold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Destination Shop
                </label>
                <select
                  value={destShopId}
                  onChange={(e) => setDestShopId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
                >
                  {shops
                    .filter((s) => !s.is_system && s.id !== activeShop?.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.code})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Product & Size
                </label>
                <select
                  value={selectedVariationId}
                  onChange={(e) => setSelectedVariationId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
                >
                  {products.map((p) => {
                    const stockInShop =
                      p.stocks.find((s) => s.location_id === activeShop?.id)?.qty || 0;
                    return (
                      <option key={p.variation_id} value={p.variation_id}>
                        {p.product_name} - Size {p.size} (Avail: {stockInShop})
                      </option>
                    );
                  })}
                </select>
                <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-1">
                  Available in {activeShop?.name}:{' '}
                  <span className="font-mono font-bold text-primary dark:text-primary-tint">
                    {currentShopStock} pcs
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Quantity to Send
                </label>
                <input
                  type="number"
                  min="1"
                  max={currentShopStock || 1}
                  value={sendQty}
                  onChange={(e) => setSendQty(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl text-xs font-mono bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                  Notes
                </label>
                <input
                  type="text"
                  placeholder="e.g. Courier rider parcel #..."
                  value={sendNotes}
                  onChange={(e) => setSendNotes(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setShowSendModal(false)}
                  className="h-11 px-4 rounded-xl text-xs font-semibold hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sending || currentShopStock < parseFloat(sendQty || '1')}
                  className="h-11 px-5 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {sending ? 'Dispatching...' : 'Dispatch Transfer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Receive Transfer Screen with Steppers & Shortage Reason (DESIGN.md line 584) */}
      {receivingTransfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-light-surface dark:bg-dark-surface w-full max-w-lg rounded-2xl border border-light-border dark:border-dark-border shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-sm md:text-base flex items-center space-x-2">
                  <CheckCircle2 className="w-4 h-4 text-primary" />
                  <span>Confirm Receipt: {receivingTransfer.transfer_number}</span>
                </h3>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
                  Destination: {receivingTransfer.to_shop_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReceivingTransfer(null)}
                className="p-1 rounded-lg text-light-text-muted hover:text-light-text"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleReceiveSubmit} className="space-y-4">
              <div className="space-y-3">
                {receivingTransfer.items?.map((item) => {
                  const currentRec = receiveQtys[item.id] ?? item.qty_sent;
                  const shortage = item.qty_sent - currentRec;

                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-bold text-xs">{item.product_name}</div>
                          <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted">
                            Size: {item.size} • Sent: {item.qty_sent} pcs
                          </div>
                        </div>

                        {/* Stepper (DESIGN.md line 584) */}
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() =>
                              setReceiveQtys((prev) => ({
                                ...prev,
                                [item.id]: Math.max(0, currentRec - 1),
                              }))
                            }
                            className="w-8 h-8 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border font-bold text-sm flex items-center justify-center hover:bg-primary hover:text-on-primary transition-colors"
                          >
                            -
                          </button>
                          <span className="font-mono font-bold text-sm w-8 text-center">
                            {currentRec}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setReceiveQtys((prev) => ({
                                ...prev,
                                [item.id]: Math.min(item.qty_sent, currentRec + 1),
                              }))
                            }
                            className="w-8 h-8 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border font-bold text-sm flex items-center justify-center hover:bg-primary hover:text-on-primary transition-colors"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      {/* Shortage warning & mandatory explanation */}
                      {shortage > 0 && (
                        <div className="pt-2 border-t border-light-border dark:border-dark-border space-y-1">
                          <div className="text-[11px] font-semibold text-danger flex items-center space-x-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>Shortage: {shortage} pcs missing</span>
                          </div>
                          <input
                            type="text"
                            required
                            placeholder="Reason for shortage (required per Section 5.3)..."
                            value={shortageReasons[item.id] || ''}
                            onChange={(e) =>
                              setShortageReasons((prev) => ({
                                ...prev,
                                [item.id]: e.target.value,
                              }))
                            }
                            className="w-full h-9 px-3 rounded-lg text-xs bg-light-surface dark:bg-dark-surface border border-danger/40 focus:outline-none focus:ring-1 focus:ring-danger"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 flex items-center justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => setReceivingTransfer(null)}
                  className="h-11 px-4 rounded-xl text-xs font-semibold hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={receiving}
                  className="h-11 px-5 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover disabled:opacity-50"
                >
                  {receiving ? 'Confirming...' : 'Confirm Stock Receipt'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
