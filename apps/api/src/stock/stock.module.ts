import { Module } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { ShopsModule } from '../shops/shops.module';

@Module({
  imports: [ShopsModule],
  controllers: [ProductsController, TransfersController],
  providers: [StockMovementService, ProductsService, TransfersService],
  exports: [StockMovementService, ProductsService, TransfersService],
})
export class StockModule {}

