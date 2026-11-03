import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  DollarSign,
  TrendingUp,
  Package,
  Truck,
  Store,
  Search,
  AlertTriangle,
  CheckCircle2,
  MapPin,
  Tag,
  RefreshCw,
  BarChart3,
  Boxes,
  CreditCard,
  Loader2,
  ChevronDown,
  Check,
} from 'lucide-react';
import type {
  Shop,
  DashboardKpis,
  Sale,
  CourierParcel,
  StockByShopGridItem,
} from '@ar-option/shared-types';
import { Pagination } from './pagination';
import { CashInHandCard } from './till/CashInHandCard';
import { apiFetch } from '../lib/api';
import { sizeLabel, useSizes } from '../lib/settings';

interface DashboardViewProps {
  apiUrl: string;
  activeShop: Shop | null;
  shops: Shop[];
  dashboardKpis: DashboardKpis | null;
  onNavigateTab: (tab: string) => void;
  permissions: string[];
  onSelectShop?: (shop: Shop | null) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  apiUrl,
  activeShop,
  shops,
  dashboardKpis,
  onNavigateTab,
  permissions,
  onSelectShop,
}) => {
  const sizesOn = useSizes();
  // Location picker dropdown state
  const [locationPickerOpen, setLocationPickerOpen] = useState<boolean>(false);
  // Data state
  const [sales, setSales] = useState<Sale[]>([]);
  const [parcels, setParcels] = useState<CourierParcel[]>([]);
  const [stockItems, setStockItems] = useState<StockByShopGridItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active table view tab: 'sales' | 'stock' | 'dispatch'
  const [activeTableTab, setActiveTableTab] = useState<'sales' | 'stock' | 'dispatch'>('sales');

  // Chart range: '7days' | '30days' | 'today'
  const [chartRange, setChartRange] = useState<'7days' | '30days' | 'today'>('7days');
  const [hoveredDataPoint, setHoveredDataPoint] = useState<{
    label: string;
    amount: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  // 1. Sales Table Filters & Pagination
  const [salesSearch, setSalesSearch] = useState<string>('');
  const [salesBrandFilter, setSalesBrandFilter] = useState<string>('all');
  const [salesTimeRange, setSalesTimeRange] = useState<'all' | 'today' | 'yesterday' | '7days' | '30days'>('all');
  const [salesShopFilter, setSalesShopFilter] = useState<string>(activeShop ? String(activeShop.id) : 'all');
  const [salesPage, setSalesPage] = useState<number>(1);
  const [salesPageSize, setSalesPageSize] = useState<number>(25);

  // 2. Stock Table Filters & Pagination
  const [stockSearch, setStockSearch] = useState<string>('');
  const [stockBrandFilter, setStockBrandFilter] = useState<string>('all');
  const [stockShopFilter, setStockShopFilter] = useState<string>(activeShop ? String(activeShop.id) : 'all');
  const [stockStatusFilter, setStockStatusFilter] = useState<'all' | 'in_stock' | 'low_stock' | 'out_of_stock'>('all');
  const [stockPage, setStockPage] = useState<number>(1);
  const [stockPageSize, setStockPageSize] = useState<number>(25);

  // 3. Dispatch Queue Filters & Pagination
  const [dispatchSearch, setDispatchSearch] = useState<string>('');
  const [dispatchShopFilter, setDispatchShopFilter] = useState<string>(activeShop ? String(activeShop.id) : 'all');
  const [dispatchCourierFilter, setDispatchCourierFilter] = useState<string>('all');
  const [dispatchStatusFilter, setDispatchStatusFilter] = useState<string>('all');
  const [dispatchPage, setDispatchPage] = useState<number>(1);
  const [dispatchPageSize, setDispatchPageSize] = useState<number>(25);

  // Sync activeShop changes to filters
  useEffect(() => {
    if (activeShop) {
      setSalesShopFilter(String(activeShop.id));
      setStockShopFilter(String(activeShop.id));
      setDispatchShopFilter(String(activeShop.id));
    } else {
      setSalesShopFilter('all');
      setStockShopFilter('all');
      setDispatchShopFilter('all');
    }
    setSalesPage(1);
    setStockPage(1);
    setDispatchPage(1);
  }, [activeShop]);

  // Load all dashboard operational data
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const [salesRes, parcelsRes, stockRes] = await Promise.all([
        apiFetch(`${apiUrl}/pos/sales`),
        apiFetch(`${apiUrl}/courier/parcels`),
        apiFetch(`${apiUrl}/reports/stock-by-shop`),
      ]);

      if (salesRes.ok) {
        const salesData = await salesRes.json();
        setSales(Array.isArray(salesData) ? salesData : []);
      }

      if (parcelsRes.ok) {
        const parcelsData = await parcelsRes.json();
        setParcels(Array.isArray(parcelsData) ? parcelsData : []);
      }

      if (stockRes.ok) {
        const stockData = await stockRes.json();
        setStockItems(Array.isArray(stockData) ? stockData : []);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiUrl]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Map product names / SKUs to brand names for sales filtering
  const productToBrandMap = useMemo(() => {
    const map = new Map<string, string>();
    stockItems.forEach((item) => {
      if (item.brand_name) {
        map.set(item.product_name.toLowerCase(), item.brand_name);
        map.set(item.sku.toLowerCase(), item.brand_name);
      }
    });
    return map;
  }, [stockItems]);

  // Available brands list
  const availableBrands = useMemo(() => {
    const brandSet = new Set<string>();
    brandSet.add('AR Option');
    stockItems.forEach((s) => {
      if (s.brand_name) brandSet.add(s.brand_name);
    });
    return Array.from(brandSet).sort();
  }, [stockItems]);

  // Available courier services
  const availableCouriers = useMemo(() => {
    const cSet = new Set<string>();
    parcels.forEach((p) => {
      if (p.courier_name) cSet.add(p.courier_name);
    });
    return Array.from(cSet).sort();
  }, [parcels]);

  // Filter Sales
  const filteredSales = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const sevenDaysAgo = startOfToday - 6 * 86400000;
    const thirtyDaysAgo = startOfToday - 29 * 86400000;

    return sales.filter((sale) => {
      // 1. Shop filter
      if (salesShopFilter !== 'all' && String(sale.location_id) !== salesShopFilter) {
        return false;
      }

      // 2. Time range filter
      if (salesTimeRange !== 'all') {
        const saleTime = new Date(sale.created_at).getTime();
        if (salesTimeRange === 'today' && saleTime < startOfToday) return false;
        if (salesTimeRange === 'yesterday' && (saleTime < startOfYesterday || saleTime >= startOfToday)) return false;
        if (salesTimeRange === '7days' && saleTime < sevenDaysAgo) return false;
        if (salesTimeRange === '30days' && saleTime < thirtyDaysAgo) return false;
      }

      // 3. Brand filter
      if (salesBrandFilter !== 'all') {
        const hasBrandItem = sale.items?.some((it) => {
          const itemBrand =
            productToBrandMap.get(it.product_name.toLowerCase()) ||
            productToBrandMap.get(it.sku.toLowerCase()) ||
            '';
          return (
            itemBrand.toLowerCase() === salesBrandFilter.toLowerCase() ||
            it.product_name.toLowerCase().includes(salesBrandFilter.toLowerCase())
          );
        });
        if (!hasBrandItem) return false;
      }

      // 4. Search term
      if (salesSearch.trim()) {
        const query = salesSearch.toLowerCase().trim();
        const matchesInvoice = sale.invoice_number?.toLowerCase().includes(query);
        const matchesCustomer = sale.customer_name?.toLowerCase().includes(query);
        const matchesPhone = sale.customer_phone?.toLowerCase().includes(query);
        const matchesShop = sale.shop_name?.toLowerCase().includes(query);
        const matchesItem = sale.items?.some(
          (it) => it.product_name.toLowerCase().includes(query) || it.sku.toLowerCase().includes(query)
        );
        if (!matchesInvoice && !matchesCustomer && !matchesPhone && !matchesShop && !matchesItem) {
          return false;
        }
      }

      return true;
    });
  }, [sales, salesShopFilter, salesTimeRange, salesBrandFilter, salesSearch, productToBrandMap]);

  // Paginated Sales
  const paginatedSales = useMemo(() => {
    const startIndex = (salesPage - 1) * salesPageSize;
    return filteredSales.slice(startIndex, startIndex + salesPageSize);
  }, [filteredSales, salesPage, salesPageSize]);

  // Filter Stock Items
  const filteredStock = useMemo(() => {
    return stockItems.filter((item) => {
      // 1. Brand filter
      if (stockBrandFilter !== 'all') {
        const bName = item.brand_name || '';
        if (bName.toLowerCase() !== stockBrandFilter.toLowerCase()) return false;
      }

      // 2. Shop filter & quantity check
      const relevantStocks = stockShopFilter === 'all'
        ? item.stocks
        : item.stocks.filter((s) => String(s.location_id) === stockShopFilter);
      const totalQty = relevantStocks.reduce((sum, s) => sum + s.qty, 0);

      // 3. Status filter
      if (stockStatusFilter === 'in_stock' && totalQty <= 10) return false;
      if (stockStatusFilter === 'low_stock' && (totalQty <= 0 || totalQty > 10)) return false;
      if (stockStatusFilter === 'out_of_stock' && totalQty > 0) return false;

      // 4. Search query
      if (stockSearch.trim()) {
        const query = stockSearch.toLowerCase().trim();
        const matchesName = item.product_name.toLowerCase().includes(query);
        const matchesSku = item.sku.toLowerCase().includes(query);
        const matchesCode = item.product_code.toLowerCase().includes(query);
        const matchesCategory = item.category_name?.toLowerCase().includes(query);
        if (!matchesName && !matchesSku && !matchesCode && !matchesCategory) {
          return false;
        }
      }

      return true;
    });
  }, [stockItems, stockBrandFilter, stockShopFilter, stockStatusFilter, stockSearch]);

  // Paginated Stock
  const paginatedStock = useMemo(() => {
    const startIndex = (stockPage - 1) * stockPageSize;
    return filteredStock.slice(startIndex, startIndex + stockPageSize);
  }, [filteredStock, stockPage, stockPageSize]);

  // Filter Dispatch Queue
  const filteredParcels = useMemo(() => {
    return parcels.filter((parcel) => {
      // 1. Shop filter
      if (dispatchShopFilter !== 'all' && String(parcel.location_id) !== dispatchShopFilter) {
        return false;
      }

      // 2. Courier partner filter
      if (dispatchCourierFilter !== 'all' && parcel.courier_name !== dispatchCourierFilter) {
        return false;
      }

      // 3. Status filter
      if (dispatchStatusFilter !== 'all') {
        if (dispatchStatusFilter === 'pending' && parcel.delivery_status !== 'booked') return false;
        if (dispatchStatusFilter === 'in_transit' && parcel.delivery_status !== 'in_transit') return false;
        if (dispatchStatusFilter === 'delivered' && parcel.delivery_status !== 'delivered') return false;
        if (dispatchStatusFilter === 'returned' && parcel.delivery_status !== 'returned') return false;
        if (dispatchStatusFilter === 'unpaid' && parcel.payment_status !== 'unpaid') return false;
        if (dispatchStatusFilter === 'settled' && parcel.payment_status !== 'paid') return false;
      }

      // 4. Search query
      if (dispatchSearch.trim()) {
        const query = dispatchSearch.toLowerCase().trim();
        const matchesCode = parcel.parcel_code.toLowerCase().includes(query);
        const matchesTracking = parcel.tracking_number?.toLowerCase().includes(query);
        const matchesCustomer = parcel.customer_name?.toLowerCase().includes(query);
        const matchesPhone = parcel.customer_phone?.toLowerCase().includes(query);
        const matchesCity = parcel.customer_address?.toLowerCase().includes(query);
        if (!matchesCode && !matchesTracking && !matchesCustomer && !matchesPhone && !matchesCity) {
          return false;
        }
      }

      return true;
    });
  }, [parcels, dispatchShopFilter, dispatchCourierFilter, dispatchStatusFilter, dispatchSearch]);

  // Paginated Dispatch Queue
  const paginatedParcels = useMemo(() => {
    const startIndex = (dispatchPage - 1) * dispatchPageSize;
    return filteredParcels.slice(startIndex, startIndex + dispatchPageSize);
  }, [filteredParcels, dispatchPage, dispatchPageSize]);

  // Dashboard Executive Metrics (Parameters)
  const metrics = useMemo(() => {
    // Relevant sales
    const relevantSales = activeShop
      ? sales.filter((s) => s.location_id === activeShop.id)
      : sales;
    const totalSalesRev = relevantSales.reduce((sum, s) => sum + s.total_amount, 0);
    const totalSalesCount = relevantSales.length;

    // Stock value & items
    let totalStockUnits = 0;
    let totalCostValuation = 0;
    let totalRetailValuation = 0;
    let lowStockCount = 0;
    let outOfStockCount = 0;

    stockItems.forEach((item) => {
      const relevantStocks = activeShop
        ? item.stocks.filter((s) => s.location_id === activeShop.id)
        : item.stocks;
      const itemQty = relevantStocks.reduce((sum, s) => sum + s.qty, 0);

      totalStockUnits += itemQty;
      totalCostValuation += itemQty * item.cost_price;
      totalRetailValuation += itemQty * item.selling_price;

      if (itemQty === 0) outOfStockCount++;
      else if (itemQty <= 10) lowStockCount++;
    });

    // Courier Queue
    const relevantParcels = activeShop
      ? parcels.filter((p) => p.location_id === activeShop.id)
      : parcels;
    const pendingParcels = relevantParcels.filter(
      (p) => p.delivery_status === 'booked' || p.delivery_status === 'in_transit'
    );
    const pendingCOD = pendingParcels.reduce((sum, p) => sum + p.collectible_amount, 0);
    const deliveredParcels = relevantParcels.filter((p) => p.delivery_status === 'delivered');
    const returnedParcels = relevantParcels.filter((p) => p.delivery_status === 'returned');

    // Profit margin %
    const estimatedMargin =
      totalRetailValuation > 0
        ? Math.round(((totalRetailValuation - totalCostValuation) / totalRetailValuation) * 100)
        : 0;

    return {
      totalSalesRev: dashboardKpis?.total_sales ?? totalSalesRev,
      totalSalesCount,
      stockCostValuation: dashboardKpis?.stock_value ?? totalCostValuation,
      stockRetailValuation: totalRetailValuation,
      totalStockUnits,
      lowStockCount,
      outOfStockCount,
      pendingDispatchCount: pendingParcels.length,
      pendingCOD,
      deliveredCount: deliveredParcels.length,
      returnedCount: returnedParcels.length,
      estimatedMargin,
      pendingTransfers: dashboardKpis?.pending_transfers ?? 0,
      activeShopsCount: dashboardKpis?.total_shops ?? shops.length,
    };
  }, [sales, stockItems, parcels, activeShop, dashboardKpis, shops]);

  // Chart data: Bucketed revenue trends
  const chartData = useMemo(() => {
    const relevantSales = activeShop
      ? sales.filter((s) => s.location_id === activeShop.id)
      : sales;

    const now = new Date();

    if (chartRange === 'today') {
      // 24 hours buckets
      const hours = Array.from({ length: 24 }, (_, i) => {
        const hourLabel = `${String(i).padStart(2, '0')}:00`;
        return { label: hourLabel, amount: 0, count: 0 };
      });

      relevantSales.forEach((s) => {
        const d = new Date(s.created_at);
        if (
          d.getDate() === now.getDate() &&
          d.getMonth() === now.getMonth() &&
          d.getFullYear() === now.getFullYear()
        ) {
          const h = d.getHours();
          hours[h].amount += s.total_amount;
          hours[h].count += 1;
        }
      });
      return hours;
    }

    const dayCount = chartRange === '7days' ? 7 : 30;
    const days: { label: string; dateStr: string; amount: number; count: number }[] = [];

    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 86400000);
      const label = d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      const dateStr = d.toISOString().slice(0, 10);
      days.push({ label, dateStr, amount: 0, count: 0 });
    }

    relevantSales.forEach((s) => {
      const sDateStr = new Date(s.created_at).toISOString().slice(0, 10);
      const target = days.find((day) => day.dateStr === sDateStr);
      if (target) {
        target.amount += s.total_amount;
        target.count += 1;
      }
    });

    return days;
  }, [sales, activeShop, chartRange]);

  // Sales by Shop Location breakdown
  const salesByShop = useMemo(() => {
    const shopMap = new Map<string, { name: string; code: string; total: number; count: number }>();
    shops.forEach((shop) => {
      shopMap.set(String(shop.id), { name: shop.name, code: shop.code, total: 0, count: 0 });
    });

    sales.forEach((s) => {
      const existing = shopMap.get(String(s.location_id));
      if (existing) {
        existing.total += s.total_amount;
        existing.count += 1;
      } else {
        shopMap.set(String(s.location_id), {
          name: s.shop_name || `Shop #${s.location_id}`,
          code: s.shop_code || 'LOC',
          total: s.total_amount,
          count: 1,
        });
      }
    });

    const list = Array.from(shopMap.values());
    const totalRev = list.reduce((sum, item) => sum + item.total, 0) || 1;
    return list.map((item) => ({
      ...item,
      percentage: Math.round((item.total / totalRev) * 100),
    }));
  }, [sales, shops]);

  // Top Brands Revenue/Units Breakdown
  const brandDistribution = useMemo(() => {
    const brandMap = new Map<string, { brand: string; revenue: number; units: number }>();

    sales.forEach((s) => {
      s.items?.forEach((it) => {
        const b =
          productToBrandMap.get(it.product_name.toLowerCase()) ||
          productToBrandMap.get(it.sku.toLowerCase()) ||
          'In-House Brand';
        const cur = brandMap.get(b) || { brand: b, revenue: 0, units: 0 };
        cur.revenue += it.total;
        cur.units += it.quantity;
        brandMap.set(b, cur);
      });
    });

    const list = Array.from(brandMap.values()).sort((a, b) => b.revenue - a.revenue);
    const total = list.reduce((sum, b) => sum + b.revenue, 0) || 1;
    return list.slice(0, 5).map((b) => ({
      ...b,
      share: Math.round((b.revenue / total) * 100),
    }));
  }, [sales, productToBrandMap]);

  // SVG Chart Dimensions & Computations
  const maxChartAmount = useMemo(() => {
    const maxVal = Math.max(...chartData.map((d) => d.amount), 500);
    return Math.ceil(maxVal * 1.15);
  }, [chartData]);

  const svgWidth = 800;
  const svgHeight = 220;
  const paddingX = 40;
  const paddingY = 30;
  const chartInnerWidth = svgWidth - paddingX * 2;
  const chartInnerHeight = svgHeight - paddingY * 2;

  const chartPoints = useMemo(() => {
    if (chartData.length === 0) return [];
    const stepX = chartInnerWidth / Math.max(chartData.length - 1, 1);
    return chartData.map((d, index) => {
      const x = paddingX + index * stepX;
      const y = paddingY + chartInnerHeight - (d.amount / maxChartAmount) * chartInnerHeight;
      return { x, y, data: d };
    });
  }, [chartData, chartInnerWidth, chartInnerHeight, maxChartAmount, paddingX, paddingY]);

  const chartPathD = useMemo(() => {
    if (chartPoints.length === 0) return '';
    return chartPoints.reduce((acc, point, i) => {
      return i === 0 ? `M ${point.x} ${point.y}` : `${acc} L ${point.x} ${point.y}`;
    }, '');
  }, [chartPoints]);

  const areaPathD = useMemo(() => {
    if (chartPoints.length === 0) return '';
    const firstX = chartPoints[0].x;
    const lastX = chartPoints[chartPoints.length - 1].x;
    const bottomY = paddingY + chartInnerHeight;
    return `${chartPathD} L ${lastX} ${bottomY} L ${firstX} ${bottomY} Z`;
  }, [chartPathD, chartPoints, chartInnerHeight, paddingY]);

  return (
    <div className="space-y-6 pb-20">
      {/* 1. Header & Live Dashboard Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-light-surface dark:bg-dark-surface p-4 md:p-6 rounded-2xl border border-light-border dark:border-dark-border shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-6 h-6 text-primary dark:text-primary-tint" />
            <h2 className="text-xl md:text-2xl font-black tracking-tight">Executive Operations Dashboard</h2>
          </div>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted mt-1">
            Real-time multi-branch operational control, visual telemetry, queues & live ledger source-synced transactions
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {/* Clickable & Changeable Location Selector */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setLocationPickerOpen(!locationPickerOpen)}
              className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover hover:border-primary border border-light-border dark:border-dark-border text-xs font-bold transition-all text-light-text dark:text-dark-text shadow-xs cursor-pointer group"
              aria-label="Change dashboard location"
              aria-expanded={locationPickerOpen}
              data-testid="dashboard-location-picker"
            >
              <MapPin className="w-3.5 h-3.5 text-primary dark:text-primary-tint group-hover:scale-110 transition-transform" />
              <span className="truncate max-w-[140px] sm:max-w-[200px]">
                {activeShop ? activeShop.name : 'Company-Wide (All Outlets)'}
              </span>
              <ChevronDown className={`w-3.5 h-3.5 text-light-text-muted dark:text-dark-text-muted transition-transform duration-200 ${locationPickerOpen ? 'rotate-180 text-primary' : ''}`} />
            </button>

            {locationPickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setLocationPickerOpen(false)}
                />
                <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-light-surface dark:bg-dark-surface border border-light-border dark:border-dark-border shadow-2xl z-50 py-2 divide-y divide-light-border dark:divide-dark-border overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                  <div className="px-3.5 py-2">
                    <div className="text-[10px] font-extrabold uppercase tracking-wider text-light-text-muted dark:text-dark-text-muted">
                      Select Dashboard Location
                    </div>
                    <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-0.5">
                      Metrics, charts & tables update to match
                    </div>
                  </div>

                  <div className="py-1 max-h-60 overflow-y-auto">
                    {/* All Outlets Option */}
                    <button
                      type="button"
                      onClick={() => {
                        onSelectShop?.(null);
                        setLocationPickerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs text-left transition-colors ${
                        activeShop === null
                          ? 'bg-primary/10 text-primary dark:text-primary-tint font-bold'
                          : 'hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover font-medium'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <Store className="w-4 h-4 opacity-70" />
                        <div>
                          <div>All Outlets (Company-Wide)</div>
                          <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted font-normal">
                            Combined multi-branch view
                          </div>
                        </div>
                      </div>
                      {activeShop === null && <Check className="w-4 h-4 text-primary dark:text-primary-tint flex-shrink-0" />}
                    </button>

                    {/* Individual Shop Locations */}
                    {shops.map((shop) => {
                      const isSelected = activeShop?.id === shop.id;
                      return (
                        <button
                          key={shop.id}
                          type="button"
                          onClick={() => {
                            onSelectShop?.(shop);
                            setLocationPickerOpen(false);
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2.5 text-xs text-left transition-colors ${
                            isSelected
                              ? 'bg-primary/10 text-primary dark:text-primary-tint font-bold'
                              : 'hover:bg-light-surface-hover dark:hover:bg-dark-surface-hover font-medium'
                          }`}
                        >
                          <div className="flex items-center space-x-2">
                            <MapPin className="w-4 h-4 opacity-70" />
                            <div>
                              <div>{shop.name}</div>
                              <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted font-mono">
                                Code: {shop.code}
                              </div>
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-primary dark:text-primary-tint flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => fetchData(true)}
            disabled={refreshing}
            className="h-10 px-3.5 rounded-xl bg-primary text-on-primary hover:bg-primary-hover flex items-center space-x-1.5 text-xs font-bold transition-all shadow-sm disabled:opacity-50"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-danger/10 border border-danger/20 text-danger text-xs flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Executive Parameter KPI Cards (All Parameters) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {/* KPI 1: Total Sales Revenue */}
        <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">Total Sales Revenue</span>
            <span className="p-2 rounded-xl bg-primary/10 text-primary dark:text-primary-tint">
              <DollarSign className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xl md:text-2xl font-extrabold font-mono text-light-text dark:text-dark-text tracking-tight">
              ৳{metrics.totalSalesRev.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-1 flex items-center space-x-1">
              <span className="font-bold text-success-text-light dark:text-success">{metrics.totalSalesCount} orders</span>
              <span>completed</span>
            </div>
          </div>
        </div>

        {/* KPI 2: Stock Valuation & Unit Count */}
        <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">Stock Asset Value</span>
            <span className="p-2 rounded-xl bg-info/10 text-info-text-light dark:text-info-text-dark">
              <Package className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xl md:text-2xl font-extrabold font-mono text-primary dark:text-primary-tint tracking-tight">
              ৳{metrics.stockCostValuation.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-1 flex items-center justify-between">
              <span>{metrics.totalStockUnits.toLocaleString()} units</span>
              <span className="font-semibold text-success-text-light dark:text-success">~{metrics.estimatedMargin}% margin</span>
            </div>
          </div>
        </div>

        {/* KPI 3: Dispatch Queue Backlog & Collectible COD */}
        <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">Dispatch Queue SLA</span>
            <span className="p-2 rounded-xl bg-warning/10 text-warning-text-light dark:text-warning">
              <Truck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xl md:text-2xl font-extrabold font-mono text-warning tracking-tight">
              {metrics.pendingDispatchCount} Parcels
            </div>
            <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-1 flex items-center space-x-1">
              <span>COD:</span>
              <span className="font-mono font-bold text-light-text dark:text-dark-text">৳{metrics.pendingCOD.toLocaleString()}</span>
              <span>awaiting</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Operational Outlets & Low Stock Alerts */}
        <div className="bg-light-surface dark:bg-dark-surface p-4 rounded-2xl border border-light-border dark:border-dark-border shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-light-text-muted dark:text-dark-text-muted">Operational Network</span>
            <span className="p-2 rounded-xl bg-success/10 text-success-text-light dark:text-success">
              <Store className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-xl md:text-2xl font-extrabold font-mono text-light-text dark:text-dark-text tracking-tight">
              {metrics.activeShopsCount} Outlets
            </div>
            <div className="text-[11px] text-light-text-muted dark:text-dark-text-muted mt-1 flex items-center space-x-1.5">
              {metrics.lowStockCount > 0 ? (
                <span className="text-danger-text-light dark:text-danger font-bold flex items-center space-x-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>{metrics.lowStockCount} low stock alerts</span>
                </span>
              ) : (
                <span className="text-success-text-light dark:text-success flex items-center space-x-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Healthy Stock Levels</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {permissions.includes('till.view') && (
        <CashInHandCard
          activeShop={activeShop}
          apiUrl={apiUrl}
          refreshKey={dashboardKpis}
          onOpenTill={() => onNavigateTab('cash-closing')}
        />
      )}

      {loading && (
        <div className="flex items-center justify-center py-6 text-light-text-muted dark:text-dark-text-muted space-x-2">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="text-xs font-semibold">Loading real-time operational data...</span>
        </div>
      )}

      {/* 3. Visual Charts & Telemetry Graphs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Main Performance Graph: Revenue Trend */}
        <div className="lg:col-span-2 bg-light-surface dark:bg-dark-surface p-4 md:p-6 rounded-2xl border border-light-border dark:border-dark-border shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-primary dark:text-primary-tint" />
                <h3 className="font-bold text-sm md:text-base">Revenue & Performance Trajectory</h3>
              </div>
              <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
                Transaction value curve with interactive point telemetry
              </p>
            </div>

            <div className="flex items-center bg-light-surface-hover dark:bg-dark-surface-hover p-1 rounded-xl border border-light-border dark:border-dark-border text-xs">
              <button
                type="button"
                onClick={() => setChartRange('today')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  chartRange === 'today' ? 'bg-primary text-on-primary shadow-xs' : 'text-light-text-muted hover:text-light-text dark:hover:text-dark-text'
                }`}
              >
                Today
              </button>
              <button
                type="button"
                onClick={() => setChartRange('7days')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  chartRange === '7days' ? 'bg-primary text-on-primary shadow-xs' : 'text-light-text-muted hover:text-light-text dark:hover:text-dark-text'
                }`}
              >
                7 Days
              </button>
              <button
                type="button"
                onClick={() => setChartRange('30days')}
                className={`px-3 py-1 rounded-lg font-semibold transition-colors ${
                  chartRange === '30days' ? 'bg-primary text-on-primary shadow-xs' : 'text-light-text-muted hover:text-light-text dark:hover:text-dark-text'
                }`}
              >
                30 Days
              </button>
            </div>
          </div>

          {/* SVG Interactive Area / Line Chart */}
          <div className="relative w-full overflow-hidden pt-2">
            <svg
              viewBox={`0 0 ${svgWidth} ${svgHeight}`}
              className="w-full h-48 md:h-56 select-none"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#881337" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#881337" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = paddingY + chartInnerHeight * ratio;
                return (
                  <line
                    key={ratio}
                    x1={paddingX}
                    y1={y}
                    x2={svgWidth - paddingX}
                    y2={y}
                    stroke="currentColor"
                    className="text-light-border dark:text-dark-border opacity-60"
                    strokeDasharray="4 4"
                  />
                );
              })}

              {/* Area Gradient Fill */}
              {areaPathD && <path d={areaPathD} fill="url(#revenueGradient)" />}

              {/* Main Line */}
              {chartPathD && (
                <path
                  d={chartPathD}
                  fill="none"
                  stroke="#881337"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Data Points */}
              {chartPoints.map((pt, i) => (
                <g key={i}>
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r={hoveredDataPoint?.label === pt.data.label ? '6' : '3.5'}
                    fill="#fda4af"
                    stroke="#881337"
                    strokeWidth="2"
                    className="cursor-pointer transition-all hover:r-6"
                    onMouseEnter={() =>
                      setHoveredDataPoint({
                        label: pt.data.label,
                        amount: pt.data.amount,
                        count: pt.data.count,
                        x: pt.x,
                        y: pt.y,
                      })
                    }
                    onMouseLeave={() => setHoveredDataPoint(null)}
                  />
                </g>
              ))}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredDataPoint && (
              <div
                className="absolute z-20 pointer-events-none transform -translate-x-1/2 -translate-y-full px-2.5 py-1.5 rounded-xl bg-dark-bg text-dark-text border border-dark-border shadow-xl text-xs font-mono"
                style={{
                  left: `${(hoveredDataPoint.x / svgWidth) * 100}%`,
                  top: `${(hoveredDataPoint.y / svgHeight) * 100 - 8}%`,
                }}
              >
                <div className="font-bold text-primary-tint">{hoveredDataPoint.label}</div>
                <div className="text-white font-extrabold">৳{hoveredDataPoint.amount.toLocaleString()}</div>
                <div className="text-[10px] text-dark-text-muted">{hoveredDataPoint.count} sales</div>
              </div>
            )}

            {/* X-axis date labels */}
            <div className="flex justify-between items-center px-4 mt-2 text-[10px] font-mono text-light-text-muted dark:text-dark-text-muted">
              <span>{chartData[0]?.label}</span>
              <span>{chartData[Math.floor(chartData.length / 2)]?.label}</span>
              <span>{chartData[chartData.length - 1]?.label}</span>
            </div>
          </div>
        </div>

        {/* Side Column: Shop Distribution & Brand Share */}
        <div className="space-y-4">
          {/* Shop Location Revenue Distribution */}
          <div className="bg-light-surface dark:bg-dark-surface p-4 md:p-5 rounded-2xl border border-light-border dark:border-dark-border shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs uppercase tracking-wider text-light-text-muted dark:text-dark-text-muted flex items-center space-x-1.5">
                <Store className="w-3.5 h-3.5 text-primary" />
                <span>Revenue by Location</span>
              </h4>
              <span className="text-[10px] font-mono font-bold text-primary dark:text-primary-tint">
                {shops.length} Outlets
              </span>
            </div>

            <div className="space-y-2.5">
              {salesByShop.map((item) => (
                <div key={item.code} className="space-y-1">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-semibold truncate max-w-[150px]">{item.name}</span>
                    <span className="font-mono font-bold">৳{item.total.toLocaleString()}</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-light-surface-hover dark:bg-dark-surface-hover overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-500"
                      style={{ width: `${Math.max(item.percentage, 4)}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-light-text-muted dark:text-dark-text-muted">
                    <span>{item.code}</span>
                    <span>{item.count} orders ({item.percentage}%)</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Brands Share */}
          <div className="bg-light-surface dark:bg-dark-surface p-4 md:p-5 rounded-2xl border border-light-border dark:border-dark-border shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-xs uppercase tracking-wider text-light-text-muted dark:text-dark-text-muted flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5 text-primary" />
                <span>Top Selling Brands</span>
              </h4>
              <span className="text-[10px] font-mono text-light-text-muted dark:text-dark-text-muted">Sales Vol.</span>
            </div>

            <div className="space-y-2">
              {brandDistribution.length > 0 ? (
                brandDistribution.map((b) => (
                  <div key={b.brand} className="flex items-center justify-between text-xs py-1 border-b border-light-border/40 dark:border-dark-border/40 last:border-0">
                    <div className="flex items-center space-x-2">
                      <div className="w-2 h-2 rounded-full bg-primary" />
                      <span className="font-semibold">{b.brand}</span>
                    </div>
                    <div className="text-right font-mono">
                      <div className="font-bold">৳{b.revenue.toLocaleString()}</div>
                      <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted">{b.units} pcs ({b.share}%)</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="py-3 text-center text-xs text-light-text-muted dark:text-dark-text-muted">
                  No brand sales recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Tabbed Operational Data Tables Section (Sales List, Stock Table, Dispatch Queue) */}
      <div className="bg-light-surface dark:bg-dark-surface rounded-2xl border border-light-border dark:border-dark-border shadow-sm overflow-hidden">
        {/* Table Selector Header */}
        <div className="p-4 md:p-6 border-b border-light-border dark:border-dark-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveTableTab('sales')}
              className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center space-x-2 transition-all ${
                activeTableTab === 'sales'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted dark:text-dark-text-muted hover:text-light-text dark:hover:text-dark-text'
              }`}
            >
              <CreditCard className="w-4 h-4" />
              <span>All Sales Ledger List</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 dark:bg-black/20 font-mono">
                {filteredSales.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTableTab('stock')}
              className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center space-x-2 transition-all ${
                activeTableTab === 'stock'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted dark:text-dark-text-muted hover:text-light-text dark:hover:text-dark-text'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>Stock & Inventory Grid</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 dark:bg-black/20 font-mono">
                {filteredStock.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTableTab('dispatch')}
              className={`px-4 py-2 rounded-xl text-xs md:text-sm font-bold flex items-center space-x-2 transition-all ${
                activeTableTab === 'dispatch'
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted dark:text-dark-text-muted hover:text-light-text dark:hover:text-dark-text'
              }`}
            >
              <Truck className="w-4 h-4" />
              <span>Courier Dispatch Queue</span>
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[10px] bg-white/20 dark:bg-black/20 font-mono">
                {filteredParcels.length}
              </span>
            </button>
          </div>

          <div className="text-xs text-light-text-muted dark:text-dark-text-muted font-mono hidden lg:block">
            Strict Auditing Rules & Responsive Pagination Enforced
          </div>
        </div>

        {/* -------------------- TAB 1: ALL SALES LIST -------------------- */}
        {activeTableTab === 'sales' && (
          <div className="space-y-4 p-4 md:p-6">
            {/* Sales Filters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-light-text-muted dark:text-dark-text-muted" />
                <input
                  type="text"
                  placeholder="Search invoice, customer, phone..."
                  value={salesSearch}
                  onChange={(e) => {
                    setSalesSearch(e.target.value);
                    setSalesPage(1);
                  }}
                  className="w-full h-11 pl-9 pr-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              {/* Brand Filter */}
              <div>
                <select
                  value={salesBrandFilter}
                  onChange={(e) => {
                    setSalesBrandFilter(e.target.value);
                    setSalesPage(1);
                  }}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-medium"
                >
                  <option value="all">All Brands</option>
                  {availableBrands.map((b) => (
                    <option key={b} value={b}>
                      Brand: {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Time Range Filter */}
              <div>
                <select
                  value={salesTimeRange}
                  onChange={(e) => {
                    setSalesTimeRange(e.target.value as any);
                    setSalesPage(1);
                  }}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-medium"
                >
                  <option value="all">Time: All Time</option>
                  <option value="today">Time: Today</option>
                  <option value="yesterday">Time: Yesterday</option>
                  <option value="7days">Time: Last 7 Days</option>
                  <option value="30days">Time: Last 30 Days</option>
                </select>
              </div>

              {/* Shop Location Filter */}
              <div>
                <select
                  value={salesShopFilter}
                  onChange={(e) => {
                    setSalesShopFilter(e.target.value);
                    setSalesPage(1);
                  }}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-medium"
                >
                  <option value="all">Location: All Shops</option>
                  {shops.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      Location: {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Sales Table */}
            <div className="overflow-x-auto rounded-xl border border-light-border dark:border-dark-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider border-b border-light-border dark:border-dark-border font-semibold">
                    <th className="py-3 px-4">Invoice #</th>
                    <th className="py-3 px-4">Date & Time</th>
                    <th className="py-3 px-4">Shop Outlet</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Items / Brands</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4 text-right">Subtotal (৳)</th>
                    <th className="py-3 px-4 text-right">Net Paid (৳)</th>
                    <th className="py-3 px-4 text-center">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-border dark:divide-dark-border font-mono">
                  {paginatedSales.length > 0 ? (
                    paginatedSales.map((sale) => (
                      <tr
                        key={sale.id}
                        className="hover:bg-light-surface-hover/70 dark:hover:bg-dark-surface-hover/70 transition-colors"
                      >
                        <td className="py-3 px-4 font-bold text-primary dark:text-primary-tint">
                          {sale.invoice_number}
                        </td>
                        <td className="py-3 px-4 font-sans text-light-text-muted dark:text-dark-text-muted whitespace-nowrap">
                          {new Date(sale.created_at).toLocaleString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <div className="font-semibold">{sale.shop_name}</div>
                          <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted">{sale.shop_code}</div>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <div className="font-medium text-light-text dark:text-dark-text">
                            {sale.customer_name || 'Walk-in Customer'}
                          </div>
                          {sale.customer_phone && (
                            <div className="text-[10px] text-light-text-muted dark:text-dark-text-muted">
                              {sale.customer_phone}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-sans max-w-xs">
                          <div className="space-y-0.5">
                            {sale.items && sale.items.length > 0 ? (
                              sale.items.map((it, idx) => (
                                <div key={idx} className="text-[11px] truncate">
                                  <span className="font-semibold">{it.product_name}</span>{sizeLabel(it.size, sizesOn) && ` (${sizeLabel(it.size, sizesOn)})`} × {it.quantity}
                                </div>
                              ))
                            ) : (
                              <span className="text-light-text-muted">1 item</span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border">
                            {sale.payment_account_name || 'Cash'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-light-text-muted">
                          {sale.subtotal.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-success-text-light dark:text-success">
                          ৳{sale.paid_amount.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                              sale.sale_type === 'courier'
                                ? 'bg-warning/15 text-warning-text-light dark:text-warning'
                                : 'bg-primary/10 text-primary dark:text-primary-tint'
                            }`}
                          >
                            {sale.sale_type}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-light-text-muted dark:text-dark-text-muted font-sans">
                        No sales match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Sales Pagination */}
            <Pagination
              totalItems={filteredSales.length}
              currentPage={salesPage}
              pageSize={salesPageSize}
              onPageChange={setSalesPage}
              onPageSizeChange={(newSize) => {
                setSalesPageSize(newSize);
                setSalesPage(1);
              }}
              itemLabel="sale"
              itemLabelPlural="sales"
            />
          </div>
        )}

        {/* -------------------- TAB 2: STOCK & INVENTORY GRID -------------------- */}
        {activeTableTab === 'stock' && (
          <div className="space-y-4 p-4 md:p-6">
            {/* Stock Filters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-light-text-muted dark:text-dark-text-muted" />
                <input
                  type="text"
                  placeholder="Search product, SKU, code..."
                  value={stockSearch}
                  onChange={(e) => {
                    setStockSearch(e.target.value);
                    setStockPage(1);
                  }}
                  className="w-full h-11 pl-9 pr-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              {/* Brand Filter */}
              <div>
                <select
                  value={stockBrandFilter}
                  onChange={(e) => {
                    setStockBrandFilter(e.target.value);
                    setStockPage(1);
                  }}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-medium"
                >
                  <option value="all">All Brands</option>
                  {availableBrands.map((b) => (
                    <option key={b} value={b}>
                      Brand: {b}
                    </option>
                  ))}
                </select>
              </div>

              {/* Stock Status Filter */}
              <div>
                <select
                  value={stockStatusFilter}
                  onChange={(e) => {
                    setStockStatusFilter(e.target.value as any);
                    setStockPage(1);
                  }}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-medium"
                >
                  <option value="all">Stock: All Stock Levels</option>
                  <option value="in_stock">Stock: In Stock (&gt; 10 pcs)</option>
                  <option value="low_stock">Stock: Low Stock (&le; 10 pcs)</option>
                  <option value="out_of_stock">Stock: Out of Stock (0 pcs)</option>
                </select>
              </div>

              {/* Shop Location Filter */}
              <div>
                <select
                  value={stockShopFilter}
                  onChange={(e) => {
                    setStockShopFilter(e.target.value);
                    setStockPage(1);
                  }}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-medium"
                >
                  <option value="all">Location: All Outlets</option>
                  {shops.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      Location: {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Stock Table */}
            <div className="overflow-x-auto rounded-xl border border-light-border dark:border-dark-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider border-b border-light-border dark:border-dark-border font-semibold">
                    <th className="py-3 px-4">SKU / Code</th>
                    <th className="py-3 px-4">Product Name</th>
                    <th className="py-3 px-4">Brand</th>
                    <th className="py-3 px-4">Category</th>
                    {sizesOn && <th className="py-3 px-4">Size</th>}
                    <th className="py-3 px-4 text-right">Cost Price (৳)</th>
                    <th className="py-3 px-4 text-right">Selling Price (৳)</th>
                    <th className="py-3 px-4 text-right">Margin %</th>
                    <th className="py-3 px-4 text-right">Available Qty</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-border dark:divide-dark-border font-mono">
                  {paginatedStock.length > 0 ? (
                    paginatedStock.map((item) => {
                      const relevantStocks = stockShopFilter === 'all'
                        ? item.stocks
                        : item.stocks.filter((s) => String(s.location_id) === stockShopFilter);
                      const totalQty = relevantStocks.reduce((sum, s) => sum + s.qty, 0);
                      const marginPct =
                        item.selling_price > 0
                          ? Math.round(((item.selling_price - item.cost_price) / item.selling_price) * 100)
                          : 0;

                      return (
                        <tr
                          key={item.variation_id}
                          className="hover:bg-light-surface-hover/70 dark:hover:bg-dark-surface-hover/70 transition-colors"
                        >
                          <td className="py-3 px-4 font-bold text-primary dark:text-primary-tint">
                            {item.sku}
                          </td>
                          <td className="py-3 px-4 font-sans font-semibold text-light-text dark:text-dark-text">
                            {item.product_name}
                          </td>
                          <td className="py-3 px-4 font-sans text-light-text-muted dark:text-dark-text-muted">
                            {item.brand_name || 'AR Option'}
                          </td>
                          <td className="py-3 px-4 font-sans text-light-text-muted dark:text-dark-text-muted">
                            {item.category_name || '-'}
                          </td>
                          {sizesOn && (
                            <td className="py-3 px-4 font-bold">
                              {sizeLabel(item.size, sizesOn) && (
                                <span className="px-2 py-0.5 rounded-md bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border">
                                  {sizeLabel(item.size, sizesOn)}
                                </span>
                              )}
                            </td>
                          )}
                          <td className="py-3 px-4 text-right">
                            {item.cost_price.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-light-text dark:text-dark-text">
                            {item.selling_price.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-right text-success-text-light dark:text-success font-bold">
                            {marginPct}%
                          </td>
                          <td className="py-3 px-4 text-right font-extrabold text-sm">
                            {totalQty}
                          </td>
                          <td className="py-3 px-4 text-center">
                            {totalQty > 10 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/15 text-success-text-light dark:text-success">
                                In Stock
                              </span>
                            ) : totalQty > 0 ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-warning/15 text-warning-text-light dark:text-warning">
                                Low ({totalQty})
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-danger/15 text-danger-text-light dark:text-danger">
                                Out of Stock
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={sizesOn ? 10 : 9} className="py-10 text-center text-light-text-muted dark:text-dark-text-muted font-sans">
                        No products match the selected filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Stock Pagination */}
            <Pagination
              totalItems={filteredStock.length}
              currentPage={stockPage}
              pageSize={stockPageSize}
              onPageChange={setStockPage}
              onPageSizeChange={(newSize) => {
                setStockPageSize(newSize);
                setStockPage(1);
              }}
              itemLabel="item"
              itemLabelPlural="items"
            />
          </div>
        )}

        {/* -------------------- TAB 3: DISPATCH QUEUE -------------------- */}
        {activeTableTab === 'dispatch' && (
          <div className="space-y-4 p-4 md:p-6">
            {/* Dispatch Queue Filters Bar */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3.5 text-light-text-muted dark:text-dark-text-muted" />
                <input
                  type="text"
                  placeholder="Search parcel code, customer, city..."
                  value={dispatchSearch}
                  onChange={(e) => {
                    setDispatchSearch(e.target.value);
                    setDispatchPage(1);
                  }}
                  className="w-full h-11 pl-9 pr-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
              </div>

              {/* Courier Service Filter */}
              <div>
                <select
                  value={dispatchCourierFilter}
                  onChange={(e) => {
                    setDispatchCourierFilter(e.target.value);
                    setDispatchPage(1);
                  }}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-medium"
                >
                  <option value="all">All Couriers</option>
                  {availableCouriers.map((c) => (
                    <option key={c} value={c}>
                      Courier: {c}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status Filter */}
              <div>
                <select
                  value={dispatchStatusFilter}
                  onChange={(e) => {
                    setDispatchStatusFilter(e.target.value);
                    setDispatchPage(1);
                  }}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-medium"
                >
                  <option value="all">Queue: All Statuses</option>
                  <option value="pending">Queue: Pending Dispatch</option>
                  <option value="delivered">Queue: Delivered</option>
                  <option value="returned">Queue: Returned</option>
                  <option value="unpaid">Payment: Unpaid COD</option>
                  <option value="settled">Payment: Settled</option>
                </select>
              </div>

              {/* Shop Location Filter */}
              <div>
                <select
                  value={dispatchShopFilter}
                  onChange={(e) => {
                    setDispatchShopFilter(e.target.value);
                    setDispatchPage(1);
                  }}
                  className="w-full h-11 px-3 rounded-xl text-xs bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring font-medium"
                >
                  <option value="all">Origin: All Outlets</option>
                  {shops.map((s) => (
                    <option key={s.id} value={String(s.id)}>
                      Origin: {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Dispatch Queue Table */}
            <div className="overflow-x-auto rounded-xl border border-light-border dark:border-dark-border">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted dark:text-dark-text-muted uppercase tracking-wider border-b border-light-border dark:border-dark-border font-semibold">
                    <th className="py-3 px-4">Parcel Code</th>
                    <th className="py-3 px-4">Shop Origin</th>
                    <th className="py-3 px-4">Customer & City</th>
                    <th className="py-3 px-4">Courier Partner</th>
                    <th className="py-3 px-4 text-right">Order Value (৳)</th>
                    <th className="py-3 px-4 text-right">Advance (৳)</th>
                    <th className="py-3 px-4 text-right">Collectible COD (৳)</th>
                    <th className="py-3 px-4 text-center">Delivery Status</th>
                    <th className="py-3 px-4 text-center">Payment Status</th>
                    <th className="py-3 px-4">Booked At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-light-border dark:divide-dark-border font-mono">
                  {paginatedParcels.length > 0 ? (
                    paginatedParcels.map((parcel) => (
                      <tr
                        key={parcel.id}
                        className="hover:bg-light-surface-hover/70 dark:hover:bg-dark-surface-hover/70 transition-colors"
                      >
                        <td className="py-3 px-4 font-bold text-primary dark:text-primary-tint">
                          <div>{parcel.parcel_code}</div>
                          {parcel.tracking_number && (
                            <div className="text-[10px] text-light-text-muted font-normal">
                              TRK: {parcel.tracking_number}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 font-sans">
                          <div className="font-semibold">{parcel.shop_name}</div>
                          <div className="text-[10px] text-light-text-muted">{parcel.shop_code}</div>
                        </td>
                        <td className="py-3 px-4 font-sans max-w-xs">
                          <div className="font-semibold text-light-text dark:text-dark-text">
                            {parcel.customer_name}
                          </div>
                          <div className="text-[10px] text-light-text-muted">{parcel.customer_phone}</div>
                          <div className="text-[10px] text-light-text-muted truncate">{parcel.customer_address}</div>
                        </td>
                        <td className="py-3 px-4 font-sans font-bold">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border">
                            {parcel.courier_name}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          {parcel.order_value.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right text-light-text-muted">
                          {parcel.advance_amount.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right font-extrabold text-warning">
                          ৳{parcel.collectible_amount.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              parcel.delivery_status === 'delivered'
                                ? 'bg-success/15 text-success-text-light dark:text-success'
                                : parcel.delivery_status === 'returned'
                                ? 'bg-danger/15 text-danger-text-light dark:text-danger'
                                : 'bg-warning/15 text-warning-text-light dark:text-warning'
                            }`}
                          >
                            {parcel.delivery_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              parcel.payment_status === 'paid'
                                ? 'bg-success/15 text-success-text-light dark:text-success'
                                : 'bg-light-surface-hover dark:bg-dark-surface-hover text-light-text-muted dark:text-dark-text-muted border border-light-border dark:border-dark-border'
                            }`}
                          >
                            {parcel.payment_status}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-sans text-light-text-muted dark:text-dark-text-muted text-[11px] whitespace-nowrap">
                          {new Date(parcel.created_at).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-light-text-muted dark:text-dark-text-muted font-sans">
                        No parcels found in the dispatch queue.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Dispatch Pagination */}
            <Pagination
              totalItems={filteredParcels.length}
              currentPage={dispatchPage}
              pageSize={dispatchPageSize}
              onPageChange={setDispatchPage}
              onPageSizeChange={(newSize) => {
                setDispatchPageSize(newSize);
                setDispatchPage(1);
              }}
              itemLabel="parcel"
              itemLabelPlural="parcels"
            />
          </div>
        )}
      </div>
    </div>
  );
};
