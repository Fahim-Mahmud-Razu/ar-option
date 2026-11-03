import React from 'react';
import { Clock, Play, Trash2, ShoppingCart } from 'lucide-react';
import { Sheet } from '../Sheet';
import { taka } from '../../lib/money';
import { sizeLabel, useSizes } from '../../lib/settings';
import type { SuspendedCart } from './types';

interface SuspendedCartsModalProps {
  carts: SuspendedCart[];
  onClose: () => void;
  onResume: (cart: SuspendedCart) => void;
  onDiscard: (id: string) => void;
}

export const SuspendedCartsModal: React.FC<SuspendedCartsModalProps> = ({
  carts,
  onClose,
  onResume,
  onDiscard,
}) => {
  const sizesOn = useSizes();
  return (
    <Sheet title={`Suspended Carts (${carts.length})`} onClose={onClose} testId="suspended-carts-modal">
      <div className="space-y-3">
        <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
          Suspended carts are parked on this device only. They have no money or stock effect until completed.
        </p>

        {carts.length === 0 ? (
          <div className="p-8 text-center text-sm text-light-text-muted rounded-xl border border-dashed border-light-border dark:border-dark-border">
            No parked carts for this shop.
          </div>
        ) : (
          <div className="space-y-3">
            {carts.map((cart) => {
              const itemCount = cart.items.reduce((s, i) => s + i.quantity, 0);
              const custName = cart.customer?.name || 'Walk-in Customer';
              const timeStr = new Date(cart.suspended_at).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              });

              return (
                <div
                  key={cart.id}
                  className="p-4 rounded-xl border border-light-border dark:border-dark-border bg-light-surface dark:bg-dark-surface space-y-3"
                  data-testid="suspended-cart-item"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm flex items-center gap-1.5">
                        <ShoppingCart className="w-4 h-4 text-primary dark:text-primary-tint" />
                        <span>{custName}</span>
                      </div>
                      <div className="text-xs text-light-text-muted flex items-center gap-1 mt-0.5">
                        <Clock className="w-3 h-3" />
                        <span>Parked at {timeStr}</span>
                        <span>· {itemCount} items</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-xs text-light-text-muted">Total</span>
                      <div className="font-mono font-extrabold text-base text-primary dark:text-primary-tint">
                        {taka(cart.total)}
                      </div>
                    </div>
                  </div>

                  {/* Items summary */}
                  <div className="text-xs text-light-text-muted truncate">
                    {cart.items.map((i) => `${i.product_name}${sizeLabel(i.size, sizesOn) ? ` (${sizeLabel(i.size, sizesOn)})` : ''} × ${i.quantity}`).join(', ')}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-light-border dark:border-dark-border">
                    <button
                      type="button"
                      onClick={() => onDiscard(cart.id)}
                      className="h-9 px-3 rounded-lg border border-danger/30 text-danger text-xs font-semibold hover:bg-danger/10 flex items-center gap-1.5"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Discard</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onResume(cart)}
                      data-testid="resume-cart-button"
                      className="h-9 px-4 rounded-lg bg-primary text-on-primary text-xs font-bold hover:bg-primary-hover flex items-center gap-1.5"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Resume</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
};

