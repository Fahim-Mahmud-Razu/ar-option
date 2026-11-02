import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { ShopsModule } from './shops/shops.module';
import { LedgerModule } from './ledger/ledger.module';
import { AuthModule } from './auth/auth.module';
import { StockModule } from './stock/stock.module';
import { ReportsModule } from './reports/reports.module';

@Module({
  imports: [DatabaseModule, AuthModule, ShopsModule, LedgerModule, StockModule, ReportsModule],
  controllers: [HealthController],
})
export class AppModule {}
