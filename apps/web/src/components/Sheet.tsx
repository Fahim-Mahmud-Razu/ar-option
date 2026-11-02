import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

interface SheetProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Long forms are full-screen on phones. Short choices are a bottom sheet. */
  long?: boolean;
  testId?: string;
}

/**
 * Bottom sheet on phones, centred dialog from 768px. The sheet takes one history entry,
 * so the Android back gesture and Esc close it before anything underneath.
 */
export const Sheet: React.FC<SheetProps> = ({ title, onClose, children, footer, long, testId }) => {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const panelRef = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);
  const popped = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const opener = document.activeElement as HTMLElement | null;
    if (!pushed.current) {
      window.history.pushState({ sheet: true }, '');
      pushed.current = true;
    }
    const handlePop = () => {
      popped.current = true;
      onCloseRef.current();
    };
    window.addEventListener('popstate', handlePop);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector<HTMLElement>('input, select, textarea, button:not([data-close])')?.focus();

    return () => {
      mounted.current = false;
      window.removeEventListener('popstate', handlePop);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
      // A parent that removes the sheet without a back press leaves our history entry behind.
      // The timeout lets React's development double-mount settle first.
      setTimeout(() => {
        if (!mounted.current && pushed.current && !popped.current) {
          pushed.current = false;
          window.history.back();
        }
      }, 0);
    };
  }, []);

  const requestClose = () => {
    if (pushed.current && !popped.current) window.history.back();
    else onCloseRef.current();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        requestClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" data-testid={testId}>
      <div className="absolute inset-0 bg-black/50" onClick={requestClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative w-full flex flex-col bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-xl overscroll-contain
          ${long ? 'h-[100dvh] md:h-auto rounded-none' : 'max-h-[85dvh] rounded-t-2xl'}
          md:max-h-[92dvh] md:max-w-xl md:rounded-2xl`}
      >
        {!long && <div className="md:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-light-border dark:bg-dark-border" />}
        <div className="flex items-center justify-between px-4 py-3 border-b border-light-border dark:border-dark-border">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            type="button"
            data-close
            aria-label="Close"
            onClick={requestClose}
            className="h-11 w-11 -mr-2 flex items-center justify-center rounded-xl text-light-text-muted hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>
        {footer && (
          <div className="px-4 py-3 border-t border-light-border dark:border-dark-border pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
