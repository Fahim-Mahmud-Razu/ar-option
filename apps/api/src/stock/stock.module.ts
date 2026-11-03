import { Module } from '@nestjs/common';
import { StockMovementService } from './stock-movement.service';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { TransfersService } from './transfers.service';
import { ImportsService } from './imports.service';
import { ImportsController } from './imports.controller';
import { TransfersController } from './transfers.controller';
import { ShopsModule } from '../shops/shops.module';
import { LedgerModule } from '../ledger/ledger.module';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [ShopsModule, LedgerModule, SettingsModule],
  controllers: [ProductsController, ImportsController, TransfersController],
  providers: [StockMovementService, ProductsService, ImportsService, TransfersService],
  exports: [StockMovementService, ProductsService, TransfersService],
})
export class StockModule {}

