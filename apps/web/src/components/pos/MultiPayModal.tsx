import React, { useState, useMemo } from 'react';
import { Plus, Trash2, CheckCircle2 } from 'lucide-react';
import type { Account, SalePaymentDto } from '@ar-option/shared-types';
import { Sheet } from '../Sheet';
import { taka } from '../../lib/money';
import type { MultiPayRow } from './types';

interface MultiPayModalProps {
  payableTotal: number;
  usableAccounts: Account[];
  onClose: () => void;
  onSubmit: (payments: SalePaymentDto[], cashTendered?: number, change?: number) => void;
  submitting: boolean;
}

export const MultiPayModal: React.FC<MultiPayModalProps> = ({
  payableTotal,
  usableAccounts,
  onClose,
  onSubmit,
  submitting,
}) => {
  const defaultAccount = usableAccounts[0] || null;

  const [rows, setRows] = useState<MultiPayRow[]>([
    {
      id: 'row-1',
      account_id: defaultAccount ? defaultAccount.id : 0,
      amount: payableTotal,
      reference: '',
    },
  ]);

  const [customerGave, setCustomerGave] = useState<string>('');

  const totalTendered = useMemo(() => {
    return rows.reduce((sum, r) => sum + (typeof r.amount === 'number' ? r.amount : 0), 0);
  }, [rows]);

  const payablePaisa = Math.round(payableTotal * 100);
  const tenderedPaisa = Math.round(totalTendered * 100);
  const diffPaisa = payablePaisa - tenderedPaisa;
  const isBalanced = diffPaisa === 0;

  const cashGaveVal = parseFloat(customerGave) || 0;
  const cashRow = rows.find((r) => {
    const acc = usableAccounts.find((a) => a.id === r.account_id);
    return acc?.payment_method === 'cash';
  });
  const cashAmount = typeof cashRow?.amount === 'number' ? cashRow.amount : 0;
  const changeToReturn = Math.max(0, cashGaveVal - cashAmount);

  const addRow = () => {
    const remaining = Math.max(0, diffPaisa / 100);
    const nextAcc = usableAccounts.find((a) => !rows.some((r) => r.account_id === a.id)) || defaultAccount;
    setRows((prev) => [
      ...prev,
      {
        id: `row-${Date.now()}`,
        account_id: nextAcc?.id ?? 0,
        amount: remaining,
        reference: '',
      },
    ]);
  };

  const updateRow = (id: string, updates: Partial<MultiPayRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  };

  const removeRow = (id: string) => {
    if (rows.length <= 1) return;
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  const handleFinish = () => {
    if (!isBalanced) return;
    const payments: SalePaymentDto[] = rows.map((r) => ({
      payment_account_id: r.account_id,
      amount: typeof r.amount === 'number' ? r.amount : 0,
      reference_note: r.reference?.trim() || undefined,
    }));
    onSubmit(payments, cashGaveVal > 0 ? cashGaveVal : undefined, changeToReturn > 0 ? changeToReturn : undefined);
  };

  return (
    <Sheet
      title="MultiPay - Split Payment"
      onClose={onClose}
      testId="multipay-modal"
      footer={
        <div className="flex flex-col gap-2">
          {!isBalanced && (
            <p className="text-xs text-danger text-center font-semibold">
              {diffPaisa > 0
                ? `Remaining to allocate: ${taka(diffPaisa / 100)}`
                : `Over-allocated by: ${taka(Math.abs(diffPaisa) / 100)}`}
            </p>
          )}
          <button
            type="button"
            disabled={!isBalanced || submitting}
            onClick={handleFinish}
            data-testid="complete-multipay-button"
            className="w-full h-12 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-5 h-5" />
            {submitting ? 'Processing Sale...' : `Complete Sale (${taka(payableTotal)})`}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Payable vs Tendered Summary */}
        <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border">
          <div>
            <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Payable Total</span>
            <div className="text-xl font-extrabold font-mono text-primary dark:text-primary-tint">
              {taka(payableTotal)}
            </div>
          </div>
          <div>
            <span className="text-xs text-light-text-muted dark:text-dark-text-muted">Allocated Tendered</span>
            <div
              className={`text-xl font-extrabold font-mono ${
                isBalanced ? 'text-success-text-light dark:text-success' : 'text-danger'
              }`}
            >
              {taka(totalTendered)}
            </div>
          </div>
        </div>

        {/* Payment Rows */}
        <div className="space-y-3">
          <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
            Payment Breakdown
          </label>
          {rows.map((row, idx) => (
            <div
              key={row.id}
              data-testid="multipay-row"
              className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-light-text-muted">Method {idx + 1}</span>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(row.id)}
                    className="text-danger hover:text-danger-hover text-xs flex items-center gap-1"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <select
                    value={row.account_id}
                    onChange={(e) => updateRow(row.id, { account_id: Number(e.target.value) })}
                    className="w-full h-11 px-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-xs font-semibold"
                  >
                    {usableAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.payment_method?.toUpperCase() || 'CASH'})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    placeholder="Amount (৳)"
                    value={row.amount === '' ? '' : row.amount}
                    onChange={(e) =>
                      updateRow(row.id, {
                        amount: e.target.value === '' ? '' : parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-full h-11 px-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-sm font-mono font-bold text-right"
                  />
                </div>
              </div>

              <div>
                <input
                  type="text"
                  placeholder="Optional reference / TrxID / card info"
                  value={row.reference || ''}
                  onChange={(e) => updateRow(row.id, { reference: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-xs"
                />
              </div>
            </div>
          ))}

          {rows.length < usableAccounts.length && (
            <button
              type="button"
              onClick={addRow}
              className="w-full h-10 rounded-xl border border-dashed border-light-border dark:border-dark-border text-xs font-semibold text-primary dark:text-primary-tint hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Another Payment Method</span>
            </button>
          )}
        </div>

        {/* Cash Tendered & Change calculator (Display only, per agent.md) */}
        {cashRow && (
          <div className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover space-y-2">
            <span className="block text-xs font-bold text-light-text-muted">Cash Tendered & Change (Display Only)</span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="multipay-cust-gave" className="block text-[11px] text-light-text-muted mb-1">
                  Customer Gave (৳)
                </label>
                <input
                  id="multipay-cust-gave"
                  type="number"
                  inputMode="decimal"
                  placeholder={String(cashAmount)}
                  value={customerGave}
                  onChange={(e) => setCustomerGave(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-sm font-mono font-bold"
                />
              </div>
              <div>
                <span className="block text-[11px] text-light-text-muted mb-1">Change to Return</span>
                <div
                  className="h-10 px-3 flex items-center rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border font-mono font-bold text-success-text-light dark:text-success text-sm"
                  data-testid="multipay-change"
                >
                  {taka(changeToReturn)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
};
