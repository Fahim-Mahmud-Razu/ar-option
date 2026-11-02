import React, { useState } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Layers,
  Sparkles,
} from 'lucide-react';
import type { Shop, BulkImportProductDto } from '@ar-option/shared-types';

interface ImportProductsViewProps {
  apiUrl: string;
  activeShop: Shop | null;
  onImportComplete?: () => void;
}

export const ImportProductsView: React.FC<ImportProductsViewProps> = ({
  apiUrl,
  activeShop,
  onImportComplete,
}) => {
  const [importMode, setImportMode] = useState<'csv' | 'json'>('csv');
  const [rawText, setRawText] = useState<string>('');
  const [parsedItems, setParsedItems] = useState<BulkImportProductDto[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const sampleCsv = `name,code,category,cost_price,selling_price,sizes
Classic Polo Shirt,POLO-01,Apparel,500,950,M;L;XL
Slim Fit Denim Jeans,JEAN-01,Denim,800,1650,30;32;34
Oxford Cotton Shirt,SHIRT-01,Shirts,650,1200,15.5;16;16.5
Casual Graphic Tee,TEE-01,T-Shirts,350,650,S;M;L;XL`;

  const sampleJson = `[
  {
    "name": "Classic Polo Shirt",
    "code": "POLO-01",
    "category_name": "Apparel",
    "cost_price": 500,
    "selling_price": 950,
    "sizes": ["M", "L", "XL"]
  },
  {
    "name": "Slim Fit Denim Jeans",
    "code": "JEAN-01",
    "category_name": "Denim",
    "cost_price": 800,
    "selling_price": 1650,
    "sizes": ["30", "32", "34"]
  }
]`;

  const loadSample = () => {
    if (importMode === 'csv') {
      setRawText(sampleCsv);
      parseCsv(sampleCsv);
    } else {
      setRawText(sampleJson);
      parseJson(sampleJson);
    }
  };

  const parseCsv = (text: string) => {
    setParseError(null);
    try {
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length < 2) {
        setParsedItems([]);
        return;
      }

      const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
      const items: BulkImportProductDto[] = [];

      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map((p) => p.trim());
        if (parts.length < 2) continue;

        const row: any = {};
        headers.forEach((h, idx) => {
          row[h] = parts[idx];
        });

        const name = row.name;
        const code = row.code;
        const category = row.category || row.category_name || 'Apparel';
        const cost = parseFloat(row.cost_price || row.cost || '0');
        const selling = parseFloat(row.selling_price || row.price || '0');
        const sizesStr = row.sizes || 'Standard';
        const sizes = sizesStr.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 0);

        if (!name || !code) {
          throw new Error(`Line ${i + 1}: Name and Code are required.`);
        }

        items.push({
          name,
          code,
          category_name: category,
          cost_price: isNaN(cost) ? 0 : cost,
          selling_price: isNaN(selling) ? 0 : selling,
          sizes: sizes.length > 0 ? sizes : ['Standard'],
        });
      }

      setParsedItems(items);
    } catch (err: any) {
      setParseError(err.message || 'Invalid CSV format');
      setParsedItems([]);
    }
  };

  const parseJson = (text: string) => {
    setParseError(null);
    try {
      if (!text.trim()) {
        setParsedItems([]);
        return;
      }
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        throw new Error('JSON root must be an array of product items.');
      }
      const items: BulkImportProductDto[] = data.map((d, idx) => {
        if (!d.name || !d.code) {
          throw new Error(`Item ${idx + 1}: name and code are required.`);
        }
        return {
          name: String(d.name),
          code: String(d.code),
          category_name: d.category_name || 'Apparel',
          brand_name: d.brand_name || undefined,
          cost_price: Number(d.cost_price) || 0,
          selling_price: Number(d.selling_price) || 0,
          sizes: Array.isArray(d.sizes) && d.sizes.length > 0 ? d.sizes : ['Standard'],
        };
      });
      setParsedItems(items);
    } catch (err: any) {
      setParseError(err.message || 'Invalid JSON syntax');
      setParsedItems([]);
    }
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setRawText(val);
    if (importMode === 'csv') {
      parseCsv(val);
    } else {
      parseJson(val);
    }
  };

  const handleImport = async () => {
    if (parsedItems.length === 0) {
      setFeedback({ type: 'error', message: 'No valid items to import.' });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch(`${apiUrl}/products/bulk-import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(activeShop ? { 'X-Shop-Id': String(activeShop.id) } : {}),
        },
        body: JSON.stringify({ items: parsedItems }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || `Bulk import failed: ${res.statusText}`);
      }

      const data = await res.json();
      setFeedback({
        type: 'success',
        message: `Successfully imported ${data.imported_count} products and generated variations!`,
      });
      setRawText('');
      setParsedItems([]);
      if (onImportComplete) onImportComplete();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Import failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-light-surface dark:bg-dark-surface p-4 md:p-6 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <UploadCloud className="w-6 h-6 text-primary dark:text-primary-tint" />
            <h2 className="text-lg md:text-xl font-bold">Bulk Product Import</h2>
          </div>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
            Import catalog batches via CSV or JSON with automatic size variations and SKU generation
          </p>
        </div>

        <button
          type="button"
          onClick={loadSample}
          className="h-10 px-3.5 rounded-xl text-xs font-semibold bg-primary/10 text-primary dark:text-primary-tint border border-primary/20 hover:bg-primary/20 flex items-center space-x-1.5 transition-colors self-start sm:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Load Sample Apparel Data</span>
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

      {/* Import Format Switcher */}
      <div className="flex items-center space-x-2 border-b border-light-border dark:border-dark-border pb-2">
        <button
          type="button"
          onClick={() => {
            setImportMode('csv');
            setRawText('');
            setParsedItems([]);
            setParseError(null);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors ${
            importMode === 'csv'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-light-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>CSV Format</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setImportMode('json');
            setRawText('');
            setParsedItems([]);
            setParseError(null);
          }}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center space-x-1.5 transition-colors ${
            importMode === 'json'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-light-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>JSON Array</span>
        </button>
      </div>

      {/* Input Editor */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs font-bold text-light-text-muted dark:text-dark-text-muted">
            Paste {importMode.toUpperCase()} Data:
          </label>
          <span className="text-[11px] text-light-text-muted">
            {importMode === 'csv'
              ? 'Header: name,code,category,cost_price,selling_price,sizes (semicolon separated sizes)'
              : 'Array of objects: [{ name, code, category_name, cost_price, selling_price, sizes }]'}
          </span>
        </div>

        <textarea
          rows={7}
          value={rawText}
          onChange={handleTextChange}
          placeholder={importMode === 'csv' ? sampleCsv : sampleJson}
          className="w-full p-3 rounded-xl font-mono text-xs bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
        />

        {parseError && (
          <div className="text-xs text-danger flex items-center space-x-1">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>{parseError}</span>
          </div>
        )}
      </div>

      {/* Preview Section */}
      {parsedItems.length > 0 && (
        <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border overflow-hidden shadow-sm space-y-3">
          <div className="p-4 border-b border-light-border dark:border-dark-border flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-primary" />
              <h3 className="font-bold text-sm">
                Ready to Import ({parsedItems.length} Products)
              </h3>
            </div>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleImport}
              className="h-10 px-4 rounded-xl bg-primary hover:bg-primary-tint text-on-primary font-bold text-xs flex items-center space-x-1.5 shadow-sm transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Importing...' : 'Confirm & Import All'}</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider">
                  <th className="py-2.5 px-3 font-semibold">Code</th>
                  <th className="py-2.5 px-3 font-semibold">Product Name</th>
                  <th className="py-2.5 px-3 font-semibold">Category</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Cost (৳)</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Selling (৳)</th>
                  <th className="py-2.5 px-3 font-semibold">Sizes & Variations</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-border dark:divide-dark-border font-mono">
                {parsedItems.map((item, idx) => (
                  <tr key={idx} className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover">
                    <td className="py-2.5 px-3 font-bold text-primary dark:text-primary-tint">
                      {item.code}
                    </td>
                    <td className="py-2.5 px-3 font-sans font-medium">{item.name}</td>
                    <td className="py-2.5 px-3 font-sans text-light-text-muted">
                      {item.category_name}
                    </td>
                    <td className="py-2.5 px-3 text-right">৳{item.cost_price.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right font-bold">
                      ৳{item.selling_price.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="flex flex-wrap gap-1">
                        {item.sizes?.map((sz) => (
                          <span
                            key={sz}
                            className="px-1.5 py-0.5 rounded bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-[10px] font-sans font-semibold"
                          >
                            {sz}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

