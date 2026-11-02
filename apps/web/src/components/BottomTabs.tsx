import React from 'react';
import { LayoutDashboard, ShoppingCart, Layers, DollarSign, ArrowLeftRight } from 'lucide-react';

interface BottomTabsProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const BottomTabs: React.FC<BottomTabsProps> = ({ activeTab, onSelectTab }) => {
  // DESIGN.md line 529: Bottom tabs are hidden during a sale / in POS
  if (activeTab === 'pos') {
    return null;
  }

  const tabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'pos', label: 'POS', icon: ShoppingCart },
    { id: 'products', label: 'Stock', icon: Layers },
    { id: 'expenses', label: 'Expenses', icon: DollarSign },
    { id: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-light-surface dark:bg-dark-surface border-t border-light-border dark:border-dark-border z-30 flex items-center justify-around px-2"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
      aria-label="Mobile Navigation Tabs"
    >
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            data-testid={`mobile-nav-${tab.id}`}
            onClick={() => onSelectTab(tab.id)}
            className={`flex flex-col items-center justify-center w-14 py-1 rounded-lg transition-colors ${
              isActive
                ? 'text-primary dark:text-primary-tint font-bold'
                : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-text dark:hover:text-dark-text'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
