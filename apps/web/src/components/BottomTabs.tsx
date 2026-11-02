import React from 'react';
import { LayoutDashboard, Layers, ArrowLeftRight, Store, Users } from 'lucide-react';

interface BottomTabsProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

export const BottomTabs: React.FC<BottomTabsProps> = ({ activeTab, onSelectTab }) => {
  const tabs = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
    { id: 'products', label: 'Stock', icon: Layers },
    { id: 'transfers', label: 'Transfers', icon: ArrowLeftRight },
    { id: 'settings', label: 'Shops', icon: Store },
    { id: 'users', label: 'Users', icon: Users },
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

