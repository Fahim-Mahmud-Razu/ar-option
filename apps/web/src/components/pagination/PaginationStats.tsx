import React from 'react';
import { PaginationStatsProps } from './types';

/**
 * Renders data table stats, e.g.: "Showing 26–50 of 250 items"
 * Uses tabular numbers for stable visual widths and supports singular/plural labels.
 */
export const PaginationStats: React.FC<PaginationStatsProps> = ({
  startItem,
  endItem,
  totalItems,
  itemLabel = 'item',
  itemLabelPlural = 'items',
  className = '',
}) => {
  const isSingle = totalItems === 1;
  const label = isSingle ? itemLabel : itemLabelPlural;

  if (totalItems === 0) {
    return (
      <div
        className={`text-xs sm:text-sm text-light-text-muted dark:text-dark-text-muted select-none ${className}`}
        aria-live="polite"
        aria-atomic="true"
      >
        Showing <span className="font-semibold text-light-text dark:text-dark-text tabular-nums">0</span> of{' '}
        <span className="font-semibold text-light-text dark:text-dark-text tabular-nums">0</span> {label}
      </div>
    );
  }

  return (
    <div
      className={`text-xs sm:text-sm text-light-text-muted dark:text-dark-text-muted select-none ${className}`}
      aria-live="polite"
      aria-atomic="true"
    >
      Showing{' '}
      <span className="font-semibold text-light-text dark:text-dark-text tabular-nums">
        {startItem}–{endItem}
      </span>{' '}
      of{' '}
      <span className="font-semibold text-light-text dark:text-dark-text tabular-nums">
        {totalItems.toLocaleString()}
      </span>{' '}
      {label}
    </div>
  );
};

