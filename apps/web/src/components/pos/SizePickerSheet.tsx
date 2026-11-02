import React from 'react';
import { Check } from 'lucide-react';
import type { StockByShopGridItem } from '@ar-option/shared-types';
import type { CartLineItem } from './types';
import { Sheet } from '../Sheet';
import { taka } from '../../lib/money';

interface SizePickerSheetProps {
  product: {
    product_id: number;
    product_name: string;
    product_code: string;
    items: StockByShopGridItem[];
  } | null;
  activeShopId: number | null;
  onSelectVariation: (item: StockByShopGridItem) => void;
  onClose: () => void;
  cart?: CartLineItem[];
}

export const SizePickerSheet: React.FC<SizePickerSheetProps> = ({
  product,
  activeShopId,
  onSelectVariation,
  onClose,
  cart = [],
}) => {
  if (!product) return null;

  return (
    <Sheet
      title={`Select Size — ${product.product_name}`}
      onClose={onClose}
      testId="size-picker-sheet"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between text-xs text-light-text-muted dark:text-dark-text-muted border-b border-light-border dark:border-dark-border pb-2">
          <span>Code: <span className="font-mono font-bold text-light-text dark:text-dark-text">{product.product_code}</span></span>
          <span>{product.items.length} sizes available</span>
        </div>

        {/* 48px Size Tiles per DESIGN.md lines 580-581 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {product.items.map((item) => {
            const shopStock = item.stocks.find((s) => s.location_id === activeShopId)?.qty || 0;
            const otherShopsStock = item.stocks
              .filter((s) => s.location_id !== activeShopId && !s.is_system)
              .reduce((sum, s) => sum + s.qty, 0);

            const isAvailable = shopStock > 0;
            const inCartItem = cart.find((c) => c.variation_id === item.variation_id);
            const inCartQty = inCartItem?.quantity || 0;
            const isSelected = inCartQty > 0;

            return (
              <button
                key={item.variation_id}
                type="button"
                disabled={!isAvailable}
                onClick={() => onSelectVariation(item)}
                className={`min-h-[48px] p-3 rounded-xl border flex flex-col justify-between text-left transition-all select-none relative ${
                  isSelected
                    ? 'bg-primary/5 dark:bg-primary/10 border-primary ring-2 ring-primary/40 shadow-sm'
                    : isAvailable
                    ? 'bg-light-surface dark:bg-dark-surface border-light-border dark:border-dark-border hover:border-primary active:scale-[0.98] shadow-sm'
                    : 'bg-light-surface/40 dark:bg-dark-surface/40 border-light-border/40 dark:border-dark-border/40 opacity-60 cursor-not-allowed'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-1.5">
                    <span className="font-extrabold text-sm font-mono text-primary dark:text-primary-tint">
                      {item.size}
                    </span>
                    {isSelected && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.2 rounded-full bg-primary text-on-primary font-bold text-[10px]">
                        <Check className="w-2.5 h-2.5 stroke-[2.5]" />
                        <span>{inCartQty} in cart</span>
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs font-bold">
                    {taka(item.selling_price)}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between text-[11px] w-full">
                  <span
                    className={`font-semibold ${
                      isAvailable
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-rose-600 dark:text-rose-400'
                    }`}
                  >
                    {isAvailable ? `Stock: ${shopStock}` : 'Out of stock'}
                  </span>

                  {!isAvailable && otherShopsStock > 0 && (
                    <span className="text-[10px] text-light-text-muted dark:text-dark-text-muted" title={`${otherShopsStock} in other shops`}>
                      ({otherShopsStock} in other shop)
                    </span>
                  )}
                </div>

                <div className="text-[10px] text-light-text-muted font-mono mt-0.5">
                  SKU: {item.sku}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </Sheet>
  );
};
