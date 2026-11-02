import { Module } from '@nestjs/common';
import { CourierService } from './courier.service';
import { CourierController } from './courier.controller';
import { DatabaseModule } from '../database/database.module';
import { LedgerModule } from '../ledger/ledger.module';
import { StockModule } from '../stock/stock.module';
import { ShopsModule } from '../shops/shops.module';

@Module({
  imports: [DatabaseModule, LedgerModule, StockModule, ShopsModule],
  controllers: [CourierController],
  providers: [CourierService],
  exports: [CourierService],
})
export class CourierModule {}

