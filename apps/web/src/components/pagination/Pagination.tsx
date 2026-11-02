import React from 'react';
import { PaginationProps } from './types';
import { usePagination } from './usePagination';
import { PaginationStats } from './PaginationStats';
import { PageSizeSelector } from './PageSizeSelector';
import { PaginationNav } from './PaginationNav';

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

/**
 * Responsive, accessible Pagination Control System in React using Tailwind CSS.
 *
 * Features:
 * - Rows per page selector: dropdown with options [10, 25, 50, 100], defaulting to 25.
 *   Changing page size recalculates total pages and resets current page to 1.
 * - Navigation: Previous, smart-truncated page numbers (1, 2, ... 8, 9, 10), Next.
 *   Disables Previous on page 1 and Next on final page.
 * - Display stats: "Showing 26–50 of 250 items".
 * - Fully accessible ARIA roles, states, and keyboard navigation.
 * - Responsive layout adapted for mobile phones, tablets, and desktop displays.
 */
export const Pagination: React.FC<PaginationProps> = ({
  totalItems,
  currentPage,
  pageSize = 25,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  siblingCount = 1,
  boundaryCount = 1,
  disabled = false,
  showStats = true,
  showPageSizeSelector = true,
  showQuickJump = false,
  itemLabel = 'item',
  itemLabelPlural = 'items',
  className = '',
  id,
}) => {
  const {
    totalPages,
    validCurrentPage,
    startItem,
    endItem,
    paginationRange,
  } = usePagination({
    totalItems,
    pageSize,
    currentPage,
    siblingCount,
    boundaryCount,
  });

  return (
    <div
      id={id}
      className={`w-full flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4
        bg-light-surface dark:bg-dark-surface
        border-t border-light-border dark:border-dark-border
        text-light-text dark:text-dark-text
        transition-colors ${className}`}
    >
      {/* Left Section: Stats Display */}
      {showStats && (
        <div className="w-full sm:w-auto flex items-center justify-center sm:justify-start">
          <PaginationStats
            startItem={startItem}
            endItem={endItem}
            totalItems={totalItems}
            itemLabel={itemLabel}
            itemLabelPlural={itemLabelPlural}
          />
        </div>
      )}

      {/* Right Section: Page Size Selector + Navigation Controls */}
      <div className="w-full sm:w-auto flex flex-wrap items-center justify-center sm:justify-end gap-3 sm:gap-4">
        {showPageSizeSelector && (
          <PageSizeSelector
            pageSize={pageSize}
            totalItems={totalItems}
            onPageSizeChange={onPageSizeChange}
            onPageChange={onPageChange}
            options={pageSizeOptions}
            disabled={disabled}
          />
        )}

        {/* Navigation Controls: Previous, Smart-truncated numbers, Next */}
        <PaginationNav
          currentPage={validCurrentPage}
          totalPages={totalPages}
          paginationRange={paginationRange}
          onPageChange={onPageChange}
          disabled={disabled || totalItems === 0}
          showQuickJump={showQuickJump}
        />
      </div>
    </div>
  );
};
