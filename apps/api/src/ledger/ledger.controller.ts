import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { ShopGuard } from '../shops/shop.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PostEntryDto, TrialBalanceItem, Account } from '@ar-option/shared-types';

@Controller('ledger')
export class LedgerController {
  constructor(private readonly ledgerService: LedgerService) {}

  @Get('accounts')
  async getAccounts(
    @Query('shop_id') shopId?: string
  ): Promise<Account[]> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    return this.ledgerService.getAccounts(sId);
  }

  @Post('entries')
  @UseGuards(ShopGuard)
  async postEntry(
    @Body() entry: PostEntryDto,
    @Req() req: any
  ): Promise<{ entry_id: string; lines_posted: number }> {
    // Stamp resolved shopId if not already in payload
    if (req.shopId && !entry.shop_id) {
      entry.shop_id = req.shopId;
    }
    return this.ledgerService.postEntry(entry, req.user?.id);
  }

  @Get('trial-balance')
  async getTrialBalance(
    @Query('shop_id') shopId?: string
  ): Promise<{
    items: TrialBalanceItem[];
    totalDebit: number;
    totalCredit: number;
    isBalanced: boolean;
  }> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    return this.ledgerService.getTrialBalance(sId);
  }
}
