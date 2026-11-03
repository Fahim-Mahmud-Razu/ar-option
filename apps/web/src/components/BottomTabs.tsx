import React, { useState } from 'react';
import { LayoutDashboard, ShoppingCart, Truck, Layers, Menu } from 'lucide-react';
import { NAV_ITEMS } from './Sidebar';
import { Sheet } from './Sheet';

interface BottomTabsProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

const TABS = [
  { id: 'dashboard', label: 'Home', icon: LayoutDashboard },
  { id: 'pos', label: 'POS', icon: ShoppingCart },
  { id: 'products', label: 'Stock', icon: Layers },
  { id: 'courier', label: 'Courier', icon: Truck },
];

const tabClass = (active: boolean) =>
  `flex flex-col items-center justify-center w-14 py-1 rounded-lg transition-colors ${
    active
      ? 'text-primary dark:text-primary-tint font-bold'
      : 'text-light-text-muted dark:text-dark-text-muted hover:text-light-text dark:hover:text-dark-text'
  }`;

/** Phone navigation. More opens the full menu, so every screen stays reachable on a phone. */
export const BottomTabs: React.FC<BottomTabsProps> = ({ activeTab, onSelectTab }) => {
  const [moreOpen, setMoreOpen] = useState<boolean>(false);

  // DESIGN.md: bottom tabs are hidden during a sale / in POS
  if (activeTab === 'pos') {
    return null;
  }

  const inMore = !TABS.some((t) => t.id === activeTab);

  return (
    <>
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-light-surface dark:bg-dark-surface border-t border-light-border dark:border-dark-border z-30 flex items-center justify-around px-2"
        style={{ paddingBottom: 'var(--safe-bottom)' }}
        aria-label="Mobile Navigation Tabs"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              type="button"
              data-testid={`mobile-nav-${tab.id}`}
              onClick={() => onSelectTab(tab.id)}
              aria-current={activeTab === tab.id ? 'page' : undefined}
              className={tabClass(activeTab === tab.id)}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">{tab.label}</span>
            </button>
          );
        })}
        <button
          type="button"
          data-testid="mobile-nav-more"
          onClick={() => setMoreOpen(true)}
          aria-haspopup="dialog"
          className={tabClass(inMore)}
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
      </nav>

      {moreOpen && (
        <Sheet title="Menu" onClose={() => setMoreOpen(false)} testId="more-menu">
          <div className="grid grid-cols-1 gap-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  data-testid={`more-nav-${item.id}`}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    setMoreOpen(false);
                    onSelectTab(item.id);
                  }}
                  className={`h-12 px-3 rounded-xl flex items-center space-x-3 text-sm font-semibold text-left ${
                    active
                      ? 'bg-primary text-on-primary'
                      : 'hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover'
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>
        </Sheet>
      )}
    </>
  );
};
