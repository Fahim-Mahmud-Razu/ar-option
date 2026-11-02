import React, { useState, useEffect } from 'react';
import { Package, RefreshCw, Layers, UploadCloud, Plus, Pencil } from 'lucide-react';
import type { StockByShopGridItem } from '@ar-option/shared-types';
import { apiFetch } from '../lib/api';

interface StockGridViewProps {
  apiUrl: string;
  canManage?: boolean;
  onAddProduct?: () => void;
  onEditProduct?: (productId: number) => void;
  canImport?: boolean;
  onImport?: () => void;
}

export const StockGridView: React.FC<StockGridViewProps> = ({
  apiUrl,
  canManage = false,
  onAddProduct,
  onEditProduct,
  canImport = false,
  onImport,
}) => {
  const [gridItems, setGridItems] = useState<StockByShopGridItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSizeIndex, setSelectedSizeIndex] = useState<number>(0);

  const fetchStockGrid = () => {
    setLoading(true);
    apiFetch(`${apiUrl}/reports/stock-by-shop`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data: StockByShopGridItem[]) => {
        setGridItems(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };

  useEffect(() => {
    fetchStockGrid();
  }, [apiUrl]);

  return (
    <div className="space-y-6">
      {/* View Header with Sub-tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold flex items-center space-x-2">
            <Layers className="w-5 h-5 text-primary dark:text-primary-tint" />
            <span>Products & Inventory</span>
          </h2>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
            Rule 4: Stock tracked per size across shops and in-transit locations
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {canImport && onImport && (
            <button
              type="button"
              onClick={onImport}
              data-testid="open-import"
              className="h-11 px-4 rounded-xl text-sm font-semibold flex items-center space-x-1.5 bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Import Products</span>
            </button>
          )}

          {canManage && onAddProduct && (
            <button
              type="button"
              onClick={onAddProduct}
              data-testid="add-product"
              className="h-11 px-4 rounded-xl text-sm font-bold bg-primary hover:bg-primary-hover text-on-primary flex items-center space-x-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          )}

          {(
            <button
              type="button"
              onClick={fetchStockGrid}
              className="h-10 px-3 rounded-xl text-xs font-semibold bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover flex items-center space-x-1.5 self-start sm:self-auto"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-light-text-muted dark:text-dark-text-muted">
          Loading stock counts across shops...
        </div>
      ) : gridItems.length === 0 ? (
        <div className="bg-light-surface dark:bg-dark-surface p-8 rounded-2xl border border-light-border dark:border-dark-border text-center space-y-3">
          <Package className="w-8 h-8 text-light-text-muted dark:text-dark-text-muted mx-auto opacity-50" />
          <div className="text-sm font-semibold">No stock records found</div>
          <div className="text-xs text-light-text-muted dark:text-dark-text-muted max-w-sm mx-auto">
            Get started by bulk importing your product catalog with size variations.
          </div>
          {canImport && onImport && (
            <button
              type="button"
              onClick={onImport}
              className="h-11 px-4 rounded-xl bg-primary text-on-primary text-sm font-bold inline-flex items-center space-x-1.5"
            >
              <UploadCloud className="w-4 h-4" />
              <span>Import Products Now</span>
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Mobile View: Pick a size and view list of shops (DESIGN.md line 548) */}
          <div className="md:hidden space-y-4">
            <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-xl border border-light-border dark:border-dark-border space-y-3">
              <label className="block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">
                Select Product Variation / Size
              </label>
              <select
                value={selectedSizeIndex}
                onChange={(e) => setSelectedSizeIndex(parseInt(e.target.value, 10))}
                className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border focus:outline-none focus:ring-2 focus:ring-focus-ring font-semibold"
              >
                {gridItems.map((item, idx) => (
                  <option key={item.variation_id} value={idx}>
                    {item.product_name} - {item.size} ({item.sku})
                  </option>
                ))}
              </select>
            </div>

            {gridItems[selectedSizeIndex] && (
              <div className="bg-light-surface dark:bg-dark-surface rounded-xl border border-light-border dark:border-dark-border overflow-hidden">
                <div className="p-4 border-b border-light-border dark:border-dark-border">
                  <div className="text-xs font-mono text-light-text-muted dark:text-dark-text-muted uppercase">
                    {gridItems[selectedSizeIndex].product_code}
                  </div>
                  <h3 className="font-bold text-sm mt-0.5">
                    {gridItems[selectedSizeIndex].product_name}
                  </h3>
                  {canManage && onEditProduct && (
                    <button
                      type="button"
                      onClick={() => onEditProduct(gridItems[selectedSizeIndex].product_id)}
                      className="mt-2 h-11 px-4 rounded-xl text-sm font-semibold flex items-center space-x-1.5 bg-light-surface-hover dark:bg-dark-surface-hover"
                    >
                      <Pencil className="w-4 h-4" />
                      <span>Edit product</span>
                    </button>
                  )}
                  <div className="flex items-center space-x-2 mt-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/10 text-primary dark:text-primary-tint">
                      Size: {gridItems[selectedSizeIndex].size}
                    </span>
                    <span className="text-xs font-mono text-light-text-muted">
                      Selling: ৳{gridItems[selectedSizeIndex].selling_price.toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="divide-y divide-light-border dark:divide-dark-border">
                  {gridItems[selectedSizeIndex].stocks.map((loc) => (
                    <div
                      key={loc.location_id}
                      className="p-3.5 flex items-center justify-between text-xs"
                    >
                      <div>
                        <div className="font-semibold">{loc.location_name}</div>
                        <div className="text-[10px] text-light-text-muted font-mono">
                          {loc.location_code} {loc.is_system ? '(System Location)' : ''}
                        </div>
                      </div>
                      <div className="text-right">
                        <span
                          className={`font-mono font-extrabold text-sm ${
                            loc.qty > 0
                              ? 'text-primary dark:text-primary-tint'
                              : 'text-light-text-muted dark:text-dark-text-muted'
                          }`}
                        >
                          {loc.qty}
                        </span>
                        <span className="text-[10px] text-light-text-muted block">available</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Tablet & Desktop: Matrix Table (DESIGN.md line 548) */}
          <div className="hidden md:block bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider">
                    <th className="sticky left-0 bg-light-surface dark:bg-dark-surface py-3 px-4 font-semibold z-10 border-r border-light-border dark:border-dark-border min-w-[200px]">
                      Product & Size
                    </th>
                    <th className="py-3 px-3 font-semibold text-right">Selling (৳)</th>
                    {gridItems[0]?.stocks.map((loc) => (
                      <th
                        key={loc.location_id}
                        className="py-3 px-4 font-semibold text-center min-w-[100px]"
                      >
                        <div>{loc.location_name}</div>
                        <div className="text-[10px] font-mono text-light-text-muted font-normal">
                          {loc.location_code}
                        </div>
                      </th>
                    ))}
                    <th className="py-3 px-4 font-semibold text-center bg-light-surface-hover/50 dark:bg-dark-surface-hover/50 min-w-[90px]">
                      Total
                    </th>
                    {canManage && <th className="py-3 px-2"><span className="sr-only">Edit</span></th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-border dark:divide-dark-border font-mono">
                  {gridItems.map((item) => {
                    const rowTotal = item.stocks.reduce(
                      (sum, s) => sum + s.qty,
                      0
                    );
                    return (
                      <tr
                        key={item.variation_id}
                        className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
                      >
                        <td className="sticky left-0 bg-light-surface dark:bg-dark-surface py-3 px-4 font-sans border-r border-light-border dark:border-dark-border">
                          <div className="font-bold text-xs">{item.product_name}</div>
                          <div className="text-[11px] text-light-text-muted flex items-center space-x-1.5 font-mono">
                            <span className="font-bold text-primary dark:text-primary-tint">
                              [{item.size}]
                            </span>
                            <span>{item.sku}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right">
                          ৳{item.selling_price.toFixed(2)}
                        </td>
                        {item.stocks.map((s) => (
                          <td
                            key={s.location_id}
                            className={`py-3 px-4 text-center font-bold ${
                              s.qty > 0
                                ? 'text-light-text dark:text-dark-text'
                                : 'text-light-text-muted/40 dark:text-dark-text-muted/40 font-normal'
                            }`}
                          >
                            {s.qty}
                          </td>
                        ))}
                        <td className="py-3 px-4 text-center font-extrabold text-primary dark:text-primary-tint bg-light-surface-hover/30 dark:bg-dark-surface-hover/30">
                          {rowTotal}
                        </td>
                        {canManage && onEditProduct && (
                          <td className="py-1 px-2">
                            <button
                              type="button"
                              onClick={() => onEditProduct(item.product_id)}
                              aria-label={`Edit ${item.product_name}`}
                              className="w-11 h-11 rounded-xl flex items-center justify-center hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
