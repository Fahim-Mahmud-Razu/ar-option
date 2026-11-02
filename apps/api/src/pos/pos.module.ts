import { Module } from '@nestjs/common';
import { PosService } from './pos.service';
import { PosController } from './pos.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { StockModule } from '../stock/stock.module';
import { ShopsModule } from '../shops/shops.module';

@Module({
  imports: [LedgerModule, StockModule, ShopsModule],
  controllers: [PosController],
  providers: [PosService],
  exports: [PosService],
})
export class PosModule {}

