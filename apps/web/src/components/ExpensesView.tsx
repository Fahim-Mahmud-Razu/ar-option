import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  PlusCircle,
  AlertCircle,
  CheckCircle2,
  Filter,
  Calendar,
  Building,
  Tag,
  CreditCard,
  FileText,
  X,
} from 'lucide-react';
import type { Shop, Expense, ExpenseCategory, Account } from '@ar-option/shared-types';
import { apiFetch } from '../lib/api';

interface ExpensesViewProps {
  activeShop: Shop | null;
  apiUrl: string;
  onExpenseAdded?: () => void;
}

export const ExpensesView: React.FC<ExpensesViewProps> = ({
  activeShop,
  apiUrl,
  onExpenseAdded,
}) => {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [loading, setLoading] = useState<boolean>(true);
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Form State
  const [amount, setAmount] = useState<string>('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [paymentAccountId, setPaymentAccountId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  // Fetch Categories
  const fetchCategories = useCallback(async () => {
    try {
      const res = await apiFetch(`${apiUrl}/expenses/categories`);
      if (res.ok) {
        const data: ExpenseCategory[] = await res.json();
        setCategories(data);
        if (data.length > 0 && !categoryId) {
          setCategoryId(String(data[0].id));
        }
      }
    } catch {
      // ignore
    }
  }, [apiUrl, categoryId]);

  // Fetch Accounts for active shop
  const fetchAccounts = useCallback(
    async (shopId: number) => {
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
    },
    [apiUrl]
  );

  // Fetch Expenses
  const fetchExpenses = useCallback(async () => {
    try {
      setLoading(true);
      const url = new URL(`${apiUrl}/expenses`);
      if (activeShop) {
        url.searchParams.set('shop_id', String(activeShop.id));
      }
      if (selectedCategoryId !== 'all') {
        url.searchParams.set('category_id', selectedCategoryId);
      }

      const res = await apiFetch(url.toString());
      if (res.ok) {
        const data: Expense[] = await res.json();
        setExpenses(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [apiUrl, activeShop, selectedCategoryId]);

  useEffect(() => {
    fetchCategories();
    if (activeShop) {
      fetchAccounts(activeShop.id);
    }
    fetchExpenses();
  }, [activeShop, fetchCategories, fetchAccounts, fetchExpenses]);

  // Handle Create Expense
  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!activeShop) {
      setFeedback({
        type: 'error',
        message: 'Rule 1: Shop required. Please select a shop before recording expenses.',
      });
      return;
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setFeedback({ type: 'error', message: 'Amount must be greater than zero.' });
      return;
    }

    if (!categoryId) {
      setFeedback({ type: 'error', message: 'Please select an expense category.' });
      return;
    }

    if (!paymentAccountId) {
      setFeedback({ type: 'error', message: 'Please select a payment account.' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(`${apiUrl}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Id': String(activeShop.id),
        },
        body: JSON.stringify({
          category_id: parseInt(categoryId, 10),
          amount: numAmount,
          payment_account_id: paymentAccountId,
          notes: description.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Expense recording failed: ${res.statusText}`);
      }

      setFeedback({
        type: 'success',
        message: `Expense of ৳${numAmount.toFixed(2)} recorded successfully and posted to ledger!`,
      });
      setAmount('');
      setDescription('');
      setShowAddModal(false);
      fetchExpenses();
      if (onExpenseAdded) onExpenseAdded();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to record expense' });
    } finally {
      setSubmitting(false);
    }
  };

  const totalExpenseAmount = expenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-light-surface dark:bg-dark-surface p-4 md:p-6 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <DollarSign className="w-6 h-6 text-primary dark:text-primary-tint" />
            <h2 className="text-lg md:text-xl font-bold">Shop Daily Expenses</h2>
          </div>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
            Shop-linked expenses automatically post Dr Operating Expense & Cr Shop Cash
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="h-11 px-4 rounded-xl bg-primary hover:bg-primary-tint text-on-primary font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-colors self-start md:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>Record New Expense</span>
        </button>
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

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
        <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
          <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
            Total Spent ({activeShop?.name || 'All Shops'})
          </span>
          <div className="text-xl md:text-2xl font-extrabold text-danger mt-1 font-mono">
            ৳{totalExpenseAmount.toFixed(2)}
          </div>
        </div>

        <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
          <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
            Transactions Count
          </span>
          <div className="text-xl md:text-2xl font-extrabold mt-1 font-mono">
            {expenses.length}
          </div>
        </div>

        <div className="col-span-2 md:col-span-1 bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
          <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
            Active Shop
          </span>
          <div className="text-base md:text-lg font-bold mt-1 text-primary dark:text-primary-tint truncate">
            {activeShop ? `${activeShop.name} (${activeShop.code})` : 'All Shops'}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex items-center space-x-3 bg-light-surface dark:bg-dark-surface p-3 rounded-xl border border-light-border dark:border-dark-border">
        <Filter className="w-4 h-4 text-light-text-muted" />
        <span className="text-xs font-semibold text-light-text-muted">Category:</span>
        <select
          value={selectedCategoryId}
          onChange={(e) => setSelectedCategoryId(e.target.value)}
          className="h-9 px-3 rounded-lg text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-semibold"
        >
          <option value="all">All Categories</option>
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Expenses Table */}
      <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border shadow-sm overflow-hidden">
        <div className="p-4 border-b border-light-border dark:border-dark-border flex items-center justify-between">
          <h3 className="font-bold text-sm">Expense History</h3>
          <span className="text-xs text-light-text-muted">Rule 1: Shop-stamped writes</span>
        </div>

        {loading ? (
          <div className="p-8 text-center text-xs text-light-text-muted">
            Loading expenses...
          </div>
        ) : expenses.length === 0 ? (
          <div className="p-8 text-center text-xs text-light-text-muted">
            No expenses recorded for this filter. Tap "Record New Expense" above.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider">
                  <th className="py-3 px-4 font-semibold">Date & Ref</th>
                  <th className="py-3 px-4 font-semibold">Shop</th>
                  <th className="py-3 px-4 font-semibold">Category</th>
                  <th className="py-3 px-4 font-semibold">Notes</th>
                  <th className="py-3 px-4 font-semibold">Paid Via</th>
                  <th className="py-3 px-4 font-semibold text-right">Amount (৳)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-border dark:divide-dark-border">
                {expenses.map((exp) => (
                  <tr
                    key={exp.id}
                    className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
                  >
                    <td className="py-3 px-4">
                      <div className="font-mono font-bold text-primary dark:text-primary-tint">
                        {exp.ref_no || `EXP-${String(exp.id).padStart(5, '0')}`}
                      </div>
                      <div className="text-[10px] text-light-text-muted flex items-center space-x-1 mt-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>{new Date(exp.created_at).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="font-semibold">{exp.shop_name}</span>
                      <span className="text-[10px] font-mono text-light-text-muted block">
                        {exp.shop_code}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/10 text-primary dark:text-primary-tint border border-primary/20">
                        <Tag className="w-3 h-3" />
                        <span>{exp.category_name}</span>
                      </span>
                    </td>
                    <td className="py-3 px-4 max-w-xs truncate">
                      {exp.notes || <span className="text-light-text-muted italic">None</span>}
                    </td>
                    <td className="py-3 px-4 font-mono text-light-text-muted">
                      {exp.payment_account_name || 'Shop Cash'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-extrabold text-danger text-sm">
                      ৳{exp.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* RECORD EXPENSE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-light-border dark:border-dark-border pb-3">
              <div className="flex items-center space-x-2">
                <DollarSign className="w-5 h-5 text-primary" />
                <h3 className="font-bold text-base">Record Daily Expense</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover text-light-text-muted"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Shop (Rule 1 Enforcement)
                </label>
                <div className="h-10 px-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border flex items-center space-x-2 text-xs font-bold text-primary dark:text-primary-tint">
                  <Building className="w-4 h-4" />
                  <span>{activeShop ? `${activeShop.name} (${activeShop.code})` : 'Select Shop'}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Expense Category *
                </label>
                <select
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-semibold"
                >
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Amount (৳) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full h-10 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Paid From Account (Shop Cash) *
                </label>
                <div className="relative">
                  <CreditCard className="w-4 h-4 absolute left-3 top-3 text-light-text-muted" />
                  <select
                    value={paymentAccountId || ''}
                    onChange={(e) => setPaymentAccountId(parseInt(e.target.value, 10))}
                    className="w-full h-10 pl-9 pr-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border font-mono font-semibold"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-light-text-muted mb-1">
                  Description / Note
                </label>
                <div className="relative">
                  <FileText className="w-4 h-4 absolute left-3 top-3 text-light-text-muted" />
                  <input
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="e.g. Tea & snacks for staff, Shopping bags, Electricity..."
                    className="w-full h-10 pl-9 pr-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border"
                  />
                </div>
              </div>

              <div className="p-3 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-[11px] text-light-text-muted space-y-1">
                <span className="font-bold text-light-text dark:text-dark-text block">
                  Accounting Double-Entry Preview:
                </span>
                <div>Dr Operating Expenses: ৳{parseFloat(amount || '0').toFixed(2)}</div>
                <div>Cr Payment Account: ৳{parseFloat(amount || '0').toFixed(2)}</div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full h-12 rounded-xl bg-primary hover:bg-primary-tint text-on-primary font-bold text-xs flex items-center justify-center space-x-2 shadow-md disabled:opacity-50"
              >
                {submitting ? (
                  <span>Recording & Posting...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Post Expense to Ledger</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
