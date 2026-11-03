import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  Server,
  Database,
  Scale,
} from 'lucide-react';
import { TopBar } from './components/TopBar';
import { BottomTabs } from './components/BottomTabs';
import { Sidebar } from './components/Sidebar';
import { TransfersView } from './components/TransfersView';
import { SettingsView } from './components/SettingsView';
import { StockGridView } from './components/StockGridView';
import { UsersView } from './components/UsersView';
import { PosView } from './components/PosView';
import { ExpensesView } from './components/ExpensesView';
import { ReturnsView } from './components/ReturnsView';
import { CourierView } from './components/CourierView';
import { TillView } from './components/till/TillView';
import { LoginView } from './components/LoginView';
import { ProductFormView } from './components/products/ProductFormView';
import { ImportProductsView } from './components/imports/ImportProductsView';
import { DashboardView } from './components/DashboardView';
import { apiFetch, getToken, setToken, SESSION_EXPIRED_EVENT } from './lib/api';
import { readStored, writeStored } from './lib/storage';
import { SettingsProvider } from './lib/settings';
import type {
  HealthResponse,
  Shop,
  TrialBalanceItem,
  DashboardKpis,
  AuthResponse,
  User,
} from '@ar-option/shared-types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const THEME_KEY = 'ar_option_theme';
const SHOP_KEY = 'ar_option_shop';
const SIDEBAR_COLLAPSED_KEY = 'ar_option_sidebar_collapsed';

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
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    return readStored(SIDEBAR_COLLAPSED_KEY) === 'true';
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      writeStored(SIDEBAR_COLLAPSED_KEY, String(next));
      return next;
    });
  }, []);

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle navigation sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleSidebar]);

  const [dashboardKpis, setDashboardKpis] = useState<DashboardKpis | null>(null);
  const [trialBalance, setTrialBalance] = useState<{
    items: TrialBalanceItem[];
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
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
          // Take the fresh copy, so a renamed shop shows its new name at once.
          if (current) return usable.find((s) => s.id === current.id) ?? current;
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

  // When activeShop changes, re-fetch TB and KPIs
  useEffect(() => {
    fetchTrialBalance(activeShop?.id);
    fetchDashboardKpis(activeShop?.id);
  }, [activeShop, fetchTrialBalance, fetchDashboardKpis]);

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
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={toggleSidebar}
      />

      <div className="flex-1 flex overflow-hidden">
        <Sidebar
          activeTab={activeTab}
          onSelectTab={setActiveTab}
          collapsed={sidebarCollapsed}
          onToggleCollapse={toggleSidebar}
        />

        {activeTab === 'pos' ? (
          <main className="flex-1 overflow-hidden">
            <PosView
              activeShop={activeShop}
              apiUrl={apiUrl}
              permissions={permissions}
              onExit={() => setActiveTab('dashboard')}
              onOpenTill={() => setActiveTab('cash-closing')}
              onSaleCompleted={() => {
                fetchTrialBalance(activeShop?.id);
                fetchDashboardKpis(activeShop?.id);
              }}
            />
          </main>
        ) : (
          <main className="flex-1 overflow-y-auto p-4 md:p-6 pb-20 md:pb-6 space-y-6 max-w-7xl mx-auto w-full">
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

            {/* Settings: sizes, shops, backup and reset */}
            {activeTab === 'settings' && (
              <SettingsView
                apiUrl={apiUrl}
                isAdmin={isAdmin}
                shops={shops}
                onRefreshShops={fetchShops}
                onSignOut={onSignOut}
              />
            )}

            {/* Default Tab: Dashboard */}
            {activeTab === 'dashboard' && (
              <DashboardView
                apiUrl={apiUrl}
                activeShop={activeShop}
                shops={shops}
                dashboardKpis={dashboardKpis}
                onNavigateTab={setActiveTab}
                permissions={permissions}
                onSelectShop={selectShop}
              />
            )}

            {/* Financial Statements (Trial Balance - Rule 3) */}
            {activeTab === 'ledger' && (
            <div className="space-y-6">
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
            </div>
            )}
            {/* Discreet System Status Footer */}
            <footer className="pt-6 pb-2 text-[11px] text-light-text-muted dark:text-dark-text-muted border-t border-light-border/40 dark:border-dark-border/40 flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center space-x-1.5">
                <span className="font-semibold text-light-text dark:text-dark-text">AR Option Retail Ledger</span>
                <span>•</span>
                <span>Multi-branch Retail Operations</span>
              </div>
              <div className="flex items-center space-x-3 font-mono text-[10px]">
                <div className="flex items-center space-x-1 opacity-70 hover:opacity-100 transition-opacity">
                  <Server className="w-3 h-3 text-light-text-muted dark:text-dark-text-muted" />
                  <span data-testid="api-status">
                    {loading ? 'Checking...' : error ? 'Offline' : `API: ${health?.status}`}
                  </span>
                </div>
                <div className="flex items-center space-x-1 opacity-70 hover:opacity-100 transition-opacity">
                  <Database className="w-3 h-3 text-light-text-muted dark:text-dark-text-muted" />
                  <span data-testid="migration-number">
                    {loading ? '...' : `v${health?.migration ?? 0}`}
                  </span>
                </div>
              </div>
            </footer>
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
      {session && (
        <SettingsProvider apiUrl={API_URL}>
          <AppShell session={session} onSignOut={handleSignOut} />
        </SettingsProvider>
      )}
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
