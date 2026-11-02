import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { ShopsModule } from './shops/shops.module';
import { LedgerModule } from './ledger/ledger.module';
import { AuthModule } from './auth/auth.module';
import { StockModule } from './stock/stock.module';
import { ReportsModule } from './reports/reports.module';
import { ExpensesModule } from './expenses/expenses.module';
import { PosModule } from './pos/pos.module';
import { ReturnsModule } from './returns/returns.module';
import { CourierModule } from './courier/courier.module';
import { CashClosingModule } from './cash-closing/cash-closing.module';
import { TillModule } from './till/till.module';
import { ContactsModule } from './contacts/contacts.module';

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    ShopsModule,
    LedgerModule,
    StockModule,
    ReportsModule,
    ExpensesModule,
    PosModule,
    ReturnsModule,
    CourierModule,
    CashClosingModule,
    TillModule,
    ContactsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
