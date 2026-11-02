/**
 * Page items produced by the pagination truncation algorithm.
 * Either a 1-based page number or an ellipsis indicator ('...').
 */
export type PageItem = number | typeof DOTS;

export const DOTS = '...';

/**
 * Core pagination props accepted by the Pagination component.
 */
export interface PaginationProps {
  /**
   * Total number of items across all pages.
   */
  totalItems: number;

  /**
   * Current active 1-based page index.
   */
  currentPage: number;

  /**
   * Number of items displayed per page. Default 25.
   */
  pageSize: number;

  /**
   * Callback fired when the user selects or navigates to a new page.
   */
  onPageChange: (page: number) => void;

  /**
   * Callback fired when the user selects a new page size from the dropdown.
   * Total pages is recalculated and the page resets to 1.
   */
  onPageSizeChange: (size: number) => void;

  /**
   * Available options for rows per page. Defaults to [10, 25, 50, 100].
   */
  pageSizeOptions?: number[];

  /**
   * Number of adjacent page numbers shown beside the current page.
   * Default: 1 (e.g., currentPage - 1, currentPage, currentPage + 1).
   */
  siblingCount?: number;

  /**
   * Number of boundary page numbers shown at the start and end.
   * Default: 1 (shows page 1 and page totalPages).
   */
  boundaryCount?: number;

  /**
   * Whether all pagination controls are globally disabled (e.g. during loading).
   */
  disabled?: boolean;

  /**
   * Whether to display the stats counter text (e.g. 'Showing 26–50 of 250 items').
   * Default: true.
   */
  showStats?: boolean;

  /**
   * Whether to display the rows per page dropdown selector.
   * Default: true.
   */
  showPageSizeSelector?: boolean;

  /**
   * Whether to display quick jump to First and Last page buttons.
   * Default: false.
   */
  showQuickJump?: boolean;

  /**
   * Custom noun for items (e.g. "items", "records", "transactions", "parcels").
   * Default: "items".
   */
  itemLabel?: string;

  /**
   * Custom plural noun if different from itemLabel + 's'.
   */
  itemLabelPlural?: string;

  /**
   * Additional custom CSS classes for the outer container.
   */
  className?: string;

  /**
   * Optional id for the container.
   */
  id?: string;
}

/**
 * Options for the usePagination custom hook.
 */
export interface UsePaginationOptions {
  totalItems: number;
  pageSize: number;
  currentPage: number;
  siblingCount?: number;
  boundaryCount?: number;
}

/**
 * Return value of the usePagination hook.
 */
export interface UsePaginationReturn {
  totalPages: number;
  validCurrentPage: number;
  startItem: number;
  endItem: number;
  paginationRange: PageItem[];
  isFirstPage: boolean;
  isLastPage: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  statsText: string;
}

/**
 * Props for the PaginationStats subcomponent.
 */
export interface PaginationStatsProps {
  startItem: number;
  endItem: number;
  totalItems: number;
  itemLabel?: string;
  itemLabelPlural?: string;
  className?: string;
}

/**
 * Props for the PageSizeSelector subcomponent.
 */
export interface PageSizeSelectorProps {
  pageSize: number;
  totalItems: number;
  onPageSizeChange: (size: number) => void;
  onPageChange: (page: number) => void;
  options?: number[];
  disabled?: boolean;
  label?: string;
  id?: string;
  className?: string;
}

/**
 * Props for the PaginationNav subcomponent.
 */
export interface PaginationNavProps {
  currentPage: number;
  totalPages: number;
  paginationRange: PageItem[];
  onPageChange: (page: number) => void;
  disabled?: boolean;
  showQuickJump?: boolean;
  className?: string;
}
