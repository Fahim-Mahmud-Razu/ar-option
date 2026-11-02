import React, { useState, useMemo } from 'react';
import { Search, Filter, AlertCircle, CheckCircle2, Clock, Truck } from 'lucide-react';
import { Pagination } from './Pagination';

interface QueueItem {
  id: string;
  orderNumber: string;
  customerName: string;
  destination: string;
  itemCount: number;
  totalAmount: number;
  status: 'pending' | 'processing' | 'shipped' | 'delivered';
  createdAt: string;
}

// Generate realistic mock dataset for queue demonstrations
const generateMockQueue = (count: number): QueueItem[] => {
  const statuses: QueueItem['status'][] = ['pending', 'processing', 'shipped', 'delivered'];
  const cities = ['Dhaka', 'Chittagong', 'Sylhet', 'Rajshahi', 'Khulna', 'Barisal', 'Gazipur', 'Narayanganj'];
  const names = ['Karim Ahmed', 'Fatima Begum', 'Tanvir Hasan', 'Nusrat Jahan', 'Rahim Mia', 'Sadia Islam', 'Arif Chowdhury'];

  return Array.from({ length: count }, (_, index) => {
    const idNum = index + 1;
    const status = statuses[idNum % statuses.length];
    const city = cities[idNum % cities.length];
    const customer = names[idNum % names.length];
    const amount = 850 + (idNum * 137) % 7500;
    const items = 1 + (idNum % 6);

    return {
      id: `QUE-${String(idNum).padStart(6, '0')}`,
      orderNumber: `ORD-${2026000 + idNum}`,
      customerName: customer,
      destination: city,
      itemCount: items,
      totalAmount: amount,
      status,
      createdAt: new Date(Date.now() - (count - index) * 3600000).toISOString(),
    };
  });
};

export const DataTableExample: React.FC = () => {
  const [totalQueueSize, setTotalQueueSize] = useState<number>(250);
  const [items, setItems] = useState<QueueItem[]>(() => generateMockQueue(250));
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);

  // Filter items based on search and status
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesSearch =
        item.orderNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.destination.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [items, searchTerm, statusFilter]);

  // Paginated slice for current page
  const paginatedItems = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredItems.slice(startIndex, startIndex + pageSize);
  }, [filteredItems, currentPage, pageSize]);

  // Handlers for switching simulated dataset sizes
  const handleDatasetSizeChange = (newSize: number) => {
    setTotalQueueSize(newSize);
    setItems(generateMockQueue(newSize));
    setCurrentPage(1);
  };

  const getStatusBadge = (status: QueueItem['status']) => {
    switch (status) {
      case 'delivered':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-3 h-3" />
            <span>Delivered</span>
          </span>
        );
      case 'shipped':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
            <Truck className="w-3 h-3" />
            <span>Shipped</span>
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
            <Clock className="w-3 h-3" />
            <span>Processing</span>
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
            <AlertCircle className="w-3 h-3" />
            <span>Pending</span>
          </span>
        );
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-4 p-4 sm:p-6 font-sans">
      {/* Header & Queue Simulator Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-light-surface dark:bg-dark-surface p-4 rounded-2xl border border-light-border dark:border-dark-border shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-light-text dark:text-dark-text flex items-center space-x-2">
            <span>Parcel Dispatch Queue</span>
            <span className="text-xs px-2 py-0.5 rounded-md bg-primary/10 text-primary dark:text-primary-tint font-mono font-bold">
              {filteredItems.length} in queue
            </span>
          </h2>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-0.5">
            Demonstrating responsive pagination with smart truncation and dynamic rows per page.
          </p>
        </div>

        {/* Quick Size Preset Simulator */}
        <div className="flex items-center space-x-2 text-xs">
          <span className="text-light-text-muted dark:text-dark-text-muted font-medium">Test size:</span>
          <button
            type="button"
            onClick={() => handleDatasetSizeChange(0)}
            className={`px-2.5 py-1 rounded-lg font-semibold border ${
              totalQueueSize === 0
                ? 'bg-primary text-on-primary border-primary'
                : 'border-light-border dark:border-dark-border text-light-text dark:text-dark-text'
            }`}
          >
            0
          </button>
          <button
            type="button"
            onClick={() => handleDatasetSizeChange(25)}
            className={`px-2.5 py-1 rounded-lg font-semibold border ${
              totalQueueSize === 25
                ? 'bg-primary text-on-primary border-primary'
                : 'border-light-border dark:border-dark-border text-light-text dark:text-dark-text'
            }`}
          >
            25
          </button>
          <button
            type="button"
            onClick={() => handleDatasetSizeChange(250)}
            className={`px-2.5 py-1 rounded-lg font-semibold border ${
              totalQueueSize === 250
                ? 'bg-primary text-on-primary border-primary'
                : 'border-light-border dark:border-dark-border text-light-text dark:text-dark-text'
            }`}
          >
            250
          </button>
          <button
            type="button"
            onClick={() => handleDatasetSizeChange(1500)}
            className={`px-2.5 py-1 rounded-lg font-semibold border ${
              totalQueueSize === 1500
                ? 'bg-primary text-on-primary border-primary'
                : 'border-light-border dark:border-dark-border text-light-text dark:text-dark-text'
            }`}
          >
            1,500
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-light-surface dark:bg-dark-surface p-3 rounded-xl border border-light-border dark:border-dark-border">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-light-text-muted dark:text-dark-text-muted" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1); // Reset page on filter
            }}
            placeholder="Search order #, customer, queue ID, city..."
            className="w-full h-9 pl-9 pr-3 rounded-lg text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Status Filter */}
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-light-text-muted dark:text-dark-text-muted" />
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setCurrentPage(1); // Reset page on filter
            }}
            className="h-9 px-3 rounded-lg text-xs font-semibold bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="processing">Processing</option>
            <option value="shipped">Shipped</option>
            <option value="delivered">Delivered</option>
          </select>
        </div>
      </div>

      {/* Data Table Container */}
      <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border shadow-sm overflow-hidden">
        {paginatedItems.length === 0 ? (
          <div className="p-12 text-center text-xs text-light-text-muted dark:text-dark-text-muted space-y-2">
            <p className="font-semibold text-sm text-light-text dark:text-dark-text">No items found in queue</p>
            <p>Try clearing filters or search query.</p>
          </div>
        ) : (
          <>
            {/* Desktop / Tablet Table View */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs font-sans">
                <thead>
                  <tr className="border-b border-light-border dark:border-dark-border text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider bg-light-surface-hover/50 dark:bg-dark-surface-hover/50">
                    <th scope="col" className="py-3 px-4 font-semibold">Queue Ref</th>
                    <th scope="col" className="py-3 px-4 font-semibold">Order</th>
                    <th scope="col" className="py-3 px-4 font-semibold">Customer & Destination</th>
                    <th scope="col" className="py-3 px-4 font-semibold text-center">Items</th>
                    <th scope="col" className="py-3 px-4 font-semibold text-right">Amount (৳)</th>
                    <th scope="col" className="py-3 px-4 font-semibold">Status</th>
                    <th scope="col" className="py-3 px-4 font-semibold text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-border dark:divide-dark-border">
                  {paginatedItems.map((item) => (
                    <tr
                      key={item.id}
                      className="hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-primary dark:text-primary-tint">
                        {item.id}
                      </td>
                      <td className="py-3 px-4 font-mono text-light-text dark:text-dark-text font-medium">
                        {item.orderNumber}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-light-text dark:text-dark-text">{item.customerName}</div>
                        <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted">{item.destination}</div>
                      </td>
                      <td className="py-3 px-4 text-center font-mono tabular-nums font-semibold">
                        {item.itemCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-light-text dark:text-dark-text tabular-nums">
                        ৳{item.totalAmount.toLocaleString()}
                      </td>
                      <td className="py-3 px-4">
                        {getStatusBadge(item.status)}
                      </td>
                      <td className="py-3 px-4 text-right text-[11px] font-mono text-light-text-muted dark:text-dark-text-muted">
                        {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List View (< 640px) */}
            <div className="sm:hidden divide-y divide-light-border dark:divide-dark-border">
              {paginatedItems.map((item) => (
                <div key={item.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-primary dark:text-primary-tint">
                      {item.id}
                    </span>
                    {getStatusBadge(item.status)}
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-light-text dark:text-dark-text">
                        {item.customerName}
                      </div>
                      <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted">
                        {item.orderNumber} • {item.destination}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-mono font-bold text-light-text dark:text-dark-text">
                        ৳{item.totalAmount.toLocaleString()}
                      </div>
                      <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted font-mono">
                        {item.itemCount} pcs
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Modular Pagination Control System */}
        <Pagination
          totalItems={filteredItems.length}
          currentPage={currentPage}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[10, 25, 50, 100]}
          itemLabel="parcel"
          itemLabelPlural="parcels"
        />
      </div>
    </div>
  );
};
