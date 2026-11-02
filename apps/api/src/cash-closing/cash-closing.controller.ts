import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { CashClosingService } from './cash-closing.service';
import { AuthGuard } from '../auth/auth.guard';
import { ShopGuard } from '../shops/shop.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import {
  CreateCashClosingDto,
  DailyCashClosing,
  CashDrawerSummary,
} from '@ar-option/shared-types';

@Controller('cash-closing')
@UseGuards(AuthGuard, ShopGuard, PermissionsGuard)
export class CashClosingController {
  constructor(private readonly cashClosingService: CashClosingService) {}

  @Get('drawer-summary')
  @RequirePermission('cash.reconcile')
  async getDrawerSummary(@Query('shop_id') shopId?: string): Promise<CashDrawerSummary> {
    if (!shopId) {
      throw new BadRequestException('shop_id query parameter is required.');
    }
    const sId = parseInt(shopId, 10);
    return this.cashClosingService.getCashDrawerSummary(sId);
  }

  @Post()
  @RequirePermission('cash.reconcile')
  async createCashClosing(
    @Body() dto: CreateCashClosingDto,
    @Req() req: any
  ): Promise<DailyCashClosing> {
    const userId = req.user?.id || 1;
    return this.cashClosingService.createCashClosing(dto, userId);
  }

  @Get()
  @RequirePermission('cash.reconcile')
  async listDailyCashClosings(
    @Query('shop_id') shopId?: string
  ): Promise<DailyCashClosing[]> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    return this.cashClosingService.listDailyCashClosings(sId);
  }
}

