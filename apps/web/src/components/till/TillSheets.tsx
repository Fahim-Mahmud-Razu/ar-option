import React, { useMemo, useRef, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import type { CloseTillDto, ExpenseCategory, OpenTillDto, TillMovementDto, TillStatus } from '@ar-option/shared-types';
import { apiFetch } from '../../lib/api';
import { newClientRef, taka } from '../../lib/money';
import { Sheet } from '../Sheet';

interface BaseProps {
  apiUrl: string;
  shopId: number;
  onClose: () => void;
  onDone: (status: TillStatus) => void;
}

const inputClass =
  'w-full h-11 px-3 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-base';
const labelClass = 'block text-xs font-semibold mb-1';
const primaryButton =
  'w-full h-12 rounded-xl bg-primary text-on-primary font-bold text-sm disabled:opacity-50 flex items-center justify-center';

/** Sends one till write. The same client_ref is reused if the person taps again after an error. */
function useTillPost<T>(apiUrl: string, shopId: number, path: string, prefix: string, onDone: (s: TillStatus) => void) {
  const ref = useRef(newClientRef(prefix));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (body: Omit<T, 'client_ref'>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiUrl}/till/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Shop-Id': String(shopId) },
        body: JSON.stringify({ ...body, client_ref: ref.current }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Could not save.');
      onDone(data as TillStatus);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return { send, busy, error };
}

const ErrorLine: React.FC<{ message: string | null }> = ({ message }) =>
  message ? (
    <div role="alert" className="flex items-start gap-2 p-3 rounded-xl text-xs bg-danger/10 text-danger-text-light dark:text-danger border border-danger/20">
      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>{message}</span>
    </div>
  ) : null;

export const OpenTillSheet: React.FC<BaseProps & { status: TillStatus }> = ({ apiUrl, shopId, status, onClose, onDone }) => {
  const [amount, setAmount] = useState(String(status.ledger_cash));
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const { send, busy, error } = useTillPost<OpenTillDto>(apiUrl, shopId, 'open', 'till-open', onDone);

  const value = parseFloat(amount);
  const valid = Number.isFinite(value) && value >= 0;
  const differs = valid && Math.round(value * 100) !== Math.round(status.ledger_cash * 100);
  const needsReason = differs && !status.is_first_open;

  return (
    <Sheet
      title="Open Till"
      onClose={onClose}
      testId="open-till-sheet"
      footer={
        <button
          type="button"
          className={primaryButton}
          disabled={busy || !valid || (needsReason && !reason.trim())}
          onClick={() => send({ opening_float: value, reason: reason.trim() || undefined, note: note.trim() || undefined })}
        >
          {busy ? 'Opening…' : 'Open Till'}
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
          {status.is_first_open
            ? 'This is the first time this shop opens a till. The amount you enter becomes the starting cash in the books.'
            : `The books expect ${taka(status.ledger_cash)} in the drawer. Count it and enter what is really there.`}
        </p>
        <div>
          <label htmlFor="till-float" className={labelClass}>Opening float (৳)</label>
          <input id="till-float" type="number" inputMode="decimal" min="0" step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)} className={`${inputClass} font-mono font-bold`} />
        </div>
        {needsReason && (
          <div>
            <label htmlFor="till-open-reason" className={`${labelClass} text-danger`}>
              Reason for the difference of {taka(value - status.ledger_cash)} (required)
            </label>
            <textarea id="till-open-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 rounded-xl text-base bg-light-surface dark:bg-dark-surface border border-danger" />
          </div>
        )}
        <div>
          <label htmlFor="till-open-note" className={labelClass}>Note (optional)</label>
          <input id="till-open-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </div>
        <ErrorLine message={error} />
      </div>
    </Sheet>
  );
};

interface MovementProps extends BaseProps {
  direction: 'in' | 'out';
  categories: ExpenseCategory[];
  currentCash: number;
}

const OWNER_PULL = 'owner';

export const CashMovementSheet: React.FC<MovementProps> = ({ apiUrl, shopId, direction, categories, currentCash, onClose, onDone }) => {
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState<string>(direction === 'out' ? String(categories[0]?.id ?? OWNER_PULL) : '');
  const [note, setNote] = useState('');
  const { send, busy, error } = useTillPost<TillMovementDto>(apiUrl, shopId, 'movements', 'till-mv', onDone);

  const value = parseFloat(amount);
  const valid = Number.isFinite(value) && value > 0;
  const tooMuch = direction === 'out' && valid && Math.round(value * 100) > Math.round(currentCash * 100);

  const submit = () => {
    if (direction === 'in') return send({ kind: 'pay_in', amount: value, note: note.trim() || undefined });
    if (category === OWNER_PULL) return send({ kind: 'owner_pull', amount: value, note: note.trim() || undefined });
    return send({ kind: 'pay_out', amount: value, category_id: Number(category), note: note.trim() || undefined });
  };

  return (
    <Sheet
      title={direction === 'in' ? 'Cash In' : 'Cash Out'}
      onClose={onClose}
      testId={direction === 'in' ? 'cash-in-sheet' : 'cash-out-sheet'}
      footer={
        <button type="button" className={primaryButton} disabled={busy || !valid || tooMuch || (direction === 'out' && !category)} onClick={submit}>
          {busy ? 'Saving…' : direction === 'in' ? 'Add Cash' : 'Take Cash Out'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="mv-amount" className={labelClass}>Amount (৳)</label>
          <input id="mv-amount" type="number" inputMode="decimal" min="0" step="0.01" value={amount}
            onChange={(e) => setAmount(e.target.value)} className={`${inputClass} font-mono font-bold`} />
          {tooMuch && <p className="text-xs text-danger mt-1">The drawer holds only {taka(currentCash)}.</p>}
        </div>
        {direction === 'out' && (
          <div>
            <label htmlFor="mv-category" className={labelClass}>What is it for?</label>
            <select id="mv-category" value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name} (shop expense)</option>
              ))}
              <option value={OWNER_PULL}>Owner takes cash</option>
            </select>
          </div>
        )}
        <div>
          <label htmlFor="mv-note" className={labelClass}>Note (optional)</label>
          <input id="mv-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </div>
        <ErrorLine message={error} />
      </div>
    </Sheet>
  );
};

const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1];

export const CloseTillSheet: React.FC<BaseProps & { status: TillStatus }> = ({ apiUrl, shopId, status, onClose, onDone }) => {
  const expected = status.ledger_cash;
  const [mode, setMode] = useState<'notes' | 'total'>('notes');
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [direct, setDirect] = useState('');
  const [reason, setReason] = useState('');
  const [handover, setHandover] = useState('');
  const [note, setNote] = useState('');
  const { send, busy, error } = useTillPost<CloseTillDto>(apiUrl, shopId, 'close', 'till-close', onDone);

  const counted = useMemo(() => {
    if (mode === 'total') return parseFloat(direct) || 0;
    return DENOMINATIONS.reduce((sum, d) => sum + d * (parseInt(counts[d] ?? '', 10) || 0), 0);
  }, [mode, counts, direct]);

  const diff = Math.round(counted * 100) - Math.round(expected * 100);
  const handoverValue = parseFloat(handover) || 0;
  const handoverTooBig = Math.round(handoverValue * 100) > Math.round(counted * 100);
  const retained = counted - handoverValue;
  const canFinish = !busy && !handoverTooBig && handoverValue >= 0 && (diff === 0 || reason.trim().length > 0);

  return (
    <Sheet
      title="Close & Handover"
      long
      onClose={onClose}
      testId="close-till-sheet"
      footer={
        <button
          type="button"
          className={primaryButton}
          disabled={!canFinish}
          onClick={() =>
            send({
              counted_cash: counted,
              difference_reason: reason.trim() || undefined,
              handover_amount: handoverValue,
              note: note.trim() || undefined,
            })
          }
        >
          {busy ? 'Closing…' : 'Finish'}
        </button>
      }
    >
      <div className="space-y-5">
        <div className="flex p-1 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-xs w-fit">
          {(['notes', 'total'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`h-9 px-3 rounded-lg font-semibold ${mode === m ? 'bg-primary text-on-primary' : 'text-light-text-muted'}`}>
              {m === 'notes' ? 'Count notes' : 'Enter total'}
            </button>
          ))}
        </div>

        {mode === 'notes' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {DENOMINATIONS.map((d) => {
              const n = parseInt(counts[d] ?? '', 10) || 0;
              return (
                <div key={d} className="p-2.5 rounded-xl border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover">
                  <label htmlFor={`denom-${d}`} className="flex justify-between text-xs font-bold mb-1">
                    <span>৳{d.toLocaleString('en-US')}</span>
                    <span className="font-mono text-light-text-muted">{taka(d * n)}</span>
                  </label>
                  <input id={`denom-${d}`} type="number" inputMode="numeric" min="0" step="1" placeholder="0"
                    value={counts[d] ?? ''} onChange={(e) => setCounts((c) => ({ ...c, [d]: e.target.value }))}
                    className="w-full h-11 px-2.5 rounded-lg bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-right font-mono" />
                </div>
              );
            })}
          </div>
        ) : (
          <div>
            <label htmlFor="close-total" className={labelClass}>Total cash counted (৳)</label>
            <input id="close-total" type="number" inputMode="decimal" min="0" step="0.01" value={direct}
              onChange={(e) => setDirect(e.target.value)} className={`${inputClass} font-mono font-bold`} />
          </div>
        )}

        <dl className="rounded-xl border border-light-border dark:border-dark-border divide-y divide-light-border dark:divide-dark-border text-sm">
          <div className="flex justify-between p-3"><dt className="text-light-text-muted">Counted</dt><dd className="font-mono font-bold" data-testid="close-counted">{taka(counted)}</dd></div>
          <div className="flex justify-between p-3"><dt className="text-light-text-muted">Books expect</dt><dd className="font-mono font-bold">{taka(expected)}</dd></div>
          <div className={`flex justify-between p-3 ${diff === 0 ? 'text-success-text-light dark:text-success' : diff > 0 ? 'text-amber-700 dark:text-amber-400' : 'text-danger'}`}>
            <dt className="font-semibold">{diff === 0 ? 'Exact' : diff > 0 ? 'Over' : 'Short'}</dt>
            <dd className="font-mono font-bold" data-testid="close-difference">{diff === 0 ? taka(0) : `${diff > 0 ? '+' : '-'}${taka(Math.abs(diff) / 100)}`}</dd>
          </div>
        </dl>

        {diff !== 0 && (
          <div>
            <label htmlFor="close-reason" className={`${labelClass} text-danger`}>Reason for the difference (required)</label>
            <textarea id="close-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full p-3 rounded-xl text-base bg-light-surface dark:bg-dark-surface border border-danger" />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="close-handover" className={labelClass}>Cash collected by owner (৳)</label>
            <input id="close-handover" type="number" inputMode="decimal" min="0" step="0.01" value={handover}
              onChange={(e) => setHandover(e.target.value)} className={`${inputClass} font-mono`} />
          </div>
          <div>
            <span className={labelClass}>Retained in till</span>
            <div className="h-11 px-3 flex items-center rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover font-mono font-bold" data-testid="close-retained">
              {handoverTooBig ? '—' : taka(retained)}
            </div>
          </div>
        </div>
        {handoverTooBig && <p className="text-xs text-danger -mt-3">The owner cannot take more than was counted.</p>}

        <div>
          <label htmlFor="close-note" className={labelClass}>Closing notes (optional)</label>
          <input id="close-note" type="text" value={note} onChange={(e) => setNote(e.target.value)} className={inputClass} />
        </div>
        <ErrorLine message={error} />
      </div>
    </Sheet>
  );
};
