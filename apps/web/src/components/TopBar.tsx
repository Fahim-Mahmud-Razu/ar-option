import React from 'react';
import { Sun, Moon, LogOut, User as UserIcon } from 'lucide-react';
import { ShopChip } from './ShopChip';
import type { Shop } from '@ar-option/shared-types';

interface TopBarProps {
  title: string;
  shops: Shop[];
  activeShop: Shop | null;
  onSelectShop: (shop: Shop | null) => void;
  darkMode: boolean;
  onToggleTheme: () => void;
  isAdmin: boolean;
  userName: string;
  onSignOut: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({
  title,
  shops,
  activeShop,
  onSelectShop,
  darkMode,
  onToggleTheme,
  isAdmin,
  userName,
  onSignOut,
}) => {
  return (
    <header className="h-14 md:h-16 px-4 md:px-6 bg-light-surface dark:bg-dark-surface border-b border-light-border dark:border-dark-border flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-primary text-on-primary flex items-center justify-center font-bold text-sm tracking-tight">
          AR
        </div>
        <div className="hidden min-[400px]:block">
          <h1 className="text-sm md:text-base font-bold text-light-text dark:text-dark-text leading-tight">
            {title}
          </h1>
          <p className="text-[10px] text-light-text-muted dark:text-dark-text-muted hidden md:block">
            AR Option Retail Ledger
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 md:space-x-3">
        <ShopChip
          shops={shops}
          activeShop={activeShop}
          onSelectShop={onSelectShop}
          isAdmin={isAdmin}
        />

        <button
          type="button"
          onClick={onToggleTheme}
          className="p-2 rounded-lg text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors"
          aria-label="Toggle theme"
        >
          {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <div className="flex items-center space-x-2 pl-2 border-l border-light-border dark:border-dark-border">
          <div className="hidden min-[400px]:flex w-7 h-7 rounded-full bg-light-surface-hover dark:bg-dark-surface-hover flex items-center justify-center text-light-text-muted dark:text-dark-text-muted">
            <UserIcon className="w-4 h-4" />
          </div>
          <span className="text-xs font-semibold hidden md:inline-block">{userName}</span>
          <button
            type="button"
            onClick={onSignOut}
            className="p-2 rounded-lg text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors"
            aria-label="Sign out"
            data-testid="sign-out"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};

