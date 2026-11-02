import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CashClosingService } from './cash-closing.service';
import { ShopGuard } from '../shops/shop.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { DailyCashClosing } from '@ar-option/shared-types';

@Controller('cash-closing')
@UseGuards(ShopGuard, PermissionsGuard)
export class CashClosingController {
  constructor(private readonly cashClosingService: CashClosingService) {}

  @Get()
  @RequirePermission('cash.reconcile')
  async listDailyCashClosings(
    @Query('shop_id') shopId?: string
  ): Promise<DailyCashClosing[]> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    return this.cashClosingService.listDailyCashClosings(sId);
  }
}

