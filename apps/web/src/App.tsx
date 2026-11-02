import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Server,
  Database,
  Scale,
  PlusCircle,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ShoppingCart,
  RotateCcw,
  Truck,
  Banknote,
  Package,
  DollarSign,
  ArrowLeftRight,
} from 'lucide-react';
import { TopBar } from './components/TopBar';
import { BottomTabs } from './components/BottomTabs';
import { Sidebar } from './components/Sidebar';
import { TransfersView } from './components/TransfersView';
import { ShopsView } from './components/ShopsView';
import { StockGridView } from './components/StockGridView';
import { UsersView } from './components/UsersView';
import { PosView } from './components/PosView';
import { ExpensesView } from './components/ExpensesView';
import { ReturnsView } from './components/ReturnsView';
import { CourierView } from './components/CourierView';
import { TillView } from './components/till/TillView';
import { CashInHandCard } from './components/till/CashInHandCard';
import { LoginView } from './components/LoginView';
import { ProductFormView } from './components/products/ProductFormView';
import { ImportProductsView } from './components/imports/ImportProductsView';
import { DataTableExample } from './components/pagination/DataTableExample';
import { apiFetch, getToken, setToken, SESSION_EXPIRED_EVENT } from './lib/api';
import { readStored, writeStored } from './lib/storage';
import type {
  HealthResponse,
  Shop,
  TrialBalanceItem,
  Account,
  DashboardKpis,
  AuthResponse,
  User,
} from '@ar-option/shared-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const THEME_KEY = 'ar_option_theme';
const SHOP_KEY = 'ar_option_shop';

const startsDark = (): boolean => {
  const saved = readStored(THEME_KEY);
  if (saved) return saved === 'dark';
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
};

type Session = Pick<AuthResponse, 'user' | 'permissions'>;

interface AppShellProps {
  session: Session;
  onSignOut: () => void;
}

const AppShell: React.FC<AppShellProps> = ({ session, onSignOut }) => {
  const { user, permissions } = session;
  const isAdmin = user.role === 'admin';

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [shops, setShops] = useState<Shop[]>([]);
  const [activeShop, setActiveShop] = useState<Shop | null>(null);
  const [activeTab, setActiveTab] = useState<string>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get('tab') || 'dashboard';
    } catch {
      return 'dashboard';
    }
  });
  const [inner, setInner] = useState<{ kind: 'product-form'; id: number | null } | { kind: 'import' } | null>(null);
  const [stockVersion, setStockVersion] = useState<number>(0);
  const productFormDirty = useRef<boolean>(false);
  const [darkMode, setDarkMode] = useState<boolean>(startsDark);

  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dashboardKpis, setDashboardKpis] = useState<DashboardKpis | null>(null);
  const [trialBalance, setTrialBalance] = useState<{
    items: TrialBalanceItem[];
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
  } | null>(null);

  // Form state for posting entry
  const [entryType, setEntryType] = useState<string>('sale');
  const [debitCode, setDebitCode] = useState<string>('');
  const [creditCode, setCreditCode] = useState<string>('');
  const [amount, setAmount] = useState<string>('');
  const [posting, setPosting] = useState<boolean>(false);
  const [postFeedback, setPostFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const apiUrl = API_URL;

  // Follows the device on first use. A manual choice persists on this device.
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const toggleTheme = () => {
    const next = !darkMode;
    writeStored(THEME_KEY, next ? 'dark' : 'light');
    setDarkMode(next);
  };

  // The inner screen takes one history entry, so the Android back gesture closes it first.
  const openInner = (next: NonNullable<typeof inner>) => {
    window.history.pushState({ layer: next.kind }, '');
    setInner(next);
  };
  const openProductForm = (id: number | null) => openInner({ kind: 'product-form', id });

  const handleProductDirty = useCallback((dirty: boolean) => {
    productFormDirty.current = dirty;
  }, []);

  useEffect(() => {
    if (activeTab !== 'products') setInner(null);
  }, [activeTab]);

  const closeInner = () => {
    if (productFormDirty.current && !window.confirm('Leave without saving? Your changes will be lost.')) return;
    productFormDirty.current = false;
    window.history.back();
  };

  useEffect(() => {
    const handlePop = () => {
      // A sheet closing leaves the inner screen's own history entry on top. Only that entry closes the screen.
      if (window.history.state?.layer) return;
      if (productFormDirty.current && !window.confirm('Leave without saving? Your changes will be lost.')) {
        window.history.pushState({ layer: 'product-form' }, '');
        return;
      }
      productFormDirty.current = false;
      setInner(null);
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  const selectShop = (shop: Shop | null) => {
    writeStored(SHOP_KEY, shop ? String(shop.id) : null);
    setActiveShop(shop);
  };

  // Fetch Shops
  const fetchShops = useCallback(() => {
    apiFetch(`${apiUrl}/shops`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: Shop[]) => {
        const allowedIds = user.assigned_shops?.map((s) => s.id) ?? [];
        const usable = isAdmin ? data : data.filter((s) => allowedIds.includes(s.id));
        setShops(usable);

        // Rule 1: a shop is never guessed. Only a remembered choice or a user's only shop applies.
        setActiveShop((current) => {
          if (current) return current;
          const savedId = Number(readStored(SHOP_KEY));
          const saved = usable.find((s) => s.id === savedId);
          if (saved) return saved;
          return !isAdmin && usable.length === 1 ? usable[0] : null;
        });
      })
      .catch(() => {});
  }, [apiUrl, isAdmin, user.assigned_shops]);

  // Fetch Trial Balance
  const fetchTrialBalance = useCallback(
    (shopId?: number) => {
      const url = shopId
        ? `${apiUrl}/ledger/trial-balance?shop_id=${shopId}`
        : `${apiUrl}/ledger/trial-balance`;
      apiFetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .then((tb) => {
          if (tb) setTrialBalance(tb);
        })
        .catch(() => {});
    },
    [apiUrl]
  );

  // Fetch KPIs
  const fetchDashboardKpis = useCallback(
    (shopId?: number) => {
      const url = shopId
        ? `${apiUrl}/reports/dashboard-kpis?shop_id=${shopId}`
        : `${apiUrl}/reports/dashboard-kpis`;
      apiFetch(url)
        .then((res) => (res.ok ? res.json() : null))
        .then((kpis) => {
          if (kpis) setDashboardKpis(kpis);
        })
        .catch(() => {});
    },
    [apiUrl]
  );

  // Fetch Accounts for active shop
  const fetchAccounts = useCallback(
    (shopId?: number) => {
      const url = shopId
        ? `${apiUrl}/ledger/accounts?shop_id=${shopId}`
        : `${apiUrl}/ledger/accounts`;
      apiFetch(url)
        .then((res) => (res.ok ? res.json() : []))
        .then((data: Account[]) => {
          setAccounts(data);
          if (data.length >= 2) {
            const cashOrAsset = data.find((a) => a.type === 'asset');
            const revOrExpense = data.find(
              (a) => a.type === 'revenue' || a.type === 'expense'
            );
            if (cashOrAsset) setDebitCode(cashOrAsset.code);
            if (revOrExpense) setCreditCode(revOrExpense.code);
          }
        })
        .catch(() => {});
    },
    [apiUrl]
  );

  // Fetch health & shops initially
  useEffect(() => {
    let isMounted = true;

    apiFetch(`${apiUrl}/health`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        return res.json();
      })
      .then((data: HealthResponse) => {
        if (isMounted) {
          setHealth(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    fetchShops();

    return () => {
      isMounted = false;
    };
  }, [apiUrl, fetchShops]);

  // When activeShop changes, re-fetch TB, accounts, and KPIs
  useEffect(() => {
    fetchTrialBalance(activeShop?.id);
    fetchAccounts(activeShop?.id);
    fetchDashboardKpis(activeShop?.id);
  }, [activeShop, fetchTrialBalance, fetchAccounts, fetchDashboardKpis]);

  // Handle post entry
  const handlePostEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setPostFeedback(null);

    if (!activeShop) {
      setPostFeedback({
        type: 'error',
        message:
          'Rule 1: Every write requires a shop. Please select a shop from the top bar before posting.',
      });
      return;
    }

    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      setPostFeedback({
        type: 'error',
        message: 'Amount must be greater than zero.',
      });
      return;
    }

    if (!debitCode || !creditCode) {
      setPostFeedback({
        type: 'error',
        message: 'Both Debit and Credit accounts must be selected.',
      });
      return;
    }

    setPosting(true);
    try {
      const res = await apiFetch(`${apiUrl}/ledger/entries`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shop-Id': activeShop.id.toString(),
        },
        body: JSON.stringify({
          entry_type: entryType,
          client_ref: `web-${Date.now()}`,
          lines: [
            { account_code: debitCode, direction: 'debit', amount: numAmount },
            {
              account_code: creditCode,
              direction: 'credit',
              amount: numAmount,
            },
          ],
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Failed to post transaction.');
      }

      setPostFeedback({
        type: 'success',
        message: `Entry posted successfully! ID: ${data.entry_id.substring(0, 8)}... (${data.lines_posted} lines)`,
      });
      setAmount('');
      fetchTrialBalance(activeShop.id);
      fetchDashboardKpis(activeShop.id);
    } catch (err: any) {
      setPostFeedback({
        type: 'error',
        message: err.message || 'Failed to post entry.',
      });
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="min-h-screen bg-light-bg dark:bg-dark-bg text-light-text dark:text-dark-text flex flex-col antialiased">
      <TopBar
        title="AR Option"
        shops={shops}
        activeShop={activeShop}
        onSelectShop={selectShop}
        darkMode={darkMode}
        onToggleTheme={toggleTheme}
        isAdmin={isAdmin}
        userName={user.name}
        onSignOut={onSignOut}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />

        {activeTab === 'pos' ? (
          <main className="flex-1 overflow-hidden">
            <PosView
              activeShop={activeShop}
              apiUrl={apiUrl}
              onExit={() => setActiveTab('dashboard')}
              onSaleCompleted={() => {
                fetchTrialBalance(activeShop?.id);
                fetchDashboardKpis(activeShop?.id);
              }}
            />
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 space-y-6 max-w-7xl mx-auto w-full">
            {/* Header banner with active shop indicator */}
            <div className="bg-light-surface dark:bg-dark-surface p-4 md:p-6 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-primary/10 text-primary dark:text-primary-tint">
                    {activeShop ? `Active Shop: ${activeShop.name}` : 'Company-Wide (All Shops)'}
                  </span>
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    Rule 1: Every record belongs to a shop
                  </span>
                </div>
                <h2 className="text-lg md:text-xl font-bold mt-1">Multi-Shop POS, Stock & Ledger</h2>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                  Daily Screens: POS Terminal, Shop Expenses, Size Stock & Bulk Import
                </p>
              </div>

              <div className="flex items-center space-x-3">
                <div className="flex items-center space-x-2 bg-light-surface-hover dark:bg-dark-surface-hover px-3 py-1.5 rounded-xl border border-light-border dark:border-dark-border">
                  <Server className="w-4 h-4 text-light-text-muted dark:text-dark-text-muted" />
                  <span className="text-xs font-semibold" data-testid="api-status">
                    {loading ? 'Checking...' : error ? 'Offline' : `API: ${health?.status}`}
                  </span>
                </div>
                <div className="flex items-center space-x-2 bg-light-surface-hover dark:bg-dark-surface-hover px-3 py-1.5 rounded-xl border border-light-border dark:border-dark-border">
                  <Database className="w-4 h-4 text-light-text-muted dark:text-dark-text-muted" />
                  <span className="text-xs font-semibold" data-testid="migration-number">
                    {loading ? '...' : `v${health?.migration ?? 0}`}
                  </span>
                </div>
              </div>
            </div>

            {/* Tab 1: POS is handled above */}

            {/* Tab: Return & Exchange (Step 4) */}
            {activeTab === 'returns' && (
              <ReturnsView
                activeShop={activeShop}
                apiUrl={apiUrl}
                onReturnCompleted={() => {
                  fetchTrialBalance(activeShop?.id);
                  fetchDashboardKpis(activeShop?.id);
                }}
              />
            )}

            {/* Tab: Courier & Settlement (Step 5) */}
            {activeTab === 'courier' && (
              <CourierView
                activeShop={activeShop}
                apiUrl={apiUrl}
                onSettlementCompleted={() => {
                  fetchTrialBalance(activeShop?.id);
                  fetchDashboardKpis(activeShop?.id);
                }}
              />
            )}

            {/* Tab: Till (open, cash in and out, close and handover, closing history) */}
            {activeTab === 'cash-closing' && (
              <TillView
                activeShop={activeShop}
                apiUrl={apiUrl}
                permissions={permissions}
                onChanged={() => {
                  fetchTrialBalance(activeShop?.id);
                  fetchDashboardKpis(activeShop?.id);
                }}
              />
            )}

            {/* Tab 2: Products & Stock Grid */}
            {activeTab === 'products' && inner?.kind === 'import' && (
              <ImportProductsView
                apiUrl={apiUrl}
                activeShop={activeShop}
                onClose={closeInner}
                onImported={() => {
                  setStockVersion((v) => v + 1);
                  fetchDashboardKpis(activeShop?.id);
                  fetchTrialBalance(activeShop?.id);
                }}
              />
            )}
            {activeTab === 'products' && inner?.kind === 'product-form' && (
              <ProductFormView
                apiUrl={apiUrl}
                productId={inner.id}
                shops={shops}
                onClose={closeInner}
                onDirtyChange={handleProductDirty}
                onSaved={() => {
                  productFormDirty.current = false;
                  setStockVersion((v) => v + 1);
                  fetchDashboardKpis(activeShop?.id);
                  fetchTrialBalance(activeShop?.id);
                  window.history.back();
                }}
              />
            )}
            {activeTab === 'products' && !inner && (
              <StockGridView
                key={stockVersion}
                apiUrl={apiUrl}
                canManage={permissions.includes('products.manage')}
                canImport={permissions.includes('products.import')}
                onImport={() => openInner({ kind: 'import' })}
                onAddProduct={() => openProductForm(null)}
                onEditProduct={openProductForm}
              />
            )}

            {/* Tab 3: Daily Expenses */}
            {activeTab === 'expenses' && (
              <ExpensesView
                activeShop={activeShop}
                apiUrl={apiUrl}
                onExpenseAdded={() => {
                  fetchTrialBalance(activeShop?.id);
                  fetchDashboardKpis(activeShop?.id);
                }}
              />
            )}

            {/* Tab 4: Transfers */}
            {activeTab === 'transfers' && (
              <TransfersView activeShop={activeShop} shops={shops} apiUrl={apiUrl} />
            )}

            {/* Tab 5: Users & User-to-Shop Mapping */}
            {activeTab === 'users' && (
              <UsersView apiUrl={apiUrl} shops={shops} />
            )}

            {/* Tab 6: Shop Management */}
            {activeTab === 'settings' && (
              <ShopsView shops={shops} onRefreshShops={fetchShops} apiUrl={apiUrl} />
            )}

            {/* Tab 7: Pagination & Data Table Queue Demo */}
            {activeTab === 'pagination-demo' && (
              <DataTableExample />
            )}

          {/* Default Tab: Dashboard & Ledger (activeTab === 'dashboard' || activeTab === 'ledger') */}
          {(activeTab === 'dashboard' || activeTab === 'ledger') && (
            <>
              {/* KPI Row (Section 5.4: Shop-level reporting in SQL, numbers first, tabular figures) */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
                <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
                  <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
                    {activeShop ? 'Shop Status' : 'Active Shops'}
                  </span>
                  <div className="text-xl md:text-2xl font-extrabold mt-1 font-mono">
                    {activeShop ? activeShop.code : `${dashboardKpis?.total_shops ?? shops.length} Shops`}
                  </div>
                </div>

                <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
                  <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
                    Stock Value (Cost)
                  </span>
                  <div className="text-xl md:text-2xl font-extrabold mt-1 font-mono text-primary dark:text-primary-tint">
                    ৳{(dashboardKpis?.stock_value ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </div>

                <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
                  <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
                    Transfers In Transit
                  </span>
                  <div className="text-xl md:text-2xl font-extrabold mt-1 font-mono text-warning">
                    {dashboardKpis?.pending_transfers ?? 0}
                  </div>
                </div>

                <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
                  <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
                    Trial Balance
                  </span>
                  <div
                    className={`text-xl md:text-2xl font-extrabold mt-1 font-mono ${
                      trialBalance?.isBalanced !== false ? 'text-success' : 'text-danger'
                    }`}
                  >
                    {trialBalance?.isBalanced !== false ? 'Balanced' : 'Unbalanced'}
                  </div>
                </div>
              </div>

              {permissions.includes('till.view') && (
                <CashInHandCard
                  activeShop={activeShop}
                  apiUrl={apiUrl}
                  refreshKey={dashboardKpis}
                  onOpenTill={() => setActiveTab('cash-closing')}
                />
              )}

              {/* Quick Actions Grid for Fast Navigation on all devices */}
              <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-2xl border border-light-border dark:border-dark-border shadow-sm space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-xs uppercase tracking-wider text-light-text-muted dark:text-dark-text-muted">
                    Daily Operations Quick Launch
                  </h3>
                  <span className="text-[10px] text-primary dark:text-primary-tint font-bold">
                    Active: {activeShop?.name || 'All Shops'}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                  <button
                    type="button"
                    data-testid="quick-nav-pos"
                    onClick={() => setActiveTab('pos')}
                    className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary flex flex-col items-center justify-center space-y-1 transition-all"
                  >
                    <ShoppingCart className="w-5 h-5 text-primary dark:text-primary-tint" />
                    <span className="text-xs font-bold">Sell / POS</span>
                  </button>
                  <button
                    type="button"
                    data-testid="quick-nav-returns"
                    onClick={() => setActiveTab('returns')}
                    className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary flex flex-col items-center justify-center space-y-1 transition-all"
                  >
                    <RotateCcw className="w-5 h-5 text-primary dark:text-primary-tint" />
                    <span className="text-xs font-bold">Return/Swap</span>
                  </button>
                  <button
                    type="button"
                    data-testid="quick-nav-courier"
                    onClick={() => setActiveTab('courier')}
                    className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary flex flex-col items-center justify-center space-y-1 transition-all"
                  >
                    <Truck className="w-5 h-5 text-primary dark:text-primary-tint" />
                    <span className="text-xs font-bold">Courier</span>
                  </button>
                  <button
                    type="button"
                    data-testid="quick-nav-cash-closing"
                    onClick={() => setActiveTab('cash-closing')}
                    className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary flex flex-col items-center justify-center space-y-1 transition-all"
                  >
                    <Banknote className="w-5 h-5 text-primary dark:text-primary-tint" />
                    <span className="text-xs font-bold">Till</span>
                  </button>
                  <button
                    type="button"
                    data-testid="quick-nav-products"
                    onClick={() => setActiveTab('products')}
                    className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary flex flex-col items-center justify-center space-y-1 transition-all"
                  >
                    <Package className="w-5 h-5 text-primary dark:text-primary-tint" />
                    <span className="text-xs font-bold">Stock Grid</span>
                  </button>
                  <button
                    type="button"
                    data-testid="quick-nav-expenses"
                    onClick={() => setActiveTab('expenses')}
                    className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary flex flex-col items-center justify-center space-y-1 transition-all"
                  >
                    <DollarSign className="w-5 h-5 text-primary dark:text-primary-tint" />
                    <span className="text-xs font-bold">Expenses</span>
                  </button>
                  <button
                    type="button"
                    data-testid="quick-nav-transfers"
                    onClick={() => setActiveTab('transfers')}
                    className="p-3 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary flex flex-col items-center justify-center space-y-1 transition-all"
                  >
                    <ArrowLeftRight className="w-5 h-5 text-primary dark:text-primary-tint" />
                    <span className="text-xs font-bold">Transfers</span>
                  </button>
                </div>
              </div>

              {/* Interactive Ledger Posting Card (Prove Rule 1 & Rule 3) */}
              {permissions.includes('ledger.post') && (
              <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <PlusCircle className="w-5 h-5 text-primary dark:text-primary-tint" />
                    <h3 className="font-bold text-sm md:text-base">Record Balanced Ledger Entry</h3>
                  </div>
                  <span className="text-xs text-light-text-muted dark:text-dark-text-muted">
                    Rule 3: One Posting Function
                  </span>
                </div>

                {postFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center space-x-2 ${
                      postFeedback.type === 'success'
                        ? 'bg-success/10 text-success-text-light dark:text-success'
                        : 'bg-danger/10 text-danger-text-light dark:text-danger'
                    }`}
                  >
                    {postFeedback.type === 'success' ? (
                      <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span>{postFeedback.message}</span>
                  </div>
                )}

                <form onSubmit={handlePostEntry} className="grid grid-cols-1 md:grid-cols-5 gap-3 md:gap-4 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                      Entry Type
                    </label>
                    <select
                      value={entryType}
                      onChange={(e) => setEntryType(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-semibold"
                    >
                      <option value="sale">Sale (Revenue)</option>
                      <option value="cogs">COGS Recognition</option>
                      <option value="expense">Operating Expense</option>
                      <option value="advance">Customer Advance</option>
                      <option value="equity">Owner Equity</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                      Debit Account (Dr)
                    </label>
                    <select
                      value={debitCode}
                      onChange={(e) => setDebitCode(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
                    >
                      <option value="">Select Account</option>
                      {accounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} - {a.name} ({a.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                      Credit Account (Cr)
                    </label>
                    <select
                      value={creditCode}
                      onChange={(e) => setCreditCode(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
                    >
                      <option value="">Select Account</option>
                      {accounts.map((a) => (
                        <option key={a.code} value={a.code}>
                          {a.code} - {a.name} ({a.type})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                      Amount (৳)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      placeholder="e.g. 500"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl text-xs font-mono bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
                    />
                  </div>

                  <div>
                    <button
                      type="submit"
                      disabled={posting}
                      className="w-full h-11 px-4 rounded-xl text-xs font-bold bg-primary text-on-primary hover:bg-primary-hover transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center space-x-1.5"
                    >
                      {posting ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <PlusCircle className="w-4 h-4" />
                          <span>Post Balanced Entry</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
              )}

              {/* Ledger & Trial Balance Live Table */}
              <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-4 md:p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Scale className="w-5 h-5 text-primary dark:text-primary-tint" />
                    <h3 className="font-bold text-sm md:text-base">Ledger Source of Truth (Trial Balance)</h3>
                  </div>
                  <span className="text-xs font-mono text-light-text-muted dark:text-dark-text-muted">
                    Rule 3: Ledger is source of truth
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs font-sans">
                    <thead>
                      <tr className="border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider">
                        <th className="py-2.5 px-3 font-semibold">Account Code</th>
                        <th className="py-2.5 px-3 font-semibold">Account Name</th>
                        <th className="py-2.5 px-3 font-semibold">Type</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Debit (৳)</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Credit (৳)</th>
                        <th className="py-2.5 px-3 font-semibold text-right">Net Balance (৳)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-light-border dark:divide-dark-border font-mono">
                      {trialBalance?.items && trialBalance.items.length > 0 ? (
                        trialBalance.items.map((acc) => (
                          <tr key={acc.account_code} className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover">
                            <td className="py-2.5 px-3 font-semibold text-primary dark:text-primary-tint">{acc.account_code}</td>
                            <td className="py-2.5 px-3 font-sans font-medium">{acc.account_name}</td>
                            <td className="py-2.5 px-3 uppercase text-[10px]">{acc.account_type}</td>
                            <td className="py-2.5 px-3 text-right">{acc.total_debit > 0 ? acc.total_debit.toFixed(2) : '-'}</td>
                            <td className="py-2.5 px-3 text-right">{acc.total_credit > 0 ? acc.total_credit.toFixed(2) : '-'}</td>
                            <td className="py-2.5 px-3 text-right font-bold">{acc.net_balance.toFixed(2)}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-6 text-center text-light-text-muted dark:text-dark-text-muted font-sans">
                            No ledger entries posted yet. Ready to record sales, returns, and expenses.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
        )}
      </div>

      <BottomTabs activeTab={activeTab} onSelectTab={setActiveTab} />
    </div>
  );
};

/** Decides between the login screen and the app. An expired session keeps the app mounted. */
export const App: React.FC = () => {
  const [session, setSession] = useState<Session | null>(null);
  const [expired, setExpired] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(() => getToken() !== null);

  useEffect(() => {
    if (!getToken()) return;
    let isMounted = true;

    apiFetch(`${API_URL}/auth/me`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user: User; permissions: string[] } | null) => {
        if (!isMounted) return;
        if (data) {
          setSession(data);
        } else {
          setToken(null);
        }
      })
      .catch(() => {
        if (isMounted) setToken(null);
      })
      .finally(() => {
        if (isMounted) setChecking(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleExpired = () => setExpired(true);
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, []);

  const handleSignedIn = ({ token, user, permissions }: AuthResponse) => {
    setToken(token);
    setSession({ user, permissions });
    setExpired(false);
  };

  const handleSignOut = () => {
    setToken(null);
    setSession(null);
    setExpired(false);
  };

  if (checking) {
    return <div className="min-h-screen bg-light-bg dark:bg-dark-bg" aria-busy="true" />;
  }

  return (
    <>
      {session && <AppShell session={session} onSignOut={handleSignOut} />}
      {(!session || expired) && (
        <LoginView
          apiUrl={API_URL}
          expiredEmail={expired ? session?.user.email : undefined}
          onSignedIn={handleSignedIn}
        />
      )}
    </>
  );
};

export default App;
