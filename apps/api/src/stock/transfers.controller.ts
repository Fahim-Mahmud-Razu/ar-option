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
import { TransfersService } from './transfers.service';
import { ShopGuard } from '../shops/shop.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import {
  CreateTransferDto,
  ReceiveTransferDto,
  StockTransfer,
} from '@ar-option/shared-types';

@Controller('transfers')
export class TransfersController {
  constructor(private readonly transfersService: TransfersService) {}

  @Get()
  async listTransfers(
    @Query('status') status?: string,
    @Query('shop_id') shopId?: string
  ): Promise<StockTransfer[]> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    return this.transfersService.listTransfers(status, sId);
  }

  @Get(':id')
  async getTransfer(
    @Param('id', ParseIntPipe) id: number
  ): Promise<StockTransfer> {
    return this.transfersService.getTransferById(id);
  }

  @Post()
  @UseGuards(ShopGuard, PermissionsGuard)
  @RequirePermission('transfers.send')
  async createTransfer(
    @Body() body: CreateTransferDto,
    @Req() req: any
  ): Promise<StockTransfer> {
    return this.transfersService.sendTransfer(body, req.shopId, req.user);
  }

  @Post(':id/receive')
  @UseGuards(PermissionsGuard)
  @RequirePermission('transfers.receive')
  async receiveTransfer(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ReceiveTransferDto,
    @Req() req: any
  ): Promise<StockTransfer> {
    return this.transfersService.receiveTransfer(id, body, req.user);
  }
}

