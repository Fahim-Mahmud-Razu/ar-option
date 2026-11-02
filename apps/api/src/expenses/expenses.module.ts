import { Module } from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ExpensesController } from './expenses.controller';
import { LedgerModule } from '../ledger/ledger.module';
import { ShopsModule } from '../shops/shops.module';

@Module({
  imports: [LedgerModule, ShopsModule],
  controllers: [ExpensesController],
  providers: [ExpensesService],
  exports: [ExpensesService],
})
export class ExpensesModule {}

