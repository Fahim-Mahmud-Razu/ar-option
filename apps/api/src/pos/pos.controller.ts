import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
} from '@nestjs/common';
import { PosService } from './pos.service';
import { ShopGuard } from '../shops/shop.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateSaleDto, Sale } from '@ar-option/shared-types';

@Controller('pos')
export class PosController {
  constructor(private readonly posService: PosService) {}

  @Get('sales')
  async listSales(
    @Query('shop_id') shopId?: string
  ): Promise<Sale[]> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    return this.posService.listSales(sId);
  }

  @Get('sales/:id')
  async getSale(
    @Param('id', ParseIntPipe) id: number
  ): Promise<Sale> {
    return this.posService.getSaleById(id);
  }

  @Post('sales')
  @UseGuards(ShopGuard, PermissionsGuard)
  @RequirePermission('pos.sell')
  async createSale(
    @Body() body: CreateSaleDto,
    @Req() req: any
  ): Promise<Sale> {
    return this.posService.createSale(body, req.shopId, req.user);
  }
}

