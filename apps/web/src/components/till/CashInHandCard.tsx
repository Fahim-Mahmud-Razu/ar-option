import React, { useEffect, useState } from 'react';
import { Lock, Unlock, Wallet } from 'lucide-react';
import type { Shop, TillOverview } from '@ar-option/shared-types';
import { apiFetch } from '../../lib/api';
import { taka } from '../../lib/money';

interface Props {
  activeShop: Shop | null;
  apiUrl: string;
  /** Changes whenever the dashboard refreshes, so the card reloads with it. */
  refreshKey: unknown;
  onOpenTill: () => void;
}

const Badge: React.FC<{ open: boolean }> = ({ open }) => (
  <span className={`inline-flex items-center gap-1 px-2.5 h-6 rounded-full text-[11px] font-bold ${
    open ? 'bg-success/10 text-success-text-light dark:text-success' : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted'}`}>
    {open ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
    {open ? 'Till Open' : 'Till Closed'}
  </span>
);

export const CashInHandCard: React.FC<Props> = ({ activeShop, apiUrl, refreshKey, onOpenTill }) => {
  const [overview, setOverview] = useState<TillOverview | null>(null);
  const shopId = activeShop?.id;

  useEffect(() => {
    let cancelled = false;
    const url = shopId ? `${apiUrl}/till/overview?shop_id=${shopId}` : `${apiUrl}/till/overview`;
    apiFetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => !cancelled && setOverview(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [apiUrl, shopId, refreshKey]);

  if (!overview) return null;
  const single = overview.shops.length === 1 && !!shopId ? overview.shops[0] : null;

  return (
    <div data-testid="cash-in-hand-card"
      className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
          <Wallet className="w-4 h-4" />Cash in Hand
        </span>
        {single && <Badge open={single.is_open} />}
      </div>

      {single ? (
        <div className="mt-2 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
          <div>
            <div className="text-2xl md:text-3xl font-extrabold font-mono" data-testid="cash-in-hand-figure">{taka(single.cash_in_hand)}</div>
            {single.is_open && (
              <div className="mt-1 text-xs text-light-text-muted dark:text-dark-text-muted flex flex-wrap gap-x-4">
                <span>Opening Float {taka(single.opening_float)}</span>
                <span>Cash Sales {taka(single.cash_sales)}</span>
                <span>Petty Cash {taka(single.petty_cash)}</span>
              </div>
            )}
          </div>
          <button type="button" onClick={onOpenTill}
            className="h-11 px-5 rounded-xl bg-primary text-on-primary font-bold text-sm whitespace-nowrap">
            {single.is_open ? 'View Till' : 'Open Till'}
          </button>
        </div>
      ) : (
        <div className="mt-2">
          <div className="text-2xl md:text-3xl font-extrabold font-mono" data-testid="cash-in-hand-figure">{taka(overview.total_cash)}</div>
          <ul className="mt-2 divide-y divide-light-border dark:divide-dark-border text-sm">
            {overview.shops.map((s) => (
              <li key={s.shop_id} className="py-2 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-semibold">{s.shop_name}</span>
                <span className="flex items-center gap-3">
                  <Badge open={s.is_open} />
                  <span className="font-mono font-semibold">{taka(s.cash_in_hand)}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};
