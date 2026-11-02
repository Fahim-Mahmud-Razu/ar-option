import { Module } from '@nestjs/common';
import { CashClosingService } from './cash-closing.service';
import { CashClosingController } from './cash-closing.controller';
import { DatabaseModule } from '../database/database.module';
import { AuthModule } from '../auth/auth.module';
import { ShopsModule } from '../shops/shops.module';

@Module({
  imports: [DatabaseModule, AuthModule, ShopsModule],
  controllers: [CashClosingController],
  providers: [CashClosingService],
  exports: [CashClosingService],
})
export class CashClosingModule {}

