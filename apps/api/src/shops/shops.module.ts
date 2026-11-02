import { Module } from '@nestjs/common';
import { ShopsController } from './shops.controller';
import { ShopsService } from './shops.service';
import { ShopGuard } from './shop.guard';

@Module({
  controllers: [ShopsController],
  providers: [ShopsService, ShopGuard],
  exports: [ShopsService, ShopGuard],
})
export class ShopsModule {}

