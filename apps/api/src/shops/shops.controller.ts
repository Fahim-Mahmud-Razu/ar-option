import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  Query,
  ParseIntPipe,
} from '@nestjs/common';
import { ShopsService } from './shops.service';
import { ShopGuard } from './shop.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermission } from '../auth/require-permission.decorator';
import { Shop } from '@ar-option/shared-types';

@Controller('shops')
export class ShopsController {
  constructor(private readonly shopsService: ShopsService) {}

  @Get()
  async getShops(@Query('include_system') includeSystem?: string): Promise<Shop[]> {
    return this.shopsService.listShops(includeSystem === 'true');
  }

  @Get(':id')
  async getShop(@Param('id', ParseIntPipe) id: number): Promise<Shop | null> {
    return this.shopsService.getShopById(id);
  }

  @Post()
  @UseGuards(PermissionsGuard)
  @RequirePermission('shops.manage')
  async createShop(
    @Body() body: { name: string; code: string }
  ): Promise<Shop> {
    return this.shopsService.createShop(body.name, body.code);
  }

  @Put(':id')
  @UseGuards(PermissionsGuard)
  @RequirePermission('shops.manage')
  async updateShop(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { name?: string; is_active?: boolean }
  ): Promise<Shop> {
    return this.shopsService.updateShop(id, body);
  }
}

