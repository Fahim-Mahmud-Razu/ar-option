import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  ShoppingCart,
  Store,
  User,
  UserPlus,
  X,
  Search,
  Keyboard,
  Clock,
  Coins,
  Barcode,
} from 'lucide-react';
import type { Shop, Contact } from '@ar-option/shared-types';
import { apiFetch } from '../../lib/api';
import { taka } from '../../lib/money';

interface PosHeaderProps {
  activeShop: Shop | null;
  onExit: () => void;
  customer: Contact | null;
  onSelectCustomer: (contact: Contact | null) => void;
  onOpenAddCustomer: () => void;
  skuInputRef: React.RefObject<HTMLInputElement>;
  skuValue: string;
  onSkuChange: (val: string) => void;
  onSkuSubmit: () => void;
  tillSession: { isOpen: boolean; cash: number } | null;
  onOpenTill: () => void;
  suspendedCount: number;
  onOpenSuspended: () => void;
  onOpenHotkeys: () => void;
  apiUrl: string;
}

export const PosHeader: React.FC<PosHeaderProps> = ({
  activeShop,
  onExit,
  customer,
  onSelectCustomer,
  onOpenAddCustomer,
  skuInputRef,
  skuValue,
  onSkuChange,
  onSkuSubmit,
  tillSession,
  onOpenTill,
  suspendedCount,
  onOpenSuspended,
  onOpenHotkeys,
  apiUrl,
}) => {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<Contact[]>([]);
  const [isSearchingCustomer, setIsSearchingCustomer] = useState(false);
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Debounced search for customers
  useEffect(() => {
    if (!customerSearch.trim() || customerSearch.length < 2) {
      setCustomerResults([]);
      setIsSearchingCustomer(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearchingCustomer(true);
      try {
        const res = await apiFetch(`${apiUrl}/contacts?query=${encodeURIComponent(customerSearch.trim())}`);
        if (res.ok) {
          const list: Contact[] = await res.json();
          setCustomerResults(list.filter((c) => c.is_active !== false));
        }
      } catch {
        // ignore
      } finally {
        setIsSearchingCustomer(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [customerSearch, apiUrl]);

  // Click outside listener for customer dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="flex flex-col bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border px-3 py-2 gap-2 text-xs">
      {/* Top Strip: Brand, Shop, Till status, Parked Carts, Hotkeys, Exit */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onExit}
            aria-label="Back"
            data-testid="pos-back"
            className="w-10 h-10 -ml-1 flex items-center justify-center rounded-xl text-light-text-muted hover:text-light-text dark:hover:text-dark-text hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-1.5 font-extrabold text-sm md:text-base">
            <ShoppingCart className="w-5 h-5 text-primary dark:text-primary-tint" />
            <span>Point of Sale</span>
          </div>

          {activeShop && (
            <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary dark:text-primary-tint border border-primary/20">
              <Store className="w-3.5 h-3.5" />
              <span>{activeShop.name} ({activeShop.code})</span>
            </span>
          )}
        </div>

        {/* Action strip right */}
        <div className="flex items-center gap-2">
          {/* Till Chip */}
          {tillSession?.isOpen ? (
            <button
              type="button"
              onClick={onOpenTill}
              data-testid="pos-till-chip"
              title="Open Till Status"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
            >
              <Coins className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Till {taka(tillSession.cash)}</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={onOpenTill}
              data-testid="pos-till-chip"
              title="Open the Till drawer for this shop"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 transition-colors animate-pulse"
            >
              <Coins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              <span>Open Till</span>
            </button>
          )}

          {/* Suspended Carts Chip */}
          {suspendedCount > 0 && (
            <button
              type="button"
              onClick={onOpenSuspended}
              data-testid="pos-suspended-chip"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-bold bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text hover:border-primary transition-colors"
            >
              <Clock className="w-3.5 h-3.5 text-primary dark:text-primary-tint" />
              <span>Parked ({suspendedCount})</span>
            </button>
          )}

          {/* Hotkeys helper button */}
          <button
            type="button"
            onClick={onOpenHotkeys}
            aria-label="Keyboard Shortcuts"
            title="Keyboard Shortcuts (F2, F4, F8, F9, Esc)"
            className="hidden md:flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text-muted hover:text-light-text dark:hover:text-dark-text"
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>Hotkeys</span>
          </button>
        </div>
      </div>

      {/* Second Strip: Customer Selection + SKU Barcode Entry */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1 border-t border-light-border/60 dark:border-dark-border/60">
        {/* Customer Search & Select Box */}
        <div ref={dropdownRef} className="relative flex-1 sm:max-w-xs md:max-w-sm">
          {customer ? (
            <div className="h-10 px-3 flex items-center justify-between rounded-xl bg-primary/10 border border-primary/30 text-primary dark:text-primary-tint">
              <div className="flex items-center gap-2 truncate">
                <User className="w-4 h-4 shrink-0" />
                <span className="font-bold truncate">{customer.name}</span>
                {customer.phone && (
                  <span className="text-[11px] opacity-80 shrink-0 font-mono">({customer.phone})</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSelectCustomer(null)}
                aria-label="Remove customer, switch to walk-in"
                title="Switch back to Walk-in Customer"
                className="w-6 h-6 flex items-center justify-center rounded-lg hover:bg-primary/20"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <div className="relative flex items-center gap-1">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-light-text-muted dark:text-dark-text-muted" />
                <input
                  type="text"
                  value={customerSearch}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onChange={(e) => {
                    setCustomerSearch(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  placeholder="Customer (Walk-in)..."
                  className="w-full h-10 pl-8 pr-2 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>
              <button
                type="button"
                onClick={onOpenAddCustomer}
                title="Add new customer"
                className="h-10 px-2.5 flex items-center gap-1 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover hover:bg-primary hover:text-on-primary border border-light-border dark:border-dark-border text-light-text dark:text-dark-text font-bold transition-colors shrink-0"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">New</span>
              </button>
            </div>
          )}

          {/* Autocomplete Dropdown */}
          {showCustomerDropdown && (
            <div className="absolute left-0 right-0 top-11 z-50 rounded-xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-xl overflow-hidden max-h-60 overflow-y-auto">
              <div
                onClick={() => {
                  onSelectCustomer(null);
                  setShowCustomerDropdown(false);
                  setCustomerSearch('');
                }}
                className="px-3 py-2 flex items-center gap-2 hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover cursor-pointer border-b border-light-border dark:border-dark-border"
              >
                <User className="w-3.5 h-3.5 text-light-text-muted" />
                <span className="font-semibold">Walk-in Customer (Default)</span>
              </div>

              {isSearchingCustomer && (
                <div className="p-3 text-center text-xs text-light-text-muted">Searching customers...</div>
              )}

              {!isSearchingCustomer && customerSearch.length >= 2 && customerResults.length === 0 && (
                <div className="p-3 text-center text-xs text-light-text-muted">
                  No matching customer.
                  <button
                    type="button"
                    onClick={() => {
                      setShowCustomerDropdown(false);
                      onOpenAddCustomer();
                    }}
                    className="block mx-auto mt-1 text-primary font-bold hover:underline"
                  >
                    + Add "{customerSearch}"
                  </button>
                </div>
              )}

              {customerResults.map((c) => (
                <div
                  key={c.id}
                  onClick={() => {
                    onSelectCustomer(c);
                    setShowCustomerDropdown(false);
                    setCustomerSearch('');
                  }}
                  className="px-3 py-2 flex items-center justify-between hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover cursor-pointer text-xs"
                >
                  <div className="font-bold truncate">{c.name}</div>
                  <div className="font-mono text-[11px] text-light-text-muted dark:text-dark-text-muted">
                    {c.phone || c.email}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Enter SKU Box */}
        <div className="relative flex-1">
          <Barcode className="w-4 h-4 absolute left-3 top-3 text-light-text-muted dark:text-dark-text-muted pointer-events-none" />
          <input
            ref={skuInputRef as any}
            type="text"
            value={skuValue}
            onChange={(e) => onSkuChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSkuSubmit();
              }
            }}
            placeholder="Enter SKU or scan barcode (F2)..."
            aria-label="Enter SKU"
            className="w-full h-10 pl-9 pr-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-mono"
          />
        </div>
      </div>
    </header>
  );
};
