import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Banknote, History, Lock, Minus, Plus, RefreshCw, Unlock } from 'lucide-react';
import type { DailyCashClosing, ExpenseCategory, Shop, TillStatus } from '@ar-option/shared-types';
import { apiFetch } from '../../lib/api';
import { taka } from '../../lib/money';
import { CashMovementSheet, CloseTillSheet, OpenTillSheet } from './TillSheets';

interface TillViewProps {
  activeShop: Shop | null;
  apiUrl: string;
  permissions: string[];
  onChanged?: () => void;
}

type Layer = 'open' | 'in' | 'out' | 'close' | null;

const actionButton =
  'h-12 rounded-xl border border-light-border dark:border-dark-border font-bold text-sm flex items-center justify-center gap-2 hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover';

const KIND_LABEL = { pay_in: 'Cash in', pay_out: 'Cash out', owner_pull: 'Owner took' } as const;

export const TillView: React.FC<TillViewProps> = ({ activeShop, apiUrl, permissions, onChanged }) => {
  const [status, setStatus] = useState<TillStatus | null>(null);
  const [closings, setClosings] = useState<DailyCashClosing[]>([]);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'till' | 'history'>('till');
  const [layer, setLayer] = useState<Layer>(null);

  const shopId = activeShop?.id;
  const can = (key: string) => permissions.includes(key);

  const load = useCallback(async () => {
    if (!shopId) return;
    setLoading(true);
    setError(null);
    try {
      const [s, c, cat] = await Promise.all([
        apiFetch(`${apiUrl}/till/status`, { headers: { 'X-Shop-Id': String(shopId) } }),
        apiFetch(`${apiUrl}/cash-closing?shop_id=${shopId}`),
        apiFetch(`${apiUrl}/expenses/categories`),
      ]);
      if (!s.ok) {
        const body = await s.json().catch(() => ({}));
        throw new Error(body.message || 'Could not load the till.');
      }
      setStatus(await s.json());
      if (c.ok) setClosings(await c.json());
      if (cat.ok) setCategories(await cat.json());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [apiUrl, shopId]);

  useEffect(() => {
    setStatus(null);
    load();
  }, [load]);

  if (!activeShop) {
    return (
      <div className="p-8 text-center text-sm text-light-text-muted dark:text-dark-text-muted rounded-2xl border border-light-border dark:border-dark-border">
        Choose a shop to see its till.
      </div>
    );
  }

  const done = (next: TillStatus) => {
    setStatus(next);
    setLayer(null);
    onChanged?.();
    apiFetch(`${apiUrl}/cash-closing?shop_id=${shopId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rows) => rows && setClosings(rows))
      .catch(() => undefined);
  };

  const session = status?.session ?? null;
  const summary = status?.summary ?? null;

  const rows: Array<[string, number, string?]> = summary
    ? [
        ['Opening Float', summary.opening_float],
        ['Cash Sales', summary.cash_sales],
        ['Pay-Ins', summary.pay_ins],
        ['Petty Cash', -summary.petty_cash],
        ['Refunds', -summary.refunds],
        ['Other Cash', summary.other_cash],
      ]
    : [];

  return (
    <div className="space-y-4">
      <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-2xl border border-light-border dark:border-dark-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Banknote className="w-6 h-6 text-primary dark:text-primary-tint flex-shrink-0" />
            <h2 className="text-lg font-bold">Till</h2>
          </div>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1 truncate">{activeShop.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex p-1 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-xs">
            <button type="button" onClick={() => setTab('till')}
              className={`h-9 px-3 rounded-lg font-bold ${tab === 'till' ? 'bg-primary text-on-primary' : 'text-light-text-muted'}`}>Till</button>
            <button type="button" onClick={() => setTab('history')}
              className={`h-9 px-3 rounded-lg font-bold flex items-center gap-1.5 ${tab === 'history' ? 'bg-primary text-on-primary' : 'text-light-text-muted'}`}>
              <History className="w-3.5 h-3.5" /><span>History</span>
            </button>
          </div>
          <button type="button" onClick={load} aria-label="Refresh"
            className="h-11 w-11 flex items-center justify-center rounded-xl border border-light-border dark:border-dark-border text-light-text-muted">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-center gap-2 p-3 rounded-xl text-xs bg-danger/10 text-danger-text-light dark:text-danger border border-danger/20">
          <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
        </div>
      )}

      {tab === 'till' && status && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
                  {session ? 'Current Cash in Drawer' : 'Cash the books expect'}
                </span>
                <div className="text-3xl font-extrabold font-mono mt-1" data-testid="till-current-cash">
                  {taka(session ? summary!.current_cash : status.ledger_cash)}
                </div>
              </div>
              <span className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-full text-xs font-bold ${
                session ? 'bg-success/10 text-success-text-light dark:text-success' : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted'}`}
                data-testid="till-badge">
                {session ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                {session ? 'Till Open' : 'Till Closed'}
              </span>
            </div>

            {session && summary ? (
              <>
                <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                  Opened {new Date(session.opened_at).toLocaleString()}
                  {session.opened_by_name ? ` by ${session.opened_by_name}` : ''}
                </p>
                <dl className="rounded-xl border border-light-border dark:border-dark-border divide-y divide-light-border dark:divide-dark-border text-sm">
                  {rows.map(([label, amount]) => (
                    <div key={label} className="flex justify-between p-3">
                      <dt className="text-light-text-muted dark:text-dark-text-muted">{label}</dt>
                      <dd className={`font-mono font-semibold ${amount < 0 ? 'text-danger' : ''}`}>{amount < 0 ? `-${taka(-amount)}` : taka(amount)}</dd>
                    </div>
                  ))}
                  <div className="flex justify-between p-3 text-xs">
                    <dt className="text-light-text-muted dark:text-dark-text-muted">Digital / Card (not in the drawer)</dt>
                    <dd className="font-mono">{taka(summary.digital_sales)}</dd>
                  </div>
                </dl>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {can('till.cash_in') && (
                    <button type="button" className={actionButton} onClick={() => setLayer('in')}><Plus className="w-4 h-4" />Cash In</button>
                  )}
                  {can('till.cash_out') && (
                    <button type="button" className={actionButton} onClick={() => setLayer('out')}><Minus className="w-4 h-4" />Cash Out</button>
                  )}
                  {can('till.close') && (
                    <button type="button" className={`${actionButton} bg-primary text-on-primary border-primary hover:bg-primary`} onClick={() => setLayer('close')}>
                      <Lock className="w-4 h-4" />Close & Handover
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
                  {status.is_first_open
                    ? 'This shop has not opened a till yet.'
                    : 'Selling still works while the till is closed, but cash in and out need an open till.'}
                </p>
                {can('till.open') && (
                  <button type="button" className={`${actionButton} w-full sm:w-auto sm:px-8 bg-primary text-on-primary border-primary hover:bg-primary`} onClick={() => setLayer('open')}>
                    <Unlock className="w-4 h-4" />Open Till
                  </button>
                )}
              </>
            )}
          </div>

          <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border p-5">
            <h3 className="font-bold text-sm mb-3">Cash In and Out</h3>
            {status.movements.length === 0 ? (
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">Nothing yet in this session.</p>
            ) : (
              <ul className="divide-y divide-light-border dark:divide-dark-border text-sm">
                {status.movements.map((m) => (
                  <li key={m.id} className="py-2.5 flex justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-semibold">{KIND_LABEL[m.kind]}{m.category_name ? ` · ${m.category_name}` : ''}</div>
                      <div className="text-xs text-light-text-muted dark:text-dark-text-muted truncate">
                        {new Date(m.created_at).toLocaleTimeString()}{m.user_name ? ` · ${m.user_name}` : ''}{m.note ? ` · ${m.note}` : ''}
                      </div>
                    </div>
                    <div className={`font-mono font-semibold ${m.kind === 'pay_in' ? 'text-success-text-light dark:text-success' : 'text-danger'}`}>
                      {m.kind === 'pay_in' ? '+' : '-'}{taka(m.amount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === 'history' && (
        <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border overflow-hidden">
          <div className="p-4 border-b border-light-border dark:border-dark-border font-bold text-sm">Past Closings</div>
          {closings.length === 0 ? (
            <div className="p-8 text-center text-xs text-light-text-muted">No closings yet.</div>
          ) : (
            <>
              <ul className="md:hidden divide-y divide-light-border dark:divide-dark-border">
                {closings.map((c) => (
                  <li key={c.id} className="p-4 text-sm space-y-1">
                    <div className="flex justify-between font-bold"><span>{c.closing_date}</span><span className="font-mono">{taka(c.physical_counted_cash)}</span></div>
                    <div className="text-xs text-light-text-muted">{c.user_name} · Expected {taka(c.system_expected_cash)}</div>
                    <Difference value={c.discrepancy_amount} />
                    {c.discrepancy_reason && <div className="text-xs text-amber-700 dark:text-amber-400">{c.discrepancy_reason}</div>}
                  </li>
                ))}
              </ul>
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-light-border dark:border-dark-border text-light-text-muted uppercase tracking-wider">
                      <th className="py-3 px-4">Date</th><th className="py-3 px-4">Cashier</th>
                      <th className="py-3 px-4 text-right">Float</th><th className="py-3 px-4 text-right">Cash Sales</th>
                      <th className="py-3 px-4 text-right">Expected</th><th className="py-3 px-4 text-right">Counted</th>
                      <th className="py-3 px-4 text-right">Difference</th><th className="py-3 px-4">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-light-border dark:divide-dark-border">
                    {closings.map((c) => (
                      <tr key={c.id}>
                        <td className="py-3 px-4 font-bold">{c.closing_date}</td>
                        <td className="py-3 px-4">{c.user_name}</td>
                        <td className="py-3 px-4 text-right font-mono">{taka(c.opening_cash)}</td>
                        <td className="py-3 px-4 text-right font-mono">{taka(c.cash_sales)}</td>
                        <td className="py-3 px-4 text-right font-mono">{taka(c.system_expected_cash)}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold">{taka(c.physical_counted_cash)}</td>
                        <td className="py-3 px-4 text-right"><Difference value={c.discrepancy_amount} /></td>
                        <td className="py-3 px-4 text-light-text-muted">{c.discrepancy_reason}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {layer === 'open' && status && (
        <OpenTillSheet apiUrl={apiUrl} shopId={activeShop.id} status={status} onClose={() => setLayer(null)} onDone={done} />
      )}
      {(layer === 'in' || layer === 'out') && status && (
        <CashMovementSheet apiUrl={apiUrl} shopId={activeShop.id} direction={layer} categories={categories}
          currentCash={status.ledger_cash} onClose={() => setLayer(null)} onDone={done} />
      )}
      {layer === 'close' && status && (
        <CloseTillSheet apiUrl={apiUrl} shopId={activeShop.id} status={status} onClose={() => setLayer(null)} onDone={done} />
      )}
    </div>
  );
};

const Difference: React.FC<{ value: number }> = ({ value }) => {
  if (Math.abs(value) < 0.005) return <span className="font-mono text-success-text-light dark:text-success">Balanced</span>;
  return (
    <span className={`font-mono font-semibold ${value > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-danger'}`}>
      {value > 0 ? `+${taka(value)} over` : `-${taka(-value)} short`}
    </span>
  );
};
