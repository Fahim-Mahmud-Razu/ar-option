import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Truck,
  DollarSign,
  PackageCheck,
  AlertCircle,
  CheckCircle2,
  Search,
  Phone,
  Plus,
  X,
  FileCheck2,
  History,
  ChevronDown,
} from 'lucide-react';
import type {
  Shop,
  Account,
  CourierParcel,
  CourierSettlement,
  StockByShopGridItem,
} from '@ar-option/shared-types';
import { apiFetch } from '../lib/api';
import { sizeLabel, useSizes } from '../lib/settings';

interface CourierViewProps {
  activeShop: Shop | null;
  apiUrl: string;
  onSettlementCompleted?: () => void;
}

export const CourierView: React.FC<CourierViewProps> = ({
  activeShop,
  apiUrl,
  onSettlementCompleted,
}) => {
  const sizesOn = useSizes();
  const [activeTab, setActiveTab] = useState<'parcels' | 'settlement' | 'history'>('parcels');
  const [quickFilter, setQuickFilter] = useState<'all' | 'out_now' | 'delivered_unpaid' | 'returned'>('all');
  const [parcels, setParcels] = useState<CourierParcel[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Summary Metrics
  const [courierSummary, setCourierSummary] = useState<{
    money_with_couriers: number;
    delivered_unpaid_count: number;
    out_now_count: number;
    returned_count: number;
  }>({
    money_with_couriers: 0,
    delivered_unpaid_count: 0,
    out_now_count: 0,
    returned_count: 0,
  });

  // Booking Modal State
  const [showBookModal, setShowBookModal] = useState<boolean>(false);
  const [customerName, setCustomerName] = useState<string>('');
  const [customerPhone, setCustomerPhone] = useState<string>('');
  const [customerAddress, setCustomerAddress] = useState<string>('');
  const [courierName, setCourierName] = useState<string>('Steadfast');
  const [trackingNumber, setTrackingNumber] = useState<string>('');
  const [advanceAmount, setAdvanceAmount] = useState<string>('');
  const [advanceAccountId, setAdvanceAccountId] = useState<number | null>(null);
  const [deliveryCharge, setDeliveryCharge] = useState<string>('100');
  const [parcelNotes, setParcelNotes] = useState<string>('');
  const [bookedItems, setBookedItems] = useState<{
    variation_id: number;
    product_name: string;
    size: string;
    sku: string;
    quantity: number;
    selling_price: number;
  }[]>([]);
  const [showCatalogModal, setShowCatalogModal] = useState<boolean>(false);
  const [catalogSearch, setCatalogSearch] = useState<string>('');

  // Delivery status update modal
  const [updatingParcel, setUpdatingParcel] = useState<CourierParcel | null>(null);
  const [newDeliveryStatus, setNewDeliveryStatus] = useState<string>('delivered');
  const [deliveryNotes, setDeliveryNotes] = useState<string>('');

  // Settlement State
  const [selectedParcelIds, setSelectedParcelIds] = useState<number[]>([]);
  const [amountReceived, setAmountReceived] = useState<string>('');
  const [chargesDeducted, setChargesDeducted] = useState<string>('');
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');
  const [settlementAccountId, setSettlementAccountId] = useState<number | null>(null);
  const [settlementsHistory, setSettlementsHistory] = useState<CourierSettlement[]>([]);

  // Accounts & Catalog Data
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [stockGrid, setStockGrid] = useState<StockByShopGridItem[]>([]);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Fetch Parcels & Summary
  const fetchParcels = useCallback(async () => {
    try {
      setLoading(true);
      const url = new URL(`${apiUrl}/courier/parcels`);
      if (activeShop) url.searchParams.set('shop_id', String(activeShop.id));
      if (quickFilter !== 'all') url.searchParams.set('filter', quickFilter);

      const res = await apiFetch(url.toString());
      if (res.ok) {
        const data: CourierParcel[] = await res.json();
        setParcels(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [apiUrl, activeShop, quickFilter]);

  const fetchSummary = useCallback(async () => {
    try {
      const url = activeShop
        ? `${apiUrl}/courier/summary?shop_id=${activeShop.id}`
        : `${apiUrl}/courier/summary`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setCourierSummary(data);
      }
    } catch {
      // ignore
    }
  }, [apiUrl, activeShop]);

  const fetchAccounts = useCallback(async (shopId: number) => {
    try {
      const res = await apiFetch(`${apiUrl}/ledger/payment-accounts?shop_id=${shopId}`);
      if (res.ok) {
        const data: Account[] = await res.json();
        const assetAccounts = data.filter((a) => a.type === 'asset');
        setAccounts(assetAccounts);
        if (assetAccounts.length > 0) {
          setAdvanceAccountId(assetAccounts[0].id);
          setSettlementAccountId(assetAccounts[0].id);
        }
      }
    } catch {
      // ignore
    }
  }, [apiUrl]);

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

  const fetchSettlements = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiUrl}/courier/settlements`);
      if (res.ok) {
        const data: CourierSettlement[] = await res.json();
        setSettlementsHistory(data);
      }
    } catch {
      // ignore
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchParcels();
    fetchSummary();
    if (activeShop) {
      fetchAccounts(activeShop.id);
    }
    fetchStockGrid();
    fetchSettlements();
  }, [activeShop, quickFilter, fetchParcels, fetchSummary, fetchAccounts, fetchStockGrid, fetchSettlements]);

  // Filter parcels by search query
  const filteredParcels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return parcels;
    return parcels.filter(
      (p) =>
        p.parcel_code.toLowerCase().includes(q) ||
        p.customer_name.toLowerCase().includes(q) ||
        p.customer_phone.includes(q) ||
        (p.tracking_number && p.tracking_number.toLowerCase().includes(q))
    );
  }, [parcels, searchQuery]);

  // Delivered Unpaid Parcels for Settlement Selection
  const deliveredUnpaidParcels = useMemo(() => {
    return parcels.filter(
      (p) => p.delivery_status === 'delivered' && p.payment_status === 'unpaid'
    );
  }, [parcels]);

  // Settlement calculations
  const expectedSettlementTotal = useMemo(() => {
    return deliveredUnpaidParcels
      .filter((p) => selectedParcelIds.includes(p.id))
      .reduce((sum, p) => sum + p.collectible_amount, 0);
  }, [deliveredUnpaidParcels, selectedParcelIds]);

  const numAmountReceived = parseFloat(amountReceived) || 0;
  const numChargesDeducted = parseFloat(chargesDeducted) || 0;
  const accountedTotal = numAmountReceived + numChargesDeducted;
  const settlementDiscrepancy = Math.round((expectedSettlementTotal - accountedTotal) * 100) / 100;
  const hasDiscrepancy = Math.abs(settlementDiscrepancy) > 0.01;

  // Filter catalog products for searchable pop up
  const filteredCatalogItems = useMemo(() => {
    const q = catalogSearch.toLowerCase().trim();
    if (!q) return stockGrid;
    return stockGrid.filter((item) => {
      return (
        item.product_name?.toLowerCase().includes(q) ||
        item.product_code?.toLowerCase().includes(q) ||
        item.sku?.toLowerCase().includes(q) ||
        item.size?.toLowerCase().includes(q) ||
        item.category_name?.toLowerCase().includes(q) ||
        item.brand_name?.toLowerCase().includes(q)
      );
    });
  }, [stockGrid, catalogSearch]);

  const handleSelectCatalogProduct = (item: StockByShopGridItem) => {
    const existingIndex = bookedItems.findIndex((bi) => bi.variation_id === item.variation_id);
    if (existingIndex >= 0) {
      setBookedItems((prev) =>
        prev.map((bi, i) =>
          i === existingIndex ? { ...bi, quantity: bi.quantity + 1 } : bi
        )
      );
    } else {
      setBookedItems((prev) => [
        ...prev,
        {
          variation_id: item.variation_id,
          product_name: item.product_name,
          size: item.size,
          sku: item.sku,
          quantity: 1,
          selling_price: item.selling_price,
        },
      ]);
    }
    setShowCatalogModal(false);
    setCatalogSearch('');
  };

  // Book Parcel Submission
  const handleBookParcel = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!activeShop) {
      setFeedback({ type: 'error', message: 'Active shop is required.' });
      return;
    }
    if (bookedItems.length === 0) {
      setFeedback({ type: 'error', message: 'Please add at least one item to book.' });
      return;
    }

    setSubmitting(true);
    try {
      const adv = parseFloat(advanceAmount) || 0;
      const fee = parseFloat(deliveryCharge) || 0;

      const res = await apiFetch(`${apiUrl}/courier/parcels/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Id': String(activeShop.id),
        },
        body: JSON.stringify({
          customer_name: customerName.trim(),
          customer_phone: customerPhone.trim(),
          customer_address: customerAddress.trim(),
          courier_name: courierName.trim(),
          tracking_number: trackingNumber.trim() || undefined,
          advance_amount: adv,
          advance_account_id: adv > 0 ? advanceAccountId : undefined,
          delivery_charge: fee,
          notes: parcelNotes.trim() || undefined,
          items: bookedItems.map((bi) => ({
            product_variation_id: bi.variation_id,
            quantity: bi.quantity,
          })),
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Booking failed: ${res.statusText}`);
      }

      const created: CourierParcel = await res.json();
      setFeedback({
        type: 'success',
        message: `Parcel ${created.parcel_code} booked successfully! Stock moved to 'With Courier'.`,
      });

      setShowBookModal(false);
      setBookedItems([]);
      setCustomerName('');
      setCustomerPhone('');
      setCustomerAddress('');
      setTrackingNumber('');
      setAdvanceAmount('');
      setParcelNotes('');

      fetchParcels();
      fetchSummary();
      fetchStockGrid();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to book parcel' });
    } finally {
      setSubmitting(false);
    }
  };

  // Update Delivery Status Submission
  const handleUpdateDeliveryStatus = async () => {
    if (!updatingParcel) return;
    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await apiFetch(`${apiUrl}/courier/parcels/${updatingParcel.id}/delivery-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          delivery_status: newDeliveryStatus,
          notes: deliveryNotes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Status update failed: ${res.statusText}`);
      }

      setFeedback({
        type: 'success',
        message: `Parcel ${updatingParcel.parcel_code} status updated to '${newDeliveryStatus}'.`,
      });
      setUpdatingParcel(null);
      setDeliveryNotes('');

      fetchParcels();
      fetchSummary();
      fetchStockGrid();
      if (onSettlementCompleted) onSettlementCompleted();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update delivery status' });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Bulk Settlement
  const handleSubmitSettlement = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (selectedParcelIds.length === 0) {
      setFeedback({ type: 'error', message: 'Please select at least one parcel to settle.' });
      return;
    }
    if (hasDiscrepancy && !discrepancyReason.trim()) {
      setFeedback({
        type: 'error',
        message: 'Rule 5.2: Any settlement discrepancy must be explained with a reason before saving.',
      });
      return;
    }
    if (!settlementAccountId) {
      setFeedback({ type: 'error', message: 'Please select a deposit account.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`${apiUrl}/courier/settlements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courier_name: parcels.find((p) => selectedParcelIds.includes(p.id))?.courier_name || 'Steadfast',
          parcel_ids: selectedParcelIds,
          amount_received: numAmountReceived,
          charges_deducted: numChargesDeducted,
          discrepancy_reason: hasDiscrepancy ? discrepancyReason.trim() : undefined,
          payment_account_id: settlementAccountId,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Settlement failed: ${res.statusText}`);
      }

      const settlement: CourierSettlement = await res.json();
      setFeedback({
        type: 'success',
        message: `Settlement #${settlement.settlement_ref} recorded! ৳${settlement.amount_received.toFixed(2)} posted to ledger.`,
      });

      setSelectedParcelIds([]);
      setAmountReceived('');
      setChargesDeducted('');
      setDiscrepancyReason('');
      setActiveTab('parcels');

      fetchParcels();
      fetchSummary();
      fetchSettlements();
      if (onSettlementCompleted) onSettlementCompleted();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to record settlement' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and Navigation */}
      <div className="bg-light-surface dark:bg-dark-surface p-4 md:p-6 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Truck className="w-6 h-6 text-primary dark:text-primary-tint" />
            <h2 className="text-lg md:text-xl font-bold">Courier & Settlement</h2>
          </div>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
            Section 5.2: Two-Tracks Rule, delivery-triggered sales, and mass parcel settlement
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* Sub tabs */}
          <div className="flex p-1 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('parcels')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-colors ${
                activeTab === 'parcels'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-light-text-muted hover:text-light-text'
              }`}
            >
              <Truck className="w-3.5 h-3.5" />
              <span>Parcels</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('settlement')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-colors ${
                activeTab === 'settlement'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-light-text-muted hover:text-light-text'
              }`}
            >
              <DollarSign className="w-3.5 h-3.5" />
              <span>Bulk Settlement</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-colors ${
                activeTab === 'history'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-light-text-muted hover:text-light-text'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>History</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowBookModal(true)}
            className="h-10 px-3.5 rounded-xl bg-primary hover:bg-primary-tint text-on-primary text-xs font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Book Parcel</span>
          </button>
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

      {/* KPI Stats (DESIGN.md line 569: "Money with couriers") */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
          <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
            Money with Couriers
          </span>
          <div className="text-xl md:text-2xl font-extrabold text-primary dark:text-primary-tint mt-1 font-mono">
            ৳{courierSummary.money_with_couriers.toFixed(2)}
          </div>
          <span className="text-[10px] text-light-text-muted">Delivered & unpaid by courier</span>
        </div>

        <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
          <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
            Delivered Unpaid
          </span>
          <div className="text-xl md:text-2xl font-extrabold mt-1 font-mono">
            {courierSummary.delivered_unpaid_count}
          </div>
          <span className="text-[10px] text-light-text-muted">Ready for settlement</span>
        </div>

        <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
          <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
            Out Now (Transit)
          </span>
          <div className="text-xl md:text-2xl font-extrabold mt-1 font-mono">
            {courierSummary.out_now_count}
          </div>
          <span className="text-[10px] text-light-text-muted">Booked or in delivery</span>
        </div>

        <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
          <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
            Returned Parcels
          </span>
          <div className="text-xl md:text-2xl font-extrabold text-danger mt-1 font-mono">
            {courierSummary.returned_count}
          </div>
          <span className="text-[10px] text-light-text-muted">Stock returned to shop</span>
        </div>
      </div>

      {activeTab === 'parcels' ? (
        /* PARCELS LIST VIEW (DESIGN.md lines 565-571) */
        <div className="space-y-4">
          {/* Quick filters & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-light-surface dark:bg-dark-surface p-3 rounded-xl border border-light-border dark:border-dark-border">
            {/* Quick Filter buttons */}
            <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 md:pb-0 text-xs font-bold">
              <span className="text-light-text-muted text-[11px] mr-1 hidden sm:inline">Filter:</span>
              <button
                type="button"
                onClick={() => setQuickFilter('all')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  quickFilter === 'all'
                    ? 'bg-primary text-on-primary'
                    : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted'
                }`}
              >
                All Parcels
              </button>
              <button
                type="button"
                onClick={() => setQuickFilter('out_now')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  quickFilter === 'out_now'
                    ? 'bg-primary text-on-primary'
                    : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted'
                }`}
              >
                Out Now
              </button>
              <button
                type="button"
                onClick={() => setQuickFilter('delivered_unpaid')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  quickFilter === 'delivered_unpaid'
                    ? 'bg-primary text-on-primary'
                    : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted'
                }`}
              >
                Delivered Unpaid
              </button>
              <button
                type="button"
                onClick={() => setQuickFilter('returned')}
                className={`px-2.5 py-1 rounded-lg transition-colors ${
                  quickFilter === 'returned'
                    ? 'bg-primary text-on-primary'
                    : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted'
                }`}
              >
                Returned
              </button>
            </div>

            {/* Search Input */}
            <div className="relative w-full md:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-light-text-muted" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search parcels, tracking, customer..."
                className="w-full h-9 pl-9 pr-3 rounded-lg text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center text-xs text-light-text-muted">Loading courier parcels...</div>
          ) : filteredParcels.length === 0 ? (
            <div className="p-12 text-center text-xs text-light-text-muted">
              No parcels matching current filter. Tap "Book Parcel" to create one.
            </div>
          ) : (
            /* RESPONSIVE PARCEL DISPLAY (DESIGN.md lines 565-567):
               Phone: parcel cards with customer, tracking number, amount due, both status badges, tel link, action.
               Tablet: list and detail side by side.
               Laptop/Desktop: full table.
            */
            <>
              {/* Phone View: Cards */}
              <div className="md:hidden space-y-3">
                {filteredParcels.map((parcel) => (
                  <div
                    key={parcel.id}
                    className="p-4 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border space-y-3 shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="font-mono font-bold text-xs text-primary dark:text-primary-tint">
                          {parcel.parcel_code}
                        </span>
                        <div className="text-xs font-bold mt-0.5">{parcel.customer_name}</div>
                        <a
                          href={`tel:${parcel.customer_phone}`}
                          className="text-[11px] font-mono text-primary flex items-center space-x-1 mt-0.5"
                        >
                          <Phone className="w-3 h-3" />
                          <span>{parcel.customer_phone}</span>
                        </a>
                      </div>

                      {/* THE TWO TRACKS RULE: Delivery status and Payment status separate labelled badges */}
                      <div className="flex flex-col items-end space-y-1">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            parcel.delivery_status === 'delivered'
                              ? 'bg-success/20 text-success-text-light dark:text-success'
                              : parcel.delivery_status === 'returned'
                              ? 'bg-danger/20 text-danger-text-light dark:text-danger'
                              : 'bg-primary/10 text-primary dark:text-primary-tint'
                          }`}
                        >
                          {parcel.delivery_status}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            parcel.payment_status === 'paid'
                              ? 'bg-success/20 text-success-text-light dark:text-success'
                              : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {parcel.payment_status}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-light-border dark:border-dark-border">
                      <div className="text-[11px] text-light-text-muted">
                        Courier: <span className="font-semibold text-light-text dark:text-dark-text">{parcel.courier_name}</span>
                        {parcel.tracking_number && ` • ${parcel.tracking_number}`}
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-light-text-muted block">Collectible</span>
                        <span className="font-mono font-bold text-sm text-primary dark:text-primary-tint">
                          ৳{parcel.collectible_amount.toFixed(2)}
                        </span>
                      </div>
                    </div>

                    {parcel.delivery_status !== 'delivered' && parcel.delivery_status !== 'returned' && (
                      <button
                        type="button"
                        onClick={() => {
                          setUpdatingParcel(parcel);
                          setNewDeliveryStatus('delivered');
                        }}
                        className="w-full h-10 rounded-xl bg-primary text-on-primary text-xs font-bold flex items-center justify-center space-x-1.5 shadow-sm"
                      >
                        <PackageCheck className="w-4 h-4" />
                        <span>Update Delivery Status</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Tablet & Desktop Table */}
              <div className="hidden md:block bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead>
                      <tr className="border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider">
                        <th className="py-3 px-4 font-semibold">Parcel # & Date</th>
                        <th className="py-3 px-4 font-semibold">Customer</th>
                        <th className="py-3 px-4 font-semibold">Courier & Tracking</th>
                        <th className="py-3 px-4 font-semibold text-right">Order Value</th>
                        <th className="py-3 px-4 font-semibold text-right">Advance</th>
                        <th className="py-3 px-4 font-semibold text-right">Collectible</th>
                        <th className="py-3 px-4 font-semibold text-center">Delivery Status</th>
                        <th className="py-3 px-4 font-semibold text-center">Payment Status</th>
                        <th className="py-3 px-4 font-semibold text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-light-border dark:divide-dark-border font-mono">
                      {filteredParcels.map((parcel) => (
                        <tr key={parcel.id} className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover">
                          <td className="py-3 px-4">
                            <div className="font-bold text-primary dark:text-primary-tint">{parcel.parcel_code}</div>
                            <div className="text-[10px] text-light-text-muted font-sans mt-0.5">
                              {new Date(parcel.created_at).toLocaleDateString()}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-sans">
                            <div className="font-semibold">{parcel.customer_name}</div>
                            <a
                              href={`tel:${parcel.customer_phone}`}
                              className="text-[10px] font-mono text-primary hover:underline block"
                            >
                              {parcel.customer_phone}
                            </a>
                          </td>
                          <td className="py-3 px-4 font-sans">
                            <div className="font-semibold">{parcel.courier_name}</div>
                            <span className="text-[10px] font-mono text-light-text-muted">
                              {parcel.tracking_number || 'No tracking #'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">৳{parcel.order_value.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right text-light-text-muted">
                            {parcel.advance_amount > 0 ? `৳${parcel.advance_amount.toFixed(2)}` : '-'}
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-primary dark:text-primary-tint">
                            ৳{parcel.collectible_amount.toFixed(2)}
                          </td>
                          {/* THE TWO TRACKS RULE */}
                          <td className="py-3 px-4 text-center font-sans">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                parcel.delivery_status === 'delivered'
                                  ? 'bg-success/20 text-success-text-light dark:text-success'
                                  : parcel.delivery_status === 'returned'
                                  ? 'bg-danger/20 text-danger-text-light dark:text-danger'
                                  : 'bg-primary/10 text-primary dark:text-primary-tint'
                              }`}
                            >
                              {parcel.delivery_status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-sans">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                parcel.payment_status === 'paid'
                                  ? 'bg-success/20 text-success-text-light dark:text-success'
                                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                              }`}
                            >
                              {parcel.payment_status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-sans">
                            {parcel.delivery_status !== 'delivered' && parcel.delivery_status !== 'returned' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setUpdatingParcel(parcel);
                                  setNewDeliveryStatus('delivered');
                                }}
                                className="px-2.5 py-1 text-xs font-bold rounded-lg bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border hover:bg-primary hover:text-on-primary transition-colors"
                              >
                                Update
                              </button>
                            ) : (
                              <span className="text-[11px] text-light-text-muted">Completed</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      ) : activeTab === 'settlement' ? (
        /* BULK SETTLEMENT VIEW (DESIGN.md lines 573-580) */
        <div className="space-y-4">
          <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
            <h3 className="font-bold text-sm">Select Delivered Parcels to Settle</h3>
            <p className="text-xs text-light-text-muted mt-0.5">
              Select parcels included in the courier remittance payout. The difference between expected and received must be explained.
            </p>
          </div>

          {deliveredUnpaidParcels.length === 0 ? (
            <div className="p-12 text-center text-xs text-light-text-muted bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border">
              No delivered unpaid parcels waiting for settlement.
            </div>
          ) : (
            <form onSubmit={handleSubmitSettlement} className="space-y-4">
              {/* Parcel selection table */}
              <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border overflow-hidden shadow-sm">
                <div className="p-3 border-b border-light-border dark:border-dark-border flex items-center justify-between">
                  <span className="text-xs font-bold">
                    {selectedParcelIds.length} of {deliveredUnpaidParcels.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedParcelIds.length === deliveredUnpaidParcels.length) {
                        setSelectedParcelIds([]);
                      } else {
                        setSelectedParcelIds(deliveredUnpaidParcels.map((p) => p.id));
                      }
                    }}
                    className="text-xs text-primary font-bold hover:underline"
                  >
                    {selectedParcelIds.length === deliveredUnpaidParcels.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>

                <div className="overflow-x-auto max-h-72">
                  <table className="w-full text-left text-xs font-sans">
                    <thead className="sticky top-0 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border text-light-text-muted">
                      <tr>
                        <th className="py-2.5 px-3 w-10"></th>
                        <th className="py-2.5 px-3">Parcel #</th>
                        <th className="py-2.5 px-3">Customer</th>
                        <th className="py-2.5 px-3">Courier & Tracking</th>
                        <th className="py-2.5 px-3 text-right">Collectible Amount (৳)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-light-border dark:divide-dark-border font-mono">
                      {deliveredUnpaidParcels.map((parcel) => (
                        <tr
                          key={parcel.id}
                          onClick={() => {
                            setSelectedParcelIds((prev) =>
                              prev.includes(parcel.id)
                                ? prev.filter((id) => id !== parcel.id)
                                : [...prev, parcel.id]
                            );
                          }}
                          className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover cursor-pointer"
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={selectedParcelIds.includes(parcel.id)}
                              onChange={() => {}}
                              className="rounded text-primary focus:ring-primary"
                            />
                          </td>
                          <td className="py-2.5 px-3 font-bold text-primary dark:text-primary-tint">
                            {parcel.parcel_code}
                          </td>
                          <td className="py-2.5 px-3 font-sans">{parcel.customer_name}</td>
                          <td className="py-2.5 px-3 font-sans">
                            {parcel.courier_name} {parcel.tracking_number ? `(${parcel.tracking_number})` : ''}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold">
                            ৳{parcel.collectible_amount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Settlement Remittance Input Panel */}
              <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-sm space-y-4">
                <h4 className="font-bold text-sm">Remittance & Charge Deductions</h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-light-text-muted mb-1">
                      Expected Total (Receivable)
                    </label>
                    <div className="h-10 px-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border flex items-center font-mono font-extrabold text-sm text-primary dark:text-primary-tint">
                      ৳{expectedSettlementTotal.toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-light-text-muted mb-1">
                      Amount Received (Bank / Cash) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      required
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-light-text-muted mb-1">
                      Courier Charges Deducted (৳)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={chargesDeducted}
                      onChange={(e) => setChargesDeducted(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-light-text-muted mb-1">
                      Remittance Deposit Account *
                    </label>
                    <select
                      value={settlementAccountId || ''}
                      onChange={(e) => setSettlementAccountId(parseInt(e.target.value, 10))}
                      className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-semibold"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Discrepancy Display */}
                  <div>
                    <label className="block text-xs font-semibold text-light-text-muted mb-1">
                      Difference (Expected vs Received + Charges)
                    </label>
                    <div
                      className={`h-10 px-3 rounded-xl border flex items-center font-mono font-bold text-xs ${
                        hasDiscrepancy
                          ? 'bg-danger/10 border-danger text-danger'
                          : 'bg-success/10 border-success text-success-text-light dark:text-success'
                      }`}
                    >
                      {hasDiscrepancy
                        ? `Difference: ৳${settlementDiscrepancy.toFixed(2)} (Reason required)`
                        : 'Balanced: ৳0.00'}
                    </div>
                  </div>
                </div>

                {hasDiscrepancy && (
                  <div>
                    <label className="block text-xs font-semibold text-danger mb-1">
                      Discrepancy Explanation (Rule 5.2 Mandatory) *
                    </label>
                    <input
                      type="text"
                      required
                      value={discrepancyReason}
                      onChange={(e) => setDiscrepancyReason(e.target.value)}
                      placeholder="e.g. Return fee deduction for parcel PAR-0012, COD cash shortage..."
                      className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-danger text-light-text dark:text-dark-text"
                    />
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    submitting ||
                    selectedParcelIds.length === 0 ||
                    (hasDiscrepancy && !discrepancyReason.trim())
                  }
                  className="w-full h-12 rounded-xl bg-primary hover:bg-primary-tint text-on-primary font-bold text-xs flex items-center justify-center space-x-2 shadow-md transition-colors disabled:opacity-50"
                >
                  {submitting ? (
                    <span>Reconciling & Posting to Ledger...</span>
                  ) : (
                    <>
                      <FileCheck2 className="w-4 h-4" />
                      <span>
                        Save Settlement ({selectedParcelIds.length} Parcels • ৳{numAmountReceived.toFixed(2)})
                      </span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      ) : (
        /* SETTLEMENTS HISTORY */
        <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-light-border dark:border-dark-border flex items-center justify-between">
            <h3 className="font-bold text-sm">Settlement History</h3>
            <span className="text-xs text-light-text-muted">Section 5.2 Remittances</span>
          </div>

          {settlementsHistory.length === 0 ? (
            <div className="p-12 text-center text-xs text-light-text-muted">No settlements recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">Ref # & Date</th>
                    <th className="py-3 px-4 font-semibold">Courier</th>
                    <th className="py-3 px-4 font-semibold text-center">Parcels</th>
                    <th className="py-3 px-4 font-semibold text-right">Total Expected (৳)</th>
                    <th className="py-3 px-4 font-semibold text-right">Charges (৳)</th>
                    <th className="py-3 px-4 font-semibold text-right">Received (৳)</th>
                    <th className="py-3 px-4 font-semibold">Deposit Account</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-border dark:divide-dark-border font-mono">
                  {settlementsHistory.map((s) => (
                    <tr key={s.id} className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover">
                      <td className="py-3 px-4 font-bold text-primary dark:text-primary-tint">
                        <div>{s.settlement_ref}</div>
                        <div className="text-[10px] text-light-text-muted font-sans mt-0.5">
                          {new Date(s.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="py-3 px-4 font-sans font-semibold">{s.courier_name}</td>
                      <td className="py-3 px-4 text-center">{s.parcel_count}</td>
                      <td className="py-3 px-4 text-right">৳{s.total_receivable.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right text-light-text-muted">৳{s.charges_deducted.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-success-text-light dark:text-success">
                        ৳{s.amount_received.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 font-sans text-light-text-muted">{s.payment_account_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* BOOK COURIER PARCEL MODAL */}
      {showBookModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <div className="flex items-center space-x-2">
                <Truck className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-base">Book Courier Parcel</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBookModal(false)}
                className="p-1 rounded-lg text-light-text-muted hover:bg-light-surface-hover"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleBookParcel} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-light-text-muted mb-1">
                    Customer Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer name"
                    className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-light-text-muted mb-1">
                    Customer Phone *
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="017xxxxxxxx"
                    className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Delivery Address *
                </label>
                <textarea
                  rows={2}
                  required
                  value={customerAddress}
                  onChange={(e) => setCustomerAddress(e.target.value)}
                  placeholder="Full street address, district..."
                  className="w-full p-2.5 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-light-text-muted mb-1">
                    Courier Partner *
                  </label>
                  <select
                    value={courierName}
                    onChange={(e) => setCourierName(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border font-semibold"
                  >
                    <option value="Steadfast">Steadfast</option>
                    <option value="Pathao">Pathao</option>
                    <option value="Paperfly">Paperfly</option>
                    <option value="RedX">RedX</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-light-text-muted mb-1">
                    Tracking Number
                  </label>
                  <input
                    type="text"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    placeholder="ST-12345..."
                    className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border"
                  />
                </div>
              </div>

              {/* Items Picker */}
              <div className="space-y-2 pt-2 border-t border-light-border dark:border-dark-border">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-light-text dark:text-dark-text">Parcel Items</span>
                  <button
                    type="button"
                    onClick={() => {
                      setCatalogSearch('');
                      if (stockGrid.length === 0) fetchStockGrid();
                      setShowCatalogModal(true);
                    }}
                    className="h-8 px-2.5 rounded-lg text-xs bg-primary/10 text-primary dark:text-primary-tint border border-primary/20 font-bold hover:bg-primary/20 flex items-center space-x-1.5 transition-colors cursor-pointer"
                  >
                    <span>+ Add Product from Catalog</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                  </button>
                </div>

                {bookedItems.length === 0 ? (
                  <div className="p-3 rounded-xl border border-dashed border-light-border dark:border-dark-border text-center text-xs text-light-text-muted dark:text-dark-text-muted">
                    No items added yet. Tap "+ Add Product from Catalog" above.
                  </div>
                ) : (
                  bookedItems.map((bi, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-xs"
                    >
                      <div>
                        <span className="font-bold text-light-text dark:text-dark-text">{bi.product_name}</span>{' '}
                        <span className="font-mono text-rose-500 dark:text-rose-400 font-bold">[{bi.size}]</span>
                        <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted font-mono mt-0.5">
                          {bi.sku} {bi.quantity > 1 ? `• Qty: ${bi.quantity}` : ''}
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <span className="font-mono font-bold text-light-text dark:text-dark-text">
                          ৳{(bi.selling_price * bi.quantity).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => setBookedItems((prev) => prev.filter((_, i) => i !== idx))}
                          className="text-danger hover:text-danger-hover p-1 rounded-lg hover:bg-danger/10 transition-colors"
                          title="Remove item"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Advance and Charge Fields */}
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-light-border dark:border-dark-border">
                <div>
                  <label className="block text-xs font-semibold text-light-text-muted mb-1">
                    Advance Collected (৳)
                  </label>
                  <input
                    type="number"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    placeholder="0.00"
                    className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-light-text-muted mb-1">
                    Delivery Charge (৳)
                  </label>
                  <input
                    type="number"
                    value={deliveryCharge}
                    onChange={(e) => setDeliveryCharge(e.target.value)}
                    className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border font-mono font-bold"
                  />
                </div>
              </div>

              {parseFloat(advanceAmount || '0') > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-light-text-muted mb-1">
                    Advance Deposited Account (bKash / Bank) *
                  </label>
                  <select
                    value={advanceAccountId || ''}
                    onChange={(e) => setAdvanceAccountId(parseInt(e.target.value, 10))}
                    className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border font-mono font-semibold"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || bookedItems.length === 0}
                className="w-full h-11 rounded-xl bg-primary hover:bg-primary-tint text-on-primary font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md disabled:opacity-50 mt-2"
              >
                {submitting ? (
                  <span>Booking & Transferring Stock...</span>
                ) : (
                  <>
                    <Truck className="w-4 h-4" />
                    <span>Confirm Booking (Stock to With Courier)</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SEARCHABLE PRODUCT CATALOG POP UP (Image 2) */}
      {showCatalogModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-2xl space-y-4 max-h-[90dvh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-base text-light-text dark:text-dark-text">Select Product from Catalog</h3>
                <p className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-0.5">
                  Choose a product variation to add to this courier parcel
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowCatalogModal(false);
                  setCatalogSearch('');
                }}
                className="p-1 rounded-lg hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover text-light-text-muted hover:text-light-text dark:hover:text-dark-text transition-colors"
                aria-label="Close catalog modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input Bar (matching Image 2) */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-light-text-muted dark:text-dark-text-muted" />
              <input
                type="text"
                autoFocus
                value={catalogSearch}
                onChange={(e) => setCatalogSearch(e.target.value)}
                placeholder="Search catalog products..."
                className="w-full h-9 pl-9 pr-8 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text placeholder:text-light-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {catalogSearch && (
                <button
                  type="button"
                  onClick={() => setCatalogSearch('')}
                  className="absolute right-2.5 top-2.5 text-light-text-muted hover:text-light-text text-xs"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Scrollable Product Variations List (matching Image 2) */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {filteredCatalogItems.length === 0 ? (
                <div className="p-8 text-center text-xs text-light-text-muted dark:text-dark-text-muted">
                  {catalogSearch
                    ? `No products match "${catalogSearch}"`
                    : 'No catalog products available in inventory.'}
                </div>
              ) : (
                filteredCatalogItems.map((item) => {
                  const shopQty =
                    item.stocks?.find((s) => s.location_id === activeShop?.id)?.qty ?? 0;
                  return (
                    <div
                      key={item.variation_id}
                      onClick={() => handleSelectCatalogProduct(item)}
                      className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary cursor-pointer flex items-center justify-between transition-colors group"
                    >
                      <div>
                        <div className="font-bold text-xs text-light-text dark:text-dark-text group-hover:text-primary dark:group-hover:text-primary-tint transition-colors">
                          {item.product_name}
                        </div>
                        <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted font-mono mt-0.5">
                          {sizeLabel(item.size, sizesOn) && (
                            <>
                              Size:{' '}
                              <span className="font-bold text-rose-500 dark:text-rose-400">
                                {sizeLabel(item.size, sizesOn)}
                              </span>{' '}
                              |{' '}
                            </>
                          )}
                          {item.sku}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-xs text-light-text dark:text-dark-text">
                          ৳{Number(item.selling_price || 0).toFixed(2)}
                        </div>
                        <div
                          className={`text-[10px] font-bold ${
                            shopQty > 0
                              ? 'text-emerald-500 dark:text-emerald-400'
                              : 'text-rose-500 dark:text-rose-400'
                          }`}
                        >
                          {shopQty} in shop
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* UPDATE DELIVERY STATUS MODAL */}
      {updatingParcel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <div>
                <h3 className="font-bold text-sm">Update Delivery Status</h3>
                <span className="font-mono text-xs text-primary">{updatingParcel.parcel_code}</span>
              </div>
              <button
                type="button"
                onClick={() => setUpdatingParcel(null)}
                className="p-1 rounded-lg text-light-text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Delivery Status
                </label>
                <select
                  value={newDeliveryStatus}
                  onChange={(e) => setNewDeliveryStatus(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border font-bold"
                >
                  <option value="delivered">Delivered (Record sale revenue on delivery)</option>
                  <option value="returned">Returned (Return stock to shop)</option>
                  <option value="in_transit">In Transit</option>
                  <option value="lost">Lost (Abnormal stock loss)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Delivery Notes / Reason
                </label>
                <input
                  type="text"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder="e.g. Delivered and cash collected by Steadfast..."
                  className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border"
                />
              </div>

              {newDeliveryStatus === 'delivered' && (
                <div className="p-2.5 rounded-xl bg-success/10 text-[10px] text-success-text-light dark:text-success space-y-0.5">
                  <div className="font-bold">Accounting Rule 5.2 Verification:</div>
                  <div>• Sale revenue & COGS are recorded at delivery.</div>
                  <div>• Cash is NOT added; Dr Courier Receivable is posted.</div>
                </div>
              )}

              <button
                type="button"
                disabled={submitting}
                onClick={handleUpdateDeliveryStatus}
                className="w-full h-11 rounded-xl bg-primary text-on-primary font-bold text-xs flex items-center justify-center space-x-1.5 shadow-md disabled:opacity-50"
              >
                {submitting ? 'Updating...' : 'Save Delivery Status'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
