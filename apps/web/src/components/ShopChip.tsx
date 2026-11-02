import React, { useState } from 'react';
import { Store, ChevronDown, Check } from 'lucide-react';
import type { Shop } from '@ar-option/shared-types';

interface ShopChipProps {
  shops: Shop[];
  activeShop: Shop | null;
  onSelectShop: (shop: Shop | null) => void;
  isAdmin?: boolean;
}

export const ShopChip: React.FC<ShopChipProps> = ({
  shops,
  activeShop,
  onSelectShop,
  isAdmin = true,
}) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-primary/10 text-primary dark:text-primary-tint hover:bg-primary/20 transition-colors"
        aria-label="Active Shop Picker"
        data-testid="shop-chip"
      >
        <Store className="w-3.5 h-3.5" />
        <span className="font-bold truncate max-w-[120px] md:max-w-[160px]">
          {activeShop ? activeShop.name : 'All shops'}
        </span>
        <ChevronDown className="w-3 h-3 opacity-70" />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 mt-2 w-56 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-xl z-50 py-1.5">
            <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-light-text-muted dark:text-dark-text-muted border-b border-light-border dark:border-dark-border">
              Select Shop
            </div>
            {isAdmin && (
              <button
                type="button"
                onClick={() => {
                  onSelectShop(null);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
              >
                <span>All shops (Company-wide)</span>
                {activeShop === null && <Check className="w-4 h-4 text-primary" />}
              </button>
            )}
            {shops.map((shop) => (
              <button
                key={shop.id}
                type="button"
                onClick={() => {
                  onSelectShop(shop);
                  setOpen(false);
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-left hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
              >
                <div>
                  <div className="font-semibold">{shop.name}</div>
                  <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted">{shop.code}</div>
                </div>
                {activeShop?.id === shop.id && <Check className="w-4 h-4 text-primary" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};

