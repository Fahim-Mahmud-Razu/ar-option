import React from 'react';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  RotateCcw,
  Truck,
  DollarSign,
  ArrowLeftRight,
  Settings,
  Users,
  Scale,
  Banknote,
  PanelLeftClose,
  PanelLeftOpen,
  ListOrdered,
} from 'lucide-react';

/** Every screen, in menu order. The sidebar, the rail and the phone More menu all use this list. */
export const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'pos', label: 'Sell / POS', icon: ShoppingCart },
  { id: 'returns', label: 'Return & Exchange', icon: RotateCcw },
  { id: 'courier', label: 'Courier & Settlement', icon: Truck },
  { id: 'cash-closing', label: 'Till', icon: Banknote },
  { id: 'products', label: 'Products & Stock', icon: Package },
  { id: 'expenses', label: 'Daily Expenses', icon: DollarSign },
  { id: 'transfers', label: 'Stock Transfers', icon: ArrowLeftRight },
  { id: 'users', label: 'User Management', icon: Users },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'ledger', label: 'Financial Statements', icon: Scale },
  { id: 'pagination-demo', label: 'Pagination Demo', icon: ListOrdered },
];

interface SidebarProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  collapsed = false,
  onToggleCollapse,
}) => {

  return (
    <>
      {/* Tablet 64px Rail */}
      <aside className="hidden md:flex lg:hidden w-16 bg-light-surface dark:bg-dark-surface border-r border-light-border dark:border-dark-border flex-col items-center py-4 space-y-3 shrink-0">
        {NAV_ITEMS.map((item) => {
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

      {/* Laptop & Desktop Collapsible Sidebar */}
      <aside
        className={`hidden lg:flex ${
          collapsed ? 'w-16' : 'w-60 xl:w-64'
        } bg-light-surface dark:bg-dark-surface border-r border-light-border dark:border-dark-border flex-col py-3 px-2 transition-all duration-300 ease-in-out shrink-0 select-none`}
      >
        {/* Header & Toggle Slider Button */}
        <div
          className={`flex items-center ${
            collapsed ? 'justify-center' : 'justify-between'
          } px-2 pb-2.5 mb-1 border-b border-light-border dark:border-dark-border`}
        >
          {!collapsed && (
            <span className="text-[11px] font-bold text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider pl-1">
              Navigation
            </span>
          )}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title={collapsed ? 'Expand navigation (Ctrl+B)' : 'Collapse navigation (Ctrl+B)'}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              data-testid="toggle-sidebar-button"
              className="p-1.5 rounded-lg text-light-text-muted hover:text-light-text dark:hover:text-dark-text hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors"
            >
              {collapsed ? (
                <PanelLeftOpen className="w-4 h-4 text-primary dark:text-primary-tint" />
              ) : (
                <PanelLeftClose className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        {/* Nav Items List */}
        <div className="flex-1 overflow-y-auto space-y-1 py-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                title={collapsed ? item.label : undefined}
                aria-label={item.label}
                className={`w-full flex items-center ${
                  collapsed ? 'justify-center p-3' : 'space-x-3 px-3 py-2.5'
                } rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-primary text-on-primary shadow-sm font-bold'
                    : 'text-light-text-muted dark:text-dark-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover hover:text-light-text dark:hover:text-dark-text'
                }`}
                data-testid={`desktop-nav-${item.id}`}
              >
                <Icon className={`${collapsed ? 'w-5 h-5' : 'w-4 h-4'} shrink-0`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </div>

        {/* Bottom Collapse Helper / Shortcut Hint */}
        {!collapsed && onToggleCollapse && (
          <div className="pt-2 border-t border-light-border dark:border-dark-border px-1">
            <button
              type="button"
              onClick={onToggleCollapse}
              className="w-full flex items-center justify-between text-[11px] text-light-text-muted hover:text-light-text dark:hover:text-dark-text py-1.5 px-2 rounded-lg hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors"
            >
              <span>Collapse sidebar</span>
              <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border">
                Ctrl+B
              </kbd>
            </button>
          </div>
        )}
      </aside>
    </>
  );
};
