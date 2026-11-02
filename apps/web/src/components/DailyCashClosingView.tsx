import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Banknote,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Calculator,
  History,
  RefreshCw,
} from 'lucide-react';
import type {
  Shop,
  CashDrawerSummary,
  DailyCashClosing,
} from '@ar-option/shared-types';

interface DailyCashClosingViewProps {
  activeShop: Shop | null;
  apiUrl: string;
  onClosingCompleted?: () => void;
}

const BD_DENOMINATIONS = [
  { value: 1000, label: '৳1,000' },
  { value: 500, label: '৳500' },
  { value: 200, label: '৳200' },
  { value: 100, label: '৳100' },
  { value: 50, label: '৳50' },
  { value: 20, label: '৳20' },
  { value: 10, label: '৳10' },
];

export const DailyCashClosingView: React.FC<DailyCashClosingViewProps> = ({
  activeShop,
  apiUrl,
  onClosingCompleted,
}) => {
  const [summary, setSummary] = useState<CashDrawerSummary | null>(null);
  const [closings, setClosings] = useState<DailyCashClosing[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reconciliation form state
  const [entryMode, setEntryMode] = useState<'total' | 'denominations'>('denominations');
  const [denominationCounts, setDenominationCounts] = useState<{ [denom: number]: number }>({
    1000: 0,
    500: 0,
    200: 0,
    100: 0,
    50: 0,
    20: 0,
    10: 0,
  });
  const [directPhysicalAmount, setDirectPhysicalAmount] = useState<string>('');
  const [discrepancyReason, setDiscrepancyReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  // Active sub-tab
  const [activeSubTab, setActiveSubTab] = useState<'reconcile' | 'history'>('reconcile');

  // Fetch Drawer Summary from Ledger (Rule 3)
  const fetchDrawerSummary = useCallback(async () => {
    if (!activeShop) return;
    try {
      setLoading(true);
      const res = await fetch(`${apiUrl}/cash-closing/drawer-summary?shop_id=${activeShop.id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to load cash drawer summary.');
      }
      const data: CashDrawerSummary = await res.json();
      setSummary(data);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    } finally {
      setLoading(false);
    }
  }, [apiUrl, activeShop]);

  // Fetch Past Closings History
  const fetchPastClosings = useCallback(async () => {
    try {
      const url = activeShop
        ? `${apiUrl}/cash-closing?shop_id=${activeShop.id}`
        : `${apiUrl}/cash-closing`;
      const res = await fetch(url);
      if (res.ok) {
        const data: DailyCashClosing[] = await res.json();
        setClosings(data);
      }
    } catch {}
  }, [apiUrl, activeShop]);

  useEffect(() => {
    fetchDrawerSummary();
    fetchPastClosings();
  }, [fetchDrawerSummary, fetchPastClosings]);

  // Calculate physical total
  const calculatedPhysicalTotal = useMemo(() => {
    if (entryMode === 'total') {
      return parseFloat(directPhysicalAmount) || 0;
    }
    return Object.entries(denominationCounts).reduce(
      (acc, [val, count]) => acc + parseInt(val, 10) * (count || 0),
      0
    );
  }, [entryMode, denominationCounts, directPhysicalAmount]);

  // Calculate discrepancy
  const systemExpected = summary?.system_expected_cash || 0;
  const discrepancy = calculatedPhysicalTotal - systemExpected;
  const hasDiscrepancy = Math.abs(discrepancy) > 0.01;

  const handleDenominationChange = (val: number, countStr: string) => {
    const count = parseInt(countStr, 10);
    setDenominationCounts((prev) => ({
      ...prev,
      [val]: isNaN(count) || count < 0 ? 0 : count,
    }));
  };

  const handleSaveClosing = async () => {
    if (!activeShop) {
      setFeedback({ type: 'error', message: 'No active shop selected.' });
      return;
    }

    if (hasDiscrepancy && !discrepancyReason.trim()) {
      setFeedback({
        type: 'error',
        message: `Discrepancy of ৳${discrepancy.toFixed(2)} detected. An explanation is mandatory before saving.`,
      });
      return;
    }

    try {
      setSubmitting(true);
      setFeedback(null);

      const res = await fetch(`${apiUrl}/cash-closing`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_id: activeShop.id,
          physical_counted_cash: calculatedPhysicalTotal,
          discrepancy_reason: discrepancyReason.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to submit daily cash closing.');
      }

      const created: DailyCashClosing = await res.json();
      setFeedback({
        type: 'success',
        message: `Daily cash closing for ${activeShop.name} saved successfully (Physical: ৳${created.physical_counted_cash.toFixed(2)}, Discrepancy: ৳${created.discrepancy_amount.toFixed(2)}).`,
      });

      // Reset denomination counts
      setDenominationCounts({ 1000: 0, 500: 0, 200: 0, 100: 0, 50: 0, 20: 0, 10: 0 });
      setDirectPhysicalAmount('');
      setDiscrepancyReason('');
      setNotes('');

      fetchDrawerSummary();
      fetchPastClosings();
      if (onClosingCompleted) onClosingCompleted();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
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
            <Banknote className="w-6 h-6 text-primary dark:text-primary-tint" />
            <h2 className="text-lg md:text-xl font-bold">Daily Cash Closing</h2>
          </div>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
            Step 6 Pilot: Reconcile physical drawer cash against the double-entry system ledger daily (Section 9)
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div className="flex p-1 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-xs">
            <button
              type="button"
              onClick={() => setActiveSubTab('reconcile')}
              className={`px-3 py-1.5 rounded-lg font-bold flex items-center space-x-1.5 transition-colors ${
                activeSubTab === 'reconcile'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-light-text-muted hover:text-light-text'
              }`}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Drawer Count</span>
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
              <span>Closing History</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              fetchDrawerSummary();
              fetchPastClosings();
            }}
            title="Refresh"
            className="p-2 rounded-xl border border-light-border dark:border-dark-border hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover text-light-text-muted"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
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

      {activeSubTab === 'reconcile' ? (
        <div className="space-y-6">
          {/* LEDGER DRAWER BREAKDOWN CARDS */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-light-text-muted dark:text-dark-text-muted">
                Opening Cash
              </span>
              <div className="text-base sm:text-lg font-extrabold font-mono mt-1">
                ৳{(summary?.opening_cash || 0).toFixed(2)}
              </div>
              <span className="text-[10px] text-light-text-muted">At Start of Day</span>
            </div>

            <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                + Cash Sales
              </span>
              <div className="text-base sm:text-lg font-extrabold font-mono mt-1 text-emerald-600 dark:text-emerald-400">
                +৳{(summary?.cash_sales || 0).toFixed(2)}
              </div>
              <span className="text-[10px] text-light-text-muted">Counter POS (Today)</span>
            </div>

            <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                - Cash Refunds
              </span>
              <div className="text-base sm:text-lg font-extrabold font-mono mt-1 text-rose-600 dark:text-rose-400">
                -৳{(summary?.cash_returns || 0).toFixed(2)}
              </div>
              <span className="text-[10px] text-light-text-muted">Returns Settled</span>
            </div>

            <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                - Cash Expenses
              </span>
              <div className="text-base sm:text-lg font-extrabold font-mono mt-1 text-rose-600 dark:text-rose-400">
                -৳{(summary?.cash_expenses || 0).toFixed(2)}
              </div>
              <span className="text-[10px] text-light-text-muted">Shop Petty Cash</span>
            </div>

            <div className="bg-primary/5 dark:bg-primary/10 p-4 rounded-xl border-2 border-primary/30 col-span-2 sm:col-span-1 lg:col-span-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary dark:text-primary-tint">
                System Expected
              </span>
              <div className="text-lg sm:text-xl font-extrabold font-mono mt-1 text-primary dark:text-primary-tint">
                ৳{systemExpected.toFixed(2)}
              </div>
              <span className="text-[10px] text-primary/70 dark:text-primary-tint/70">
                Account: {summary?.cash_account_code || 'Loading...'}
              </span>
            </div>
          </div>

          {/* PHYSICAL CASH COUNTING & RECONCILIATION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* COLUMN 1 & 2: COUNT INPUT */}
            <div className="lg:col-span-2 bg-light-surface dark:bg-dark-surface p-5 rounded-2xl border border-light-border dark:border-dark-border space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-light-border dark:border-dark-border">
                <div>
                  <h3 className="font-bold text-sm">Physical Drawer Cash Count</h3>
                  <p className="text-xs text-light-text-muted">
                    Count notes physically present in the drawer for {activeShop?.name || 'Shop'}.
                  </p>
                </div>
                <div className="flex p-0.5 rounded-lg bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-xs">
                  <button
                    type="button"
                    onClick={() => setEntryMode('denominations')}
                    className={`px-2.5 py-1 rounded-md font-semibold ${
                      entryMode === 'denominations'
                        ? 'bg-primary text-on-primary'
                        : 'text-light-text-muted'
                    }`}
                  >
                    By Denominations
                  </button>
                  <button
                    type="button"
                    onClick={() => setEntryMode('total')}
                    className={`px-2.5 py-1 rounded-md font-semibold ${
                      entryMode === 'total'
                        ? 'bg-primary text-on-primary'
                        : 'text-light-text-muted'
                    }`}
                  >
                    Direct Total
                  </button>
                </div>
              </div>

              {entryMode === 'denominations' ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {BD_DENOMINATIONS.map((d) => {
                    const count = denominationCounts[d.value] || 0;
                    const subtotal = d.value * count;
                    return (
                      <div
                        key={d.value}
                        className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-xs font-bold">
                          <span>{d.label}</span>
                          <span className="font-mono text-light-text-muted">৳{subtotal}</span>
                        </div>
                        <input
                          type="number"
                          min="0"
                          value={count === 0 ? '' : count}
                          placeholder="0 notes"
                          onChange={(e) => handleDenominationChange(d.value, e.target.value)}
                          className="w-full h-9 px-2.5 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-right font-mono text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-semibold">Total Physical Cash Counted (৳)</label>
                  <div className="relative">
                    <DollarSign className="w-5 h-5 absolute left-3 top-3 text-light-text-muted" />
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={directPhysicalAmount}
                      onChange={(e) => setDirectPhysicalAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full h-11 pl-10 pr-3 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border font-mono text-base font-bold"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* COLUMN 3: RECONCILIATION & DISCREPANCY SETTLEMENT */}
            <div className="bg-light-surface dark:bg-dark-surface p-5 rounded-2xl border border-light-border dark:border-dark-border space-y-4">
              <div className="pb-3 border-b border-light-border dark:border-dark-border">
                <h3 className="font-bold text-sm">Reconciliation Result</h3>
                <span className="text-[11px] text-light-text-muted">Physical Count vs Double-Entry Ledger</span>
              </div>

              {/* Physical Count Summary */}
              <div className="flex items-center justify-between text-xs">
                <span className="text-light-text-muted">Total Counted:</span>
                <span className="font-mono font-bold text-sm">৳{calculatedPhysicalTotal.toFixed(2)}</span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-light-text-muted">System Expected:</span>
                <span className="font-mono font-bold text-sm">৳{systemExpected.toFixed(2)}</span>
              </div>

              {/* Prominent Discrepancy Banner */}
              <div
                className={`p-4 rounded-xl border text-center space-y-1 ${
                  !hasDiscrepancy
                    ? 'bg-success/10 border-success text-success-text-light dark:text-success'
                    : discrepancy > 0
                    ? 'bg-amber-500/10 border-amber-500 text-amber-700 dark:text-amber-400'
                    : 'bg-danger/10 border-danger text-danger'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">
                  {!hasDiscrepancy
                    ? 'Exact Balance'
                    : discrepancy > 0
                    ? 'Cash Overage (Surplus)'
                    : 'Cash Shortage (Deficit)'}
                </div>
                <div className="text-2xl font-black font-mono">
                  {!hasDiscrepancy
                    ? '৳0.00'
                    : discrepancy > 0
                    ? `+৳${discrepancy.toFixed(2)}`
                    : `-৳${Math.abs(discrepancy).toFixed(2)}`}
                </div>
                <div className="text-[11px]">
                  {!hasDiscrepancy
                    ? 'Physical cash perfectly matches the double-entry ledger.'
                    : discrepancy > 0
                    ? 'More physical cash than expected in ledger.'
                    : 'Less physical cash than expected in ledger.'}
                </div>
              </div>

              {/* Mandatory Explanation Field when Discrepancy Exists */}
              {hasDiscrepancy && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-danger flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Discrepancy Explanation (Mandatory) *</span>
                  </label>
                  <textarea
                    rows={2}
                    value={discrepancyReason}
                    onChange={(e) => setDiscrepancyReason(e.target.value)}
                    placeholder="Explain reason for shortage or overage..."
                    className="w-full p-2.5 rounded-xl text-xs bg-light-surface dark:bg-dark-surface border border-danger focus:ring-1 focus:ring-danger"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-light-text-muted">Closing Notes (Optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Closing cashier shift..."
                  className="w-full h-9 px-3 rounded-xl text-xs bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveClosing}
                disabled={submitting || (hasDiscrepancy && !discrepancyReason.trim())}
                className="w-full h-11 rounded-xl bg-primary text-on-primary font-bold text-xs shadow-md disabled:opacity-50 transition-opacity flex items-center justify-center space-x-2"
              >
                {submitting ? (
                  <span>Recording Closing...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Submit Daily Cash Closing</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* CLOSING HISTORY TABLE */
        <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border shadow-sm overflow-hidden">
          <div className="p-4 border-b border-light-border dark:border-dark-border flex items-center justify-between">
            <h3 className="font-bold text-sm">Past Daily Cash Closings</h3>
            <span className="text-xs text-light-text-muted">Daily Pilot Reconciliation Audit Trail</span>
          </div>

          {closings.length === 0 ? (
            <div className="p-8 text-center text-xs text-light-text-muted">No daily closings recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider">
                    <th className="py-3 px-4 font-semibold">Date & Shop</th>
                    <th className="py-3 px-4 font-semibold">Cashier</th>
                    <th className="py-3 px-4 font-semibold text-right">Opening (৳)</th>
                    <th className="py-3 px-4 font-semibold text-right">Sales (৳)</th>
                    <th className="py-3 px-4 font-semibold text-right">Expected (৳)</th>
                    <th className="py-3 px-4 font-semibold text-right">Physical (৳)</th>
                    <th className="py-3 px-4 font-semibold text-right">Discrepancy (৳)</th>
                    <th className="py-3 px-4 font-semibold">Explanation / Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-border dark:divide-dark-border">
                  {closings.map((c) => (
                    <tr key={c.id} className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover">
                      <td className="py-3 px-4">
                        <div className="font-bold">{c.closing_date}</div>
                        <div className="text-[10px] text-light-text-muted font-mono">{c.location_name}</div>
                      </td>
                      <td className="py-3 px-4 font-semibold">{c.user_name || 'Admin'}</td>
                      <td className="py-3 px-4 text-right font-mono">৳{c.opening_cash.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono text-emerald-600 dark:text-emerald-400">
                        +৳{c.cash_sales.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        ৳{c.system_expected_cash.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        ৳{c.physical_counted_cash.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold">
                        <span
                          className={
                            Math.abs(c.discrepancy_amount) <= 0.01
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : c.discrepancy_amount > 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-rose-600 dark:text-rose-400'
                          }
                        >
                          {Math.abs(c.discrepancy_amount) <= 0.01
                            ? '৳0.00 (Balanced)'
                            : c.discrepancy_amount > 0
                            ? `+৳${c.discrepancy_amount.toFixed(2)} (Overage)`
                            : `-৳${Math.abs(c.discrepancy_amount).toFixed(2)} (Shortage)`}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-xs text-light-text-muted">
                        {c.discrepancy_reason ? (
                          <div className="text-amber-700 dark:text-amber-400 font-medium">
                            {c.discrepancy_reason}
                          </div>
                        ) : null}
                        {c.notes && <div className="text-[10px] truncate">{c.notes}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
