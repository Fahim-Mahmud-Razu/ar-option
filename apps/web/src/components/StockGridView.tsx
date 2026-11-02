import React, { useState, useEffect } from 'react';
import { Package, RefreshCw, Layers } from 'lucide-react';
import type { StockByShopGridItem } from '@ar-option/shared-types';

interface StockGridViewProps {
  apiUrl: string;
}

export const StockGridView: React.FC<StockGridViewProps> = ({ apiUrl }) => {
  const [gridItems, setGridItems] = useState<StockByShopGridItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedSizeIndex, setSelectedSizeIndex] = useState<number>(0);

  const fetchStockGrid = () => {
    setLoading(true);
    fetch(`${apiUrl}/reports/stock-by-shop`)
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold flex items-center space-x-2">
            <Layers className="w-5 h-5 text-primary dark:text-primary-tint" />
            <span>Stock by Shop Grid</span>
          </h2>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
            Rule 4: Stock tracked per size across retail branches and in-transit locations
          </p>
        </div>

        <button
          type="button"
          onClick={fetchStockGrid}
          className="h-10 px-3 rounded-xl text-xs font-semibold bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover flex items-center space-x-1.5 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Stock</span>
        </button>
      </div>

      {loading ? (
        <div className="py-12 text-center text-xs text-light-text-muted dark:text-dark-text-muted">
          Loading stock counts across shops...
        </div>
      ) : gridItems.length === 0 ? (
        <div className="bg-light-surface dark:bg-dark-surface p-8 rounded-2xl border border-light-border dark:border-dark-border text-center space-y-2">
          <Package className="w-8 h-8 text-light-text-muted dark:text-dark-text-muted mx-auto opacity-50" />
          <div className="text-sm font-semibold">No stock records found</div>
          <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
            Add products and record stock transfers or purchases to view inventory by shop.
          </div>
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
                    {item.product_name} - Size {item.size} ({item.sku})
                  </option>
                ))}
              </select>

              {gridItems[selectedSizeIndex] && (
                <div className="pt-2 border-t border-light-border dark:border-dark-border space-y-2">
                  <div className="text-xs font-bold text-primary dark:text-primary-tint">
                    {gridItems[selectedSizeIndex].product_name} • Size {gridItems[selectedSizeIndex].size}
                  </div>
                  <div className="divide-y divide-light-border dark:divide-dark-border">
                    {gridItems[selectedSizeIndex].stocks.map((s) => (
                      <div key={s.location_id} className="py-2.5 flex items-center justify-between text-xs">
                        <div>
                          <div className="font-semibold">{s.location_name}</div>
                          <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted">
                            {s.is_system ? 'System Location' : s.location_code}
                          </div>
                        </div>
                        <span className={`font-mono font-bold text-sm ${s.qty > 0 ? 'text-primary dark:text-primary-tint' : 'text-light-text-muted dark:text-dark-text-muted'}`}>
                          {s.qty} pcs
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Tablet & Desktop: Matrix Table with Sticky First Column (DESIGN.md line 548) */}
          <div className="hidden md:block bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs">
              <thead className="bg-light-surface-hover dark:bg-dark-surface-hover border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4 sticky left-0 bg-light-surface-hover dark:bg-dark-surface-hover z-10 min-w-[220px]">
                    Product / Size
                  </th>
                  <th className="py-3 px-3">SKU</th>
                  <th className="py-3 px-3 text-right">Cost (৳)</th>
                  <th className="py-3 px-3 text-right">Sell (৳)</th>
                  {gridItems[0]?.stocks.map((loc) => (
                    <th key={loc.location_id} className="py-3 px-4 text-right min-w-[110px]">
                      {loc.location_name}
                    </th>
                  ))}
                  <th className="py-3 px-4 text-right font-bold min-w-[100px]">Total Stock</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-light-border dark:divide-dark-border">
                {gridItems.map((item) => {
                  const totalStock = item.stocks.reduce((acc, s) => acc + s.qty, 0);

                  return (
                    <tr key={item.variation_id} className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover">
                      <td className="py-3 px-4 sticky left-0 bg-light-surface dark:bg-dark-surface hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover z-10 font-medium">
                        <div className="font-bold">{item.product_name}</div>
                        <div className="text-[11px] text-primary dark:text-primary-tint">Size: {item.size}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-light-text-muted dark:text-dark-text-muted">
                        {item.sku}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">
                        ৳{item.cost_price.toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-semibold">
                        ৳{item.selling_price.toFixed(2)}
                      </td>
                      {item.stocks.map((s) => (
                        <td
                          key={s.location_id}
                          className={`py-3 px-4 text-right font-mono ${
                            s.qty > 0 ? 'font-bold text-light-text dark:text-dark-text' : 'text-light-text-muted dark:text-dark-text-muted opacity-40'
                          }`}
                        >
                          {s.qty > 0 ? s.qty : '-'}
                        </td>
                      ))}
                      <td className="py-3 px-4 text-right font-mono font-extrabold text-primary dark:text-primary-tint">
                        {totalStock}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};
