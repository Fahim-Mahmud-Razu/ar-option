import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ExpensesService } from './expenses.service';
import { ShopGuard } from '../shops/shop.guard';
import { CreateExpenseDto, Expense, ExpenseCategory } from '@ar-option/shared-types';

@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get('categories')
  async getCategories(): Promise<ExpenseCategory[]> {
    return this.expensesService.listCategories();
  }

  @Get()
  async getExpenses(
    @Query('shop_id') shopId?: string,
    @Query('category_id') categoryId?: string
  ): Promise<Expense[]> {
    const sId = shopId ? parseInt(shopId, 10) : undefined;
    const cId = categoryId ? parseInt(categoryId, 10) : undefined;
    return this.expensesService.listExpenses(sId, cId);
  }

  @Post()
  @UseGuards(ShopGuard)
  async createExpense(
    @Body() body: CreateExpenseDto,
    @Req() req: any
  ): Promise<Expense> {
    return this.expensesService.createExpense(body, req.shopId, req.user?.id);
  }
}

