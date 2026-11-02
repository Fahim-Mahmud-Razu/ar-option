import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MoreHorizontal } from 'lucide-react';
import { DOTS, PaginationNavProps } from './types';

/**
 * Accessible pagination navigation controls.
 * Displays Previous, smart truncated page numbers, and Next.
 * Disables Previous on page 1 and Next on the final page.
 */
export const PaginationNav: React.FC<PaginationNavProps> = ({
  currentPage,
  totalPages,
  paginationRange,
  onPageChange,
  disabled = false,
  showQuickJump = false,
  className = '',
}) => {
  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  return (
    <nav
      role="navigation"
      aria-label="Pagination Navigation"
      className={`inline-flex items-center space-x-1 sm:space-x-1.5 select-none ${className}`}
    >
      {/* Optional Jump to First Page */}
      {showQuickJump && (
        <button
          type="button"
          onClick={() => onPageChange(1)}
          disabled={isFirstPage || disabled}
          aria-label="Go to first page"
          className="inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-lg text-xs font-medium
            border border-light-border dark:border-dark-border
            text-light-text-muted dark:text-dark-text-muted
            hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover hover:text-light-text dark:hover:text-dark-text
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
            transition-colors"
        >
          <ChevronsLeft className="w-4 h-4" aria-hidden="true" />
        </button>
      )}

      {/* Previous Page Button */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={isFirstPage || disabled}
        aria-label="Previous page"
        className="inline-flex items-center justify-center space-x-1 h-8 px-2 sm:h-9 sm:px-3 rounded-lg text-xs font-semibold
          border border-light-border dark:border-dark-border
          text-light-text dark:text-dark-text
          hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover hover:border-primary/40
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-light-border dark:disabled:hover:border-dark-border
          transition-colors"
      >
        <ChevronLeft className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
        <span className="hidden xs:inline sm:inline">Previous</span>
      </button>

      {/* Truncated Page Numbers */}
      <div className="inline-flex items-center space-x-1 sm:space-x-1.5">
        {paginationRange.map((pageItem, index) => {
          if (pageItem === DOTS) {
            return (
              <span
                key={`dots-${index}`}
                aria-hidden="true"
                className="inline-flex items-center justify-center h-8 w-6 sm:h-9 sm:w-8 text-light-text-muted dark:text-dark-text-muted"
              >
                <MoreHorizontal className="w-4 h-4" />
                <span className="sr-only">More pages</span>
              </span>
            );
          }

          const pageNumber = pageItem as number;
          const isCurrent = pageNumber === currentPage;

          return (
            <button
              key={pageNumber}
              type="button"
              onClick={() => onPageChange(pageNumber)}
              disabled={disabled}
              aria-current={isCurrent ? 'page' : undefined}
              aria-label={isCurrent ? `Page ${pageNumber}, current page` : `Go to page ${pageNumber}`}
              className={`inline-flex items-center justify-center min-w-[2rem] sm:min-w-[2.25rem] h-8 sm:h-9 px-2 rounded-lg text-xs font-bold tabular-nums transition-colors
                focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface
                ${
                  isCurrent
                    ? 'bg-primary text-on-primary shadow-sm hover:bg-primary-hover border border-primary'
                    : 'border border-light-border dark:border-dark-border text-light-text dark:text-dark-text hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover hover:border-primary/40'
                }
                ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              {pageNumber}
            </button>
          );
        })}
      </div>

      {/* Next Page Button */}
      <button
        type="button"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={isLastPage || disabled}
        aria-label="Next page"
        className="inline-flex items-center justify-center space-x-1 h-8 px-2 sm:h-9 sm:px-3 rounded-lg text-xs font-semibold
          border border-light-border dark:border-dark-border
          text-light-text dark:text-dark-text
          hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover hover:border-primary/40
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface
          disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:border-light-border dark:disabled:hover:border-dark-border
          transition-colors"
      >
        <span className="hidden xs:inline sm:inline">Next</span>
        <ChevronRight className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
      </button>

      {/* Optional Jump to Last Page */}
      {showQuickJump && (
        <button
          type="button"
          onClick={() => onPageChange(totalPages)}
          disabled={isLastPage || disabled}
          aria-label="Go to last page"
          className="inline-flex items-center justify-center h-8 w-8 sm:h-9 sm:w-9 rounded-lg text-xs font-medium
            border border-light-border dark:border-dark-border
            text-light-text-muted dark:text-dark-text-muted
            hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover hover:text-light-text dark:hover:text-dark-text
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 dark:focus-visible:ring-offset-dark-surface
            disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent
            transition-colors"
        >
          <ChevronsRight className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </nav>
  );
};

