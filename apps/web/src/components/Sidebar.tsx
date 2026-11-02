import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  RotateCcw,
  Truck,
  DollarSign,
  ArrowLeftRight,
  Store,
  Users,
  Scale,
  Banknote,
} from 'lucide-react';

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelectTab }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'pos', label: 'Sell / POS', icon: ShoppingCart },
    { id: 'returns', label: 'Return & Exchange', icon: RotateCcw },
    { id: 'courier', label: 'Courier & Settlement', icon: Truck },
    { id: 'cash-closing', label: 'Daily Cash Closing', icon: Banknote },
    { id: 'products', label: 'Products & Stock', icon: Package },
    { id: 'expenses', label: 'Daily Expenses', icon: DollarSign },
    { id: 'transfers', label: 'Stock Transfers', icon: ArrowLeftRight },
    { id: 'users', label: 'User Management', icon: Users },
    { id: 'settings', label: 'Shop Management', icon: Store },
    { id: 'ledger', label: 'Financial Statements', icon: Scale },
  ];

  return (
    <>
      {/* Tablet 64px Rail */}
      <aside className="hidden md:flex lg:hidden w-16 bg-light-surface dark:bg-dark-surface border-r border-light-border dark:border-dark-border flex-col items-center py-4 space-y-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`p-3 rounded-xl transition-colors ${
                isActive
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover'
              }`}
              title={item.label}
              aria-label={item.label}
              data-testid={`tablet-nav-${item.id}`}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </aside>

      {/* Laptop & Desktop 256px Sidebar */}
      <aside className="hidden lg:flex w-64 bg-light-surface dark:bg-dark-surface border-r border-light-border dark:border-dark-border flex-col py-4 px-3 space-y-1">
        <div className="px-3 pb-3 text-xs font-bold text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider">
          Main Navigation
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-colors ${
                isActive
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover hover:text-light-text dark:hover:text-dark-text'
              }`}
              data-testid={`desktop-nav-${item.id}`}
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </aside>
    </>
  );
};
