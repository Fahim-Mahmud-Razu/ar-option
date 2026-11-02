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
import { ReturnsService } from './returns.service';
import { ShopGuard } from '../shops/shop.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateReturnDto, ReturnRecord } from '@ar-option/shared-types';

@Controller('returns')
export class ReturnsController {
  constructor(private readonly returnsService: ReturnsService) {}

  @Get()
  async listReturns(
    @Query('shop_id') shopId?: string,
    @Query('is_manual') isManual?: string
  ): Promise<ReturnRecord[]> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    const manual = isManual !== undefined ? isManual === 'true' : undefined;
    return this.returnsService.listReturns(sId, manual);
  }

  @Get(':id')
  async getReturn(@Param('id', ParseIntPipe) id: number): Promise<ReturnRecord> {
    return this.returnsService.getReturnById(id);
  }

  @Post()
  @UseGuards(ShopGuard, PermissionsGuard)
  @RequirePermission('returns.create')
  async createReturn(
    @Body() body: CreateReturnDto,
    @Req() req: any
  ): Promise<ReturnRecord> {
    return this.returnsService.createReturn(body, req.shopId, req.user);
  }

  @Post(':id/approve')
  @UseGuards(PermissionsGuard)
  @RequirePermission('returns.approve')
  async approveReturn(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any
  ): Promise<ReturnRecord> {
    return this.returnsService.approveReturn(id, req.user);
  }
}

