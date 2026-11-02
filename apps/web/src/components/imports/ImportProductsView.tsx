import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import type {
  ImportCommitResult,
  ImportPreview,
  ImportRowAction,
  ImportRowResult,
  Shop,
} from '@ar-option/shared-types';
import { apiFetch } from '../../lib/api';
import { downloadBlob, ImportFileError, readImportFile, templateCsv } from '../../lib/importFile';

interface ImportProductsViewProps {
  apiUrl: string;
  activeShop: Shop | null;
  onClose: () => void;
  /** Called after a successful import, so the stock screen can refresh. */
  onImported: () => void;
}

type Filter = 'all' | ImportRowAction | 'stock';

const BADGES: Record<ImportRowAction, { label: string; className: string }> = {
  new_product: { label: 'New Product', className: 'bg-success/10 text-success-text-light dark:text-success border-success/30' },
  new_size: { label: 'New Size', className: 'bg-info/10 text-info-text-light dark:text-info-text-dark border-info/30' },
  update: { label: 'Update', className: 'bg-warning/10 text-warning-text-light dark:text-warning border-warning/30' },
  unchanged: { label: 'Unchanged', className: 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted dark:text-dark-text-muted border-light-border dark:border-dark-border' },
  error: { label: 'Error', className: 'bg-danger/10 text-danger-text-light dark:text-danger border-danger/30' },
};

const button =
  'min-h-[44px] px-4 rounded-xl text-sm font-semibold flex items-center justify-center space-x-1.5 border border-light-border dark:border-dark-border bg-light-surface-hover dark:bg-dark-surface-hover disabled:opacity-50';

const newRef = () => `import-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const ImportProductsView: React.FC<ImportProductsViewProps> = ({ apiUrl, activeShop, onClose, onImported }) => {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportCommitResult | null>(null);
  const [busy, setBusy] = useState<'reading' | 'importing' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<string>(newRef());

  const reset = () => {
    setFile(null);
    setRows([]);
    setPreview(null);
    setResult(null);
    setError(null);
    setFilter('all');
    setSearch('');
    clientRef.current = newRef();
    if (inputRef.current) inputRef.current.value = '';
  };

  const post = async (path: string, body: object) => {
    const res = await apiFetch(`${apiUrl}/imports/products/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 413) throw new Error('The file is too large. Split it into smaller parts.');
      throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'The import failed.');
    }
    return data;
  };

  const handleFile = async (picked: File) => {
    reset();
    setFile(picked);
    setBusy('reading');
    try {
      const parsed = await readImportFile(picked);
      setRows(parsed);
      setPreview(await post('preview', { rows: parsed, file_name: picked.name, active_shop_id: activeShop?.id ?? null }));
    } catch (err: any) {
      setError(err instanceof ImportFileError ? err.message : err.message || 'Could not read the file.');
      setFile(null);
    } finally {
      setBusy(null);
    }
  };

  const handleImport = async () => {
    if (!file || !preview || preview.totals.errors > 0) return;
    setBusy('importing');
    setError(null);
    try {
      setResult(
        await post('commit', {
          rows,
          file_name: file.name,
          active_shop_id: activeShop?.id ?? null,
          client_ref: clientRef.current,
        })
      );
      onImported();
    } catch (err: any) {
      // The file stays loaded, and the same reference makes a retry safe.
      setError(err.message || 'The import failed.');
    } finally {
      setBusy(null);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const res = await apiFetch(`${apiUrl}/imports/products/export`);
      if (!res.ok) throw new Error(`Export failed (HTTP ${res.status}).`);
      downloadBlob(await res.text(), `catalog_export_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    } catch (err: any) {
      setError(err.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  };

  const visible = useMemo(() => {
    if (!preview) return [];
    const q = search.trim().toLowerCase();
    return preview.rows.filter((r) => {
      if (filter === 'stock' ? r.add_stock <= 0 : filter !== 'all' && r.action !== filter) return false;
      return !q || [r.product_name, r.size, r.sku, r.category, r.message].some((v) => v.toLowerCase().includes(q));
    });
  }, [preview, filter, search]);

  const totals = preview?.totals;
  const hasErrors = (totals?.errors ?? 0) > 0;

  const tiles: { id: Filter; label: string; value: string | number; tone: string }[] = totals
    ? [
        { id: 'new_product', label: 'New Products', value: totals.new_products, tone: 'text-success-text-light dark:text-success' },
        { id: 'new_size', label: 'New Sizes', value: totals.new_sizes, tone: 'text-info-text-light dark:text-info-text-dark' },
        { id: 'update', label: 'Updated', value: totals.updated, tone: 'text-warning-text-light dark:text-warning' },
        { id: 'unchanged', label: 'Unchanged', value: totals.unchanged, tone: '' },
        { id: 'stock', label: '+Stock Pcs', value: `+${totals.stock_added}`, tone: 'text-success-text-light dark:text-success' },
        { id: 'error', label: 'Errors', value: totals.errors, tone: totals.errors > 0 ? 'text-danger-text-light dark:text-danger' : 'text-success-text-light dark:text-success' },
      ]
    : [];

  const badge = (r: ImportRowResult) => (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold border ${BADGES[r.action].className}`}>
      {BADGES[r.action].label}
    </span>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-4 pb-28">
      <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <button type="button" onClick={onClose} aria-label="Back" data-testid="import-back" className="w-11 h-11 flex items-center justify-center rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-bold">Import Products</h2>
            <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
              One row per size. Blank cells keep current values. Add Stock adds to current stock.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" className={button} onClick={() => downloadBlob(templateCsv(), 'catalog_import_template.csv', 'text/csv;charset=utf-8')}>
            <FileSpreadsheet className="w-4 h-4" />
            <span>Download template</span>
          </button>
          <button type="button" className={button} onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            <span>{exporting ? 'Exporting...' : 'Export my products'}</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-light-text-muted dark:text-dark-text-muted px-1">
        {activeShop
          ? `Rows without a Shop add stock to ${activeShop.name}.`
          : 'All shops is selected, so every row that adds stock needs a Shop.'}
      </p>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger-text-light dark:text-danger text-sm flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {result ? (
        <div className="bg-light-surface dark:bg-dark-surface border border-success/30 p-6 rounded-2xl space-y-5 text-center" role="status">
          <CheckCircle2 className="w-10 h-10 mx-auto text-success" />
          <div>
            <h3 className="text-xl font-bold">Catalog imported</h3>
            <p className="text-sm text-light-text-muted dark:text-dark-text-muted">
              {result.totals.total_rows} rows saved. Stock In document{' '}
              <span className="font-mono font-bold">{result.batch_no}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              ['New Products', result.totals.new_products],
              ['New Sizes', result.totals.new_sizes],
              ['Updated', result.totals.updated],
              ['+Stock Pcs', `+${result.totals.stock_added}`],
            ].map(([l, v]) => (
              <div key={l} className="p-3 rounded-xl border border-light-border dark:border-dark-border">
                <div className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">{l}</div>
                <div className="text-2xl font-extrabold font-mono">{v}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button type="button" className={button} onClick={reset}>Import Another File</button>
            <button type="button" onClick={onClose} className="min-h-[48px] px-5 rounded-xl text-sm font-bold bg-primary hover:bg-primary-hover text-on-primary">
              View in Stock
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const dropped = e.dataTransfer.files?.[0];
              if (dropped) handleFile(dropped);
            }}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center bg-light-surface dark:bg-dark-surface ${dragging ? 'border-primary' : 'border-light-border dark:border-dark-border'}`}
          >
            <input
              ref={inputRef}
              type="file"
              data-testid="import-file"
              accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) handleFile(picked);
              }}
            />
            {file && !error ? (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-left">
                <div className="flex items-center space-x-3 min-w-0">
                  <FileSpreadsheet className="w-6 h-6 flex-shrink-0 text-primary dark:text-primary-tint" />
                  <div className="min-w-0">
                    <div className="text-sm font-bold break-all">{file.name}</div>
                    <div className="text-xs text-light-text-muted dark:text-dark-text-muted">{rows.length} data rows</div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button type="button" className={button} onClick={() => inputRef.current?.click()}>Change file</button>
                  <button type="button" className={button} onClick={reset} aria-label="Remove file"><X className="w-4 h-4" /></button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <UploadCloud className="w-8 h-8 mx-auto text-primary dark:text-primary-tint" />
                <div>
                  <h3 className="text-sm font-bold">Drag and drop your CSV or Excel file here</h3>
                  <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">Accepts .csv (UTF-8) and .xlsx. Up to 2,000 rows.</p>
                </div>
                <button type="button" onClick={() => inputRef.current?.click()} className="min-h-[48px] px-5 rounded-xl text-sm font-bold bg-primary hover:bg-primary-hover text-on-primary">
                  Browse Local File
                </button>
              </div>
            )}
          </div>

          {busy === 'reading' && (
            <div role="status" className="p-6 rounded-2xl border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface flex items-center justify-center space-x-3 text-sm">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Checking SKUs, prices and stock...</span>
            </div>
          )}

          {preview && totals && busy !== 'reading' && (
            <div className="bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border rounded-2xl p-4 sm:p-5 space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                {tiles.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    aria-pressed={filter === t.id}
                    onClick={() => setFilter(filter === t.id ? 'all' : t.id)}
                    className={`p-3 rounded-xl border text-left min-h-[44px] ${filter === t.id ? 'border-primary ring-1 ring-primary' : 'border-light-border dark:border-dark-border'}`}
                  >
                    <div className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">{t.label}</div>
                    <div className={`text-xl font-extrabold font-mono ${t.tone}`}>{t.value}</div>
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-light-text-muted" />
                <input
                  type="text"
                  aria-label="Search preview rows"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search preview rows..."
                  className="w-full h-11 pl-9 pr-3 rounded-xl text-sm bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              {visible.length === 0 ? (
                <div className="p-8 text-center text-sm text-light-text-muted dark:text-dark-text-muted">No rows match.</div>
              ) : (
                <>
                  {/* Phone: one card per row */}
                  <ul className="md:hidden space-y-2" aria-label="Preview rows">
                    {visible.map((r) => (
                      <li key={r.row} className={`p-3 rounded-xl border ${r.action === 'error' ? 'border-danger/40 bg-danger/5' : 'border-light-border dark:border-dark-border'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-sm font-bold break-words">{r.product_name || '—'}</div>
                            <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
                              Row {r.row} · Size {r.size || 'Standard'}{r.sku ? ` · ${r.sku}` : ''}
                            </div>
                          </div>
                          {badge(r)}
                        </div>
                        <p className={`text-xs mt-2 ${r.action === 'error' ? 'text-danger-text-light dark:text-danger font-semibold' : 'text-light-text-muted dark:text-dark-text-muted'}`}>{r.message}</p>
                      </li>
                    ))}
                  </ul>

                  {/* Tablet and wider: a table that scrolls inside its card */}
                  <div className="hidden md:block border border-light-border dark:border-dark-border rounded-xl max-h-[420px] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-light-surface-hover dark:bg-dark-surface-hover text-xs text-light-text-muted dark:text-dark-text-muted sticky top-0">
                        <tr>
                          <th className="p-3 w-14 text-center">Row</th>
                          <th className="p-3">Product Name</th>
                          <th className="p-3">Size</th>
                          <th className="p-3">SKU</th>
                          <th className="p-3">Category</th>
                          <th className="p-3 text-right">Selling</th>
                          <th className="p-3 text-right">+Stock</th>
                          <th className="p-3">Status</th>
                          <th className="p-3">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-light-border dark:divide-dark-border">
                        {visible.map((r) => (
                          <tr key={r.row} className={r.action === 'error' ? 'bg-danger/5' : ''}>
                            <td className="p-3 text-center font-mono text-light-text-muted">{r.row}</td>
                            <td className="p-3 font-semibold">{r.product_name || '—'}</td>
                            <td className="p-3 font-mono">{r.size || 'Standard'}</td>
                            <td className="p-3 font-mono text-light-text-muted dark:text-dark-text-muted">{r.sku || <em>Auto</em>}</td>
                            <td className="p-3">{r.category || '—'}</td>
                            <td className="p-3 text-right font-mono">{r.selling_price ? `৳${r.selling_price}` : '—'}</td>
                            <td className="p-3 text-right font-mono">{r.add_stock > 0 ? `+${r.add_stock}` : '—'}</td>
                            <td className="p-3">{badge(r)}</td>
                            <td className={`p-3 text-xs ${r.action === 'error' ? 'text-danger-text-light dark:text-danger font-semibold' : 'text-light-text-muted dark:text-dark-text-muted'}`}>{r.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}

      {preview && totals && !result && busy !== 'reading' && (
        <div
          className="fixed bottom-0 left-0 right-0 z-20 md:static bg-light-surface dark:bg-dark-surface md:bg-transparent border-t md:border-0 border-light-border dark:border-dark-border p-3 md:p-0 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3"
          style={{ paddingBottom: 'max(12px, var(--safe-bottom))' }}
        >
          <p role="status" className={`text-sm font-semibold ${hasErrors ? 'text-danger-text-light dark:text-danger' : 'text-success-text-light dark:text-success'}`}>
            {hasErrors
              ? `Import is off because ${totals.errors} row${totals.errors === 1 ? ' has an error' : 's have errors'}. Fix the file and choose it again.`
              : `All ${totals.total_rows} rows passed and are ready to import.`}
          </p>
          <button
            type="button"
            disabled={hasErrors || busy === 'importing'}
            onClick={handleImport}
            className="min-h-[48px] px-6 rounded-xl text-sm font-bold bg-primary hover:bg-primary-hover text-on-primary disabled:opacity-50"
          >
            {busy === 'importing' ? 'Importing...' : `Import ${totals.total_rows} Rows Now`}
          </button>
        </div>
      )}
    </div>
  );
};
