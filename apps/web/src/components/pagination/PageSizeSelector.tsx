import React, { useId } from 'react';
import { ChevronDown } from 'lucide-react';
import { PageSizeSelectorProps } from './types';

const DEFAULT_OPTIONS = [10, 25, 50, 100];

/**
 * Dropdown selector for rows per page.
 * Options default to [10, 25, 50, 100].
 * Changing the page size recalculates the total pages and resets the current page to 1.
 */
export const PageSizeSelector: React.FC<PageSizeSelectorProps> = ({
  pageSize,
  totalItems,
  onPageSizeChange,
  onPageChange,
  options = DEFAULT_OPTIONS,
  disabled = false,
  label = 'Rows per page:',
  id,
  className = '',
}) => {
  const generatedId = useId();
  const selectId = id || `page-size-selector-${generatedId}`;

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newSize = parseInt(e.target.value, 10);
    if (!Number.isNaN(newSize) && newSize > 0) {
      // Recalculates total pages and resets to page 1
      onPageSizeChange(newSize);
      onPageChange(1);
    }
  };

  return (
    <div className={`flex items-center space-x-2 text-xs sm:text-sm text-light-text-muted dark:text-dark-text-muted ${className}`}>
      <label htmlFor={selectId} className="whitespace-nowrap font-medium select-none">
        {label}
      </label>
      <div className="relative inline-flex items-center">
        <select
          id={selectId}
          value={pageSize}
          onChange={handleChange}
          disabled={disabled || totalItems === 0}
          aria-label={label}
          className="h-8 sm:h-9 pl-2.5 pr-7 py-1 text-xs sm:text-sm font-semibold rounded-lg appearance-none cursor-pointer
            bg-light-surface dark:bg-dark-surface
            border border-light-border dark:border-dark-border
            text-light-text dark:text-dark-text
            hover:border-primary/50 dark:hover:border-primary/50
            focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-light-border
            transition-colors tabular-nums"
        >
          {options.map((option) => (
            <option key={option} value={option} className="bg-light-surface dark:bg-dark-surface">
              {option}
            </option>
          ))}
        </select>
        <ChevronDown
          className="w-3.5 h-3.5 absolute right-2 text-light-text-muted dark:text-dark-text-muted pointer-events-none"
          aria-hidden="true"
        />
      </div>
    </div>
  );
};

