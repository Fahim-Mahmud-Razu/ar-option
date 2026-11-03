import React, { useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Database, Download, Ruler, Trash2, Upload } from 'lucide-react';
import type { BackupFile, ResetLevel, Shop, SystemResult } from '@ar-option/shared-types';
import { apiFetch } from '../lib/api';
import { useAppSettings } from '../lib/settings';
import { downloadBlob } from '../lib/importFile';
import { ShopsView } from './ShopsView';
import { Sheet } from './Sheet';

interface SettingsViewProps {
  apiUrl: string;
  isAdmin: boolean;
  shops: Shop[];
  onRefreshShops: () => void;
  /** After a restore the users table is replaced, so everyone signs in again. */
  onSignOut: () => void;
}

const card =
  'bg-light-surface dark:bg-dark-surface p-4 md:p-5 rounded-2xl border border-light-border dark:border-dark-border space-y-3';
const secondary =
  'h-11 px-4 rounded-xl text-sm font-semibold bg-light-surface-hover dark:bg-dark-surface-hover hover:bg-light-border/60 dark:hover:bg-dark-border/60 flex items-center justify-center space-x-2 disabled:opacity-50';
const danger =
  'h-11 px-4 rounded-xl text-sm font-bold bg-danger/10 text-danger-text-light dark:text-danger hover:bg-danger/20 flex items-center justify-center space-x-2 disabled:opacity-50';

const RESET_INFO: Record<ResetLevel, { title: string; word: string; deletes: string; keeps: string }> = {
  transactions: {
    title: 'Clear transactions',
    word: 'RESET',
    deletes: 'Every sale, return, courier parcel and settlement, stock count and stock movement, transfer, till session, expense, cash closing, import record and ledger entry. Stock goes to zero in every shop.',
    keeps: 'Products and prices, categories, brands, contacts, shops, users, roles and settings.',
  },
  factory: {
    title: 'Factory reset',
    word: 'FACTORY RESET',
    deletes: 'Everything in Clear transactions, plus every product, category, brand and contact, every shop and its accounts, and every user except you. Expense categories go back to the defaults.',
    keeps: 'Your admin login, the system accounts and locations, roles and settings.',
  },
};

const backupStamp = (iso: string): string => iso.slice(0, 16).replace('T', '-').replace(':', '');

export const SettingsView: React.FC<SettingsViewProps> = ({ apiUrl, isAdmin, shops, onRefreshShops, onSignOut }) => {
  const { settings, refresh } = useAppSettings();
  const [sizesBusy, setSizesBusy] = useState<boolean>(false);
  const [sizesError, setSizesError] = useState<string | null>(null);

  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [backingUp, setBackingUp] = useState<boolean>(false);
  const [restoreFile, setRestoreFile] = useState<{ name: string; text: string; data: BackupFile } | null>(null);
  const [restoring, setRestoring] = useState<boolean>(false);
  const [resetLevel, setResetLevel] = useState<ResetLevel | null>(null);
  const [resetWord, setResetWord] = useState<string>('');
  const [resetting, setResetting] = useState<boolean>(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const toggleSizes = async () => {
    setSizesBusy(true);
    setSizesError(null);
    try {
      const res = await apiFetch(`${apiUrl}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ use_sizes: !settings.use_sizes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not change the setting.');
      await refresh();
    } catch (err: any) {
      setSizesError(err.message || 'Could not change the setting.');
    } finally {
      setSizesBusy(false);
    }
  };

  /** Resolves only once the file has been handed to the browser to save. */
  const downloadBackup = async (): Promise<void> => {
    const res = await apiFetch(`${apiUrl}/system/backup`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.message || 'Could not make the backup.');
    }
    const text = await res.text();
    const createdAt = (JSON.parse(text) as BackupFile).created_at;
    downloadBlob(text, `ar-option-backup-${backupStamp(createdAt)}.json`, 'application/json');
  };

  const handleBackup = async () => {
    setBackingUp(true);
    setNotice(null);
    try {
      await downloadBackup();
      setNotice({ tone: 'ok', text: 'Backup downloaded. Keep the file somewhere safe, off this device.' });
    } catch (err: any) {
      setNotice({ tone: 'error', text: err.message || 'Could not make the backup.' });
    } finally {
      setBackingUp(false);
    }
  };

  const pickRestoreFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setNotice(null);
    try {
      const text = await file.text();
      const data = JSON.parse(text) as BackupFile;
      if (data?.app !== 'ar-option' || typeof data.tables !== 'object') throw new Error();
      setDialogError(null);
      setRestoreFile({ name: file.name, text, data });
    } catch {
      setNotice({ tone: 'error', text: 'That file is not an AR Option backup.' });
    }
  };

  const handleRestore = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setDialogError(null);
    try {
      const res = await apiFetch(`${apiUrl}/system/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: restoreFile.text,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not restore the backup.');
      window.alert('The backup was restored. Sign in again with a user from the backup.');
      onSignOut();
    } catch (err: any) {
      setDialogError(err.message || 'Could not restore the backup.');
    } finally {
      setRestoring(false);
    }
  };

  const openReset = (level: ResetLevel) => {
    setResetLevel(level);
    setResetWord('');
    setDialogError(null);
  };

  const handleReset = async () => {
    if (!resetLevel) return;
    setResetting(true);
    setDialogError(null);
    try {
      // A backup first, every time. Nothing is deleted unless the file was made.
      await downloadBackup();
      const res = await apiFetch(`${apiUrl}/system/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: resetLevel, confirm: resetWord.trim() }),
      });
      const data: SystemResult & { message?: string } = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not reset the data.');
      // Every screen holds data that no longer exists, so start the app again. The pause
      // lets the browser finish saving the backup before the page goes away.
      setTimeout(() => window.location.assign(window.location.pathname), 1500);
    } catch (err: any) {
      setDialogError(err.message || 'Could not reset the data.');
      setResetting(false);
    }
  };

  const restoreCounts = restoreFile
    ? [
        ['Shops', (restoreFile.data.tables.locations || []).filter((r: any) => !r.is_system).length],
        ['Users', (restoreFile.data.tables.users || []).length],
        ['Products', (restoreFile.data.tables.products || []).length],
        ['Sales', (restoreFile.data.tables.sales || []).length],
        ['Ledger lines', (restoreFile.data.tables.account_transactions || []).length],
      ]
    : [];

  const info = resetLevel ? RESET_INFO[resetLevel] : null;

  return (
    <div className="space-y-6">
      <section className={`${card} max-w-3xl`} aria-labelledby="sizes-setting-heading">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="sizes-setting-heading" className="font-bold text-base flex items-center space-x-2">
              <Ruler className="w-5 h-5 text-primary dark:text-primary-tint" />
              <span>Sizes</span>
            </h2>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted mt-1">
              {settings.use_sizes
                ? 'On. A product can have several sizes, each with its own SKU, price and stock.'
                : 'Off. Each product has one price, one code and one stock count. No screen shows a size.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={settings.use_sizes}
            aria-label="Use sizes"
            disabled={!isAdmin || sizesBusy}
            onClick={toggleSizes}
            className={`relative shrink-0 w-14 h-8 rounded-full transition-colors disabled:opacity-60 ${
              settings.use_sizes ? 'bg-primary' : 'bg-light-border dark:bg-dark-border'
            }`}
          >
            <span
              className={`absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                settings.use_sizes ? 'translate-x-6' : ''
              }`}
            />
          </button>
        </div>
        {!isAdmin && <p className="text-xs text-light-text-muted dark:text-dark-text-muted">Only an admin can change this.</p>}
        {sizesError && (
          <div role="alert" className="p-3 rounded-xl bg-danger/10 text-danger-text-light dark:text-danger text-sm flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{sizesError}</span>
          </div>
        )}
      </section>

      <ShopsView shops={shops} onRefreshShops={onRefreshShops} apiUrl={apiUrl} />

      {isAdmin && (
        <section className="space-y-4 max-w-3xl" aria-labelledby="backup-heading">
          <div>
            <h2 id="backup-heading" className="text-lg md:text-xl font-bold flex items-center space-x-2">
              <Database className="w-5 h-5 text-primary dark:text-primary-tint" />
              <span>Backup & Reset</span>
            </h2>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
              Admin only. A backup holds every shop, product, sale and ledger entry in one file.
            </p>
          </div>

          {notice && (
            <div
              role={notice.tone === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-xl text-sm flex items-start space-x-2 border ${
                notice.tone === 'ok'
                  ? 'bg-success/10 border-success/20 text-success-text-light dark:text-success'
                  : 'bg-danger/10 border-danger/20 text-danger-text-light dark:text-danger'
              }`}
            >
              {notice.tone === 'ok' ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
              <span>{notice.text}</span>
            </div>
          )}

          <div className={card}>
            <h3 className="font-bold text-sm">Backup and restore</h3>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
              Download a backup before you test, and restore it to go back to exactly that point. A restore replaces everything in the system.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button type="button" onClick={handleBackup} disabled={backingUp} className={secondary} data-testid="download-backup">
                <Download className="w-4 h-4" />
                <span>{backingUp ? 'Preparing...' : 'Download backup'}</span>
              </button>
              <button type="button" onClick={() => fileInput.current?.click()} className={secondary} data-testid="restore-backup">
                <Upload className="w-4 h-4" />
                <span>Restore from file</span>
              </button>
              <input ref={fileInput} type="file" accept=".json,application/json" className="hidden" onChange={pickRestoreFile} aria-label="Backup file" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(['transactions', 'factory'] as ResetLevel[]).map((level) => (
              <div key={level} className={`${card} flex flex-col`}>
                <h3 className="font-bold text-sm">{RESET_INFO[level].title}</h3>
                <p className="text-sm"><span className="font-semibold">Deletes: </span>{RESET_INFO[level].deletes}</p>
                <p className="text-sm text-light-text-muted dark:text-dark-text-muted"><span className="font-semibold">Keeps: </span>{RESET_INFO[level].keeps}</p>
                <div className="flex-1" />
                <button type="button" onClick={() => openReset(level)} className={danger} data-testid={`reset-${level}`}>
                  <Trash2 className="w-4 h-4" />
                  <span>{RESET_INFO[level].title}</span>
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {restoreFile && (
        <Sheet
          title="Restore backup"
          onClose={() => !restoring && setRestoreFile(null)}
          testId="restore-sheet"
          footer={
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setRestoreFile(null)} disabled={restoring} className={secondary}>Cancel</button>
              <button type="button" onClick={handleRestore} disabled={restoring} className={danger}>
                {restoring ? 'Restoring...' : 'Replace everything'}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <p className="font-mono text-xs break-all text-light-text-muted dark:text-dark-text-muted">{restoreFile.name}</p>
            <p>Made on <span className="font-semibold">{new Date(restoreFile.data.created_at).toLocaleString()}</span>, at database version {restoreFile.data.schema_version}.</p>
            <dl className="grid grid-cols-2 gap-2">
              {restoreCounts.map(([label, n]) => (
                <div key={label as string} className="p-2 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover">
                  <dt className="text-xs text-light-text-muted dark:text-dark-text-muted">{label}</dt>
                  <dd className="font-mono font-bold">{n}</dd>
                </div>
              ))}
            </dl>
            <p className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-warning-text-light dark:text-warning">
              Everything in the system now is replaced by this file, including users and passwords. Everyone signs in again afterwards. Download a backup first if you may want today's data back.
            </p>
            {dialogError && <p role="alert" className="text-danger-text-light dark:text-danger">{dialogError}</p>}
          </div>
        </Sheet>
      )}

      {resetLevel && info && (
        <Sheet
          title={info.title}
          onClose={() => !resetting && setResetLevel(null)}
          testId="reset-sheet"
          footer={
            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={() => setResetLevel(null)} disabled={resetting} className={secondary}>Cancel</button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting || resetWord.trim() !== info.word}
                className={danger}
                data-testid="confirm-reset"
              >
                {resetting ? 'Backing up and resetting...' : info.title}
              </button>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <p><span className="font-semibold">Deletes: </span>{info.deletes}</p>
            <p className="text-light-text-muted dark:text-dark-text-muted"><span className="font-semibold">Keeps: </span>{info.keeps}</p>
            <p className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-warning-text-light dark:text-warning">
              A backup file downloads first, and the reset runs only if that backup was made. It cannot be undone except by restoring that file.
            </p>
            <div>
              <label htmlFor="reset-word" className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1">
                Type <span className="font-mono font-bold">{info.word}</span> to confirm
              </label>
              <input
                id="reset-word"
                type="text"
                autoComplete="off"
                autoCapitalize="characters"
                value={resetWord}
                onChange={(e) => setResetWord(e.target.value)}
                className="w-full h-11 px-3 rounded-xl text-sm font-mono bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>
            {dialogError && <p role="alert" className="text-danger-text-light dark:text-danger">{dialogError}</p>}
          </div>
        </Sheet>
      )}
    </div>
  );
};
