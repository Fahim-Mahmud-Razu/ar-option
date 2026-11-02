import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { DashboardKpis, StockByShopGridItem } from '@ar-option/shared-types';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('dashboard-kpis')
  async getDashboardKpis(
    @Query('shop_id') shopId?: string
  ): Promise<DashboardKpis> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    return this.reportsService.getDashboardKpis(sId);
  }

  @Get('stock-by-shop')
  async getStockByShop(): Promise<StockByShopGridItem[]> {
    return this.reportsService.getStockByShopGrid();
  }
}

