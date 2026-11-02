import { useMemo } from 'react';
import { DOTS, PageItem, UsePaginationOptions, UsePaginationReturn } from './types';

/**
 * Helper to generate an array of numbers in the range [start, end] inclusive.
 */
function range(start: number, end: number): number[] {
  if (start > end) return [];
  const length = end - start + 1;
  return Array.from({ length }, (_, idx) => start + idx);
}

/**
 * Custom hook to calculate pagination values, ranges with smart truncation,
 * item boundaries, and descriptive statistics.
 */
export function usePagination({
  totalItems,
  pageSize,
  currentPage,
  siblingCount = 1,
  boundaryCount = 1,
}: UsePaginationOptions): UsePaginationReturn {
  // Guard against non-positive pageSize
  const safePageSize = pageSize > 0 ? pageSize : 25;
  const safeTotalItems = Math.max(0, totalItems);

  // Recalculate total pages. If 0 items, total pages is 1 (empty single page).
  const totalPages = Math.max(1, Math.ceil(safeTotalItems / safePageSize));

  // Clamp current page to [1, totalPages]
  const validCurrentPage = Math.min(Math.max(1, currentPage), totalPages);

  // Calculate 1-based start and end item indexes
  const startItem = safeTotalItems === 0 ? 0 : (validCurrentPage - 1) * safePageSize + 1;
  const endItem = safeTotalItems === 0 ? 0 : Math.min(validCurrentPage * safePageSize, safeTotalItems);

  // Calculate the smart truncated pagination range
  const paginationRange = useMemo<PageItem[]>(() => {
    // Total blocks required if displaying everything without truncation:
    // siblingCount * 2 + boundaryCount * 2 + 1 (current) + 2 (two DOTS)
    const totalSlots = siblingCount * 2 + boundaryCount * 2 + 3;

    // Case 1: If total pages is less than or equal to total slots, show all numbers
    if (totalPages <= totalSlots) {
      return range(1, totalPages);
    }

    // Determine left and right sibling boundaries
    const leftSiblingIndex = Math.max(validCurrentPage - siblingCount, boundaryCount + 1);
    const rightSiblingIndex = Math.min(validCurrentPage + siblingCount, totalPages - boundaryCount);

    // Only show DOTS when there is a true gap of more than 1 page
    const shouldShowLeftDots = leftSiblingIndex > boundaryCount + 2;
    const shouldShowRightDots = rightSiblingIndex < totalPages - boundaryCount - 1;

    const leftBoundary = range(1, boundaryCount);
    const rightBoundary = range(totalPages - boundaryCount + 1, totalPages);

    // Case 2: Near start -> No left dots, but right dots needed
    // e.g., 1, 2, 3, 4, 5, ..., 10
    if (!shouldShowLeftDots && shouldShowRightDots) {
      const leftItemCount = boundaryCount + siblingCount * 2 + 2;
      const leftRange = range(1, leftItemCount);
      return [...leftRange, DOTS, ...rightBoundary];
    }

    // Case 3: Near end -> Left dots needed, but no right dots
    // e.g., 1, ..., 6, 7, 8, 9, 10
    if (shouldShowLeftDots && !shouldShowRightDots) {
      const rightItemCount = boundaryCount + siblingCount * 2 + 2;
      const rightRange = range(totalPages - rightItemCount + 1, totalPages);
      return [...leftBoundary, DOTS, ...rightRange];
    }

    // Case 4: In middle -> Both left and right dots needed
    // e.g., 1, ..., 4, 5, 6, ..., 10
    if (shouldShowLeftDots && shouldShowRightDots) {
      const middleRange = range(leftSiblingIndex, rightSiblingIndex);
      return [...leftBoundary, DOTS, ...middleRange, DOTS, ...rightBoundary];
    }

    return range(1, totalPages);
  }, [totalPages, validCurrentPage, siblingCount, boundaryCount]);

  const isFirstPage = validCurrentPage <= 1;
  const isLastPage = validCurrentPage >= totalPages;
  const hasPrevious = !isFirstPage && safeTotalItems > 0;
  const hasNext = !isLastPage && safeTotalItems > 0;

  // Format the stats string (e.g. 'Showing 26–50 of 250 items')
  const statsText = useMemo(() => {
    if (safeTotalItems === 0) {
      return 'Showing 0 of 0 items';
    }
    if (safeTotalItems === 1) {
      return 'Showing 1 of 1 item';
    }
    return `Showing ${startItem}–${endItem} of ${safeTotalItems} items`;
  }, [safeTotalItems, startItem, endItem]);

  return {
    totalPages,
    validCurrentPage,
    startItem,
    endItem,
    paginationRange,
    isFirstPage,
    isLastPage,
    hasPrevious,
    hasNext,
    statsText,
  };
}

