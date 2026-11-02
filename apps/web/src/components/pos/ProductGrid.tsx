import React, { useState, useMemo } from 'react';
import { Search, X, AlertCircle } from 'lucide-react';
import type { StockByShopGridItem, Shop } from '@ar-option/shared-types';
import { taka } from '../../lib/money';

interface ProductGridProps {
  stockGrid: StockByShopGridItem[];
  activeShop: Shop | null;
  onAddToCart: (item: StockByShopGridItem) => void;
  onOpenSizePicker: (product: {
    product_id: number;
    product_name: string;
    product_code: string;
    items: StockByShopGridItem[];
  }) => void;
  loading: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  isPhone: boolean;
}

export const ProductGrid: React.FC<ProductGridProps> = ({
  stockGrid,
  activeShop,
  onAddToCart,
  onOpenSizePicker,
  loading,
  searchQuery,
  setSearchQuery,
  isPhone,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');

  // Extract unique categories and brands
  const categories = useMemo(() => {
    const set = new Set<string>();
    stockGrid.forEach((item) => {
      if (item.category_name) set.add(item.category_name);
    });
    return Array.from(set).sort();
  }, [stockGrid]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    stockGrid.forEach((item) => {
      if (item.brand_name) set.add(item.brand_name);
    });
    return Array.from(set).sort();
  }, [stockGrid]);

  // Group by product for phone view
  const productsGrouped = useMemo(() => {
    const map = new Map<
      number,
      {
        product_id: number;
        product_name: string;
        product_code: string;
        category_name?: string;
        brand_name?: string;
        selling_price: number;
        items: StockByShopGridItem[];
      }
    >();

    for (const item of stockGrid) {
      if (!map.has(item.product_id)) {
        map.set(item.product_id, {
          product_id: item.product_id,
          product_name: item.product_name,
          product_code: item.product_code,
          category_name: item.category_name,
          brand_name: item.brand_name,
          selling_price: item.selling_price,
          items: [],
        });
      }
      map.get(item.product_id)!.items.push(item);
    }

    return Array.from(map.values());
  }, [stockGrid]);

  // Filter items for tablet/desktop (size-card grid)
  const filteredVariations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return stockGrid.filter((item) => {
      if (selectedCategory !== 'all' && item.category_name !== selectedCategory) return false;
      if (selectedBrand !== 'all' && item.brand_name !== selectedBrand) return false;
      if (!q) return true;
      return (
        item.product_name.toLowerCase().includes(q) ||
        item.product_code.toLowerCase().includes(q) ||
        item.size.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q)
      );
    });
  }, [stockGrid, searchQuery, selectedCategory, selectedBrand]);

  // Filter grouped products for phone
  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return productsGrouped.filter((prod) => {
      if (selectedCategory !== 'all' && prod.category_name !== selectedCategory) return false;
      if (selectedBrand !== 'all' && prod.brand_name !== selectedBrand) return false;
      if (!q) return true;
      return (
        prod.product_name.toLowerCase().includes(q) ||
        prod.product_code.toLowerCase().includes(q) ||
        prod.items.some((v) => v.size.toLowerCase().includes(q) || v.sku.toLowerCase().includes(q))
      );
    });
  }, [productsGrouped, searchQuery, selectedCategory, selectedBrand]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-light-bg dark:bg-dark-bg">
      {/* Search & Filter Strip */}
      <div className="p-3 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border space-y-2">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-3.5 text-light-text-muted dark:text-dark-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by product name, code, SKU or size..."
            className="w-full h-11 pl-9 pr-8 rounded-xl text-xs md:text-sm bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 text-light-text-muted hover:text-light-text"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category & Brand filter chips */}
        {(categories.length > 0 || brands.length > 0) && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs no-scrollbar">
            {categories.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[11px] text-light-text-muted font-medium">Category:</span>
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    selectedCategory === 'all'
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-light-surface-hover dark:bg-dark-surface-hover border-light-border dark:border-dark-border text-light-text dark:text-dark-text'
                  }`}
                >
                  All
                </button>
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setSelectedCategory(c)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors shrink-0 ${
                      selectedCategory === c
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-light-surface-hover dark:bg-dark-surface-hover border-light-border dark:border-dark-border text-light-text dark:text-dark-text'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}

            {brands.length > 0 && (
              <div className="flex items-center gap-1.5 shrink-0 pl-2 border-l border-light-border dark:border-dark-border">
                <span className="text-[11px] text-light-text-muted font-medium">Brand:</span>
                <button
                  type="button"
                  onClick={() => setSelectedBrand('all')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                    selectedBrand === 'all'
                      ? 'bg-primary text-on-primary border-primary'
                      : 'bg-light-surface-hover dark:bg-dark-surface-hover border-light-border dark:border-dark-border text-light-text dark:text-dark-text'
                  }`}
                >
                  All
                </button>
                {brands.map((b) => (
                  <button
                    key={b}
                    type="button"
                    onClick={() => setSelectedBrand(b)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors shrink-0 ${
                      selectedBrand === b
                        ? 'bg-primary text-on-primary border-primary'
                        : 'bg-light-surface-hover dark:bg-dark-surface-hover border-light-border dark:border-dark-border text-light-text dark:text-dark-text'
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto p-3 md:p-4">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-xs text-light-text-muted">
            Loading products & stock counts...
          </div>
        ) : (isPhone ? filteredProducts.length === 0 : filteredVariations.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-light-text-muted">
            <AlertCircle className="w-8 h-8 stroke-1 mb-2 opacity-50" />
            <p className="text-xs font-semibold">No products found</p>
            <p className="text-[11px] mt-1">Try another search or reset category filter</p>
          </div>
        ) : isPhone ? (
          /* Phone View: Products grid (2 cols) -> clicking opens SizePicker if multiple sizes */
          <div className="grid grid-cols-2 gap-2.5">
            {filteredProducts.map((prod) => {
              const totalStock = prod.items.reduce((sum, v) => {
                const s = v.stocks.find((st) => st.location_id === activeShop?.id);
                return sum + (s?.qty || 0);
              }, 0);

              const hasMultipleSizes = prod.items.length > 1;

              return (
                <div
                  key={prod.product_id}
                  onClick={() => {
                    if (hasMultipleSizes) {
                      onOpenSizePicker(prod);
                    } else if (prod.items.length === 1 && totalStock > 0) {
                      onAddToCart(prod.items[0]);
                    }
                  }}
                  className={`p-3 rounded-xl border flex flex-col justify-between text-left select-none cursor-pointer active:scale-[0.98] transition-all ${
                    totalStock > 0
                      ? 'bg-light-surface dark:bg-dark-surface border-light-border dark:border-dark-border shadow-xs'
                      : 'bg-light-surface/40 dark:bg-dark-surface/40 border-light-border/40 dark:border-dark-border/40 opacity-60'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono font-bold text-light-text-muted uppercase">
                        {prod.product_code}
                      </span>
                      {hasMultipleSizes && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary dark:text-primary-tint">
                          {prod.items.length} Sizes
                        </span>
                      )}
                    </div>
                    <h3 className="text-xs font-bold leading-tight line-clamp-2">
                      {prod.product_name}
                    </h3>
                  </div>

                  <div className="pt-2 border-t border-light-border/60 dark:border-dark-border/60 mt-2 flex items-center justify-between">
                    <span className="font-mono text-xs font-extrabold text-primary dark:text-primary-tint">
                      {taka(prod.selling_price)}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        totalStock > 0
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {totalStock > 0 ? `Stock: ${totalStock}` : 'Out of stock'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Tablet / Laptop / Desktop: ONE CARD PER SIZE per DESIGN.md line 540 & 551 */
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2.5 md:gap-3">
            {filteredVariations.map((item) => {
              const shopStock = item.stocks.find((s) => s.location_id === activeShop?.id)?.qty || 0;
              const isAvailable = shopStock > 0;

              return (
                <div
                  key={item.variation_id}
                  onClick={() => {
                    if (isAvailable) {
                      onAddToCart(item);
                    }
                  }}
                  className={`p-3 rounded-xl border flex flex-col justify-between text-left select-none transition-all ${
                    isAvailable
                      ? 'bg-light-surface dark:bg-dark-surface border-light-border dark:border-dark-border hover:border-primary active:scale-[0.98] cursor-pointer shadow-xs'
                      : 'bg-light-surface/40 dark:bg-dark-surface/40 border-light-border/40 dark:border-dark-border/40 opacity-60 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className="text-[10px] font-mono font-bold text-light-text-muted uppercase">
                        {item.product_code}
                      </span>
                      <span className="text-xs font-extrabold px-1.5 py-0.5 rounded bg-primary/10 text-primary dark:text-primary-tint font-mono">
                        {item.size}
                      </span>
                    </div>

                    <h3 className="text-xs font-bold leading-tight line-clamp-2">
                      {item.product_name}
                    </h3>

                    <div className="text-[10px] font-mono text-light-text-muted mt-1">
                      SKU: {item.sku}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-light-border/60 dark:border-dark-border/60 mt-2 flex items-center justify-between">
                    <span className="font-mono text-xs font-extrabold text-primary dark:text-primary-tint">
                      {taka(item.selling_price)}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        isAvailable
                          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {isAvailable ? `Stock: ${shopStock}` : 'Out of stock'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
