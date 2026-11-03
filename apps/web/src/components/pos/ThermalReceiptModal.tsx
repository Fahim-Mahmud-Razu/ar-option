import React from 'react';
import { Printer, RotateCcw } from 'lucide-react';
import type { Sale } from '@ar-option/shared-types';
import { taka } from '../../lib/money';
import { sizeLabel, useSizes } from '../../lib/settings';

interface ThermalReceiptModalProps {
  sale: Sale;
  onClose: () => void;
}

export const ThermalReceiptModal: React.FC<ThermalReceiptModalProps> = ({ sale, onClose }) => {
  const sizesOn = useSizes();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 animate-in fade-in">
      <div className="w-full max-w-sm bg-white text-black p-6 rounded-xl shadow-2xl font-mono text-xs space-y-4 max-h-[95dvh] overflow-y-auto">
        {/* Header: Shop Name & sequential invoice */}
        <div className="text-center space-y-1 pb-3 border-b border-dashed border-black/40">
          <h2 className="text-base font-extrabold tracking-wider uppercase">AR OPTION</h2>
          <p className="text-[11px] font-semibold">{sale.shop_name}</p>
          <div className="pt-2 text-[11px] font-bold">
            RECEIPT #{sale.invoice_number}
          </div>
          <p className="text-[10px] text-gray-600">
            {new Date(sale.created_at).toLocaleString()}
          </p>
        </div>

        {/* Customer Info */}
        <div className="text-[10px] space-y-0.5 pb-2 border-b border-dashed border-black/40">
          <div>Customer: {sale.customer_name}</div>
          {sale.customer_phone && <div>Phone: {sale.customer_phone}</div>}
          <div>Cashier: #{sale.created_by}</div>
        </div>

        {/* Itemized lines */}
        <div className="space-y-1.5 pb-3 border-b border-dashed border-black/40">
          <div className="flex justify-between font-bold text-[10px] uppercase border-b border-black/20 pb-1">
            <span>{sizesOn ? 'Item [Size]' : 'Item'}</span>
            <span className="text-right">Qty x Price = Total</span>
          </div>
          {sale.items?.map((item) => (
            <div key={item.id} className="text-[11px] space-y-0.5">
              <div className="font-semibold truncate">
                {item.product_name}{sizeLabel(item.size, sizesOn) ? ` [${sizeLabel(item.size, sizesOn)}]` : ''}
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-gray-600 font-mono">
                  {item.quantity} x {taka(item.unit_price)}
                </span>
                <span className="font-bold font-mono">
                  {taka(item.total)}
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Totals Calculation */}
        <div className="space-y-1 text-[11px] pb-3 border-b border-dashed border-black/40">
          <div className="flex justify-between">
            <span>Subtotal:</span>
            <span className="font-mono">{taka(sale.subtotal)}</span>
          </div>
          {sale.discount_amount > 0 && (
            <div className="flex justify-between text-rose-600">
              <span>Discount:</span>
              <span className="font-mono">-{taka(sale.discount_amount)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm font-extrabold pt-1 border-t border-black/20">
            <span>TOTAL:</span>
            <span className="font-mono">{taka(sale.total_amount)}</span>
          </div>

          {/* Payment Split */}
          {sale.payments && sale.payments.length > 0 ? (
            <div className="pt-1 border-t border-dashed border-black/20 space-y-0.5">
              <div className="font-bold text-[10px] uppercase text-gray-700">Payment breakdown:</div>
              {sale.payments.map((p, idx) => (
                <div key={idx} className="flex justify-between text-[10px]">
                  <span>{p.payment_account_name || p.payment_method || 'Payment'}:</span>
                  <span className="font-mono font-semibold">{taka(p.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex justify-between font-bold text-[10px] pt-1">
              <span>PAID ({sale.payment_account_name || 'Cash'}):</span>
              <span className="font-mono">{taka(sale.paid_amount)}</span>
            </div>
          )}
        </div>

        {/* Policy & System verification */}
        <div className="text-center text-[9px] text-gray-700 space-y-1 pb-2">
          <p>Thank you for shopping at AR Option!</p>
          <p>Exchange policy: 7 days with original receipt and tags attached.</p>
          <p className="text-[8px] text-gray-500">System generated receipt • Rule 7 Verified</p>
        </div>

        {/* Action Buttons: Print & Close */}
        <div className="pt-2 grid grid-cols-2 gap-2 print:hidden font-sans">
          <button
            type="button"
            onClick={() => window.print()}
            className="h-10 bg-black text-white rounded-lg font-bold text-xs flex items-center justify-center space-x-1.5 hover:bg-gray-800 transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>Print (80mm)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 bg-gray-200 text-black rounded-lg font-bold text-xs flex items-center justify-center space-x-1 hover:bg-gray-300 transition-colors"
          >
            <RotateCcw className="w-4 h-4" />
            <span>New Sale</span>
          </button>
        </div>
      </div>
    </div>
  );
};
