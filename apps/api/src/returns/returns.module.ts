import { Module } from '@nestjs/common';
import { ReturnsService } from './returns.service';
import { ReturnsController } from './returns.controller';
import { DatabaseModule } from '../database/database.module';
import { LedgerModule } from '../ledger/ledger.module';
import { StockModule } from '../stock/stock.module';
import { ShopsModule } from '../shops/shops.module';

@Module({
  imports: [DatabaseModule, LedgerModule, StockModule, ShopsModule],
  controllers: [ReturnsController],
  providers: [ReturnsService],
  exports: [ReturnsService],
})
export class ReturnsModule {}

