import { Module } from '@nestjs/common';
import { TillService } from './till.service';
import { TillController } from './till.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ShopsModule } from '../shops/shops.module';
import { LedgerModule } from '../ledger/ledger.module';
import { ExpensesModule } from '../expenses/expenses.module';

@Module({
  imports: [DatabaseModule, AuthModule, ShopsModule, LedgerModule, ExpensesModule],
  controllers: [TillController],
  providers: [TillService],
})
export class TillModule {}
