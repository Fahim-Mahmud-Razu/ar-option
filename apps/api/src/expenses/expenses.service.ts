import {
  Injectable,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { LedgerService } from '../ledger/ledger.service';
import { CreateExpenseDto, Expense, ExpenseCategory } from '@ar-option/shared-types';

@Injectable()
export class ExpensesService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly ledgerService: LedgerService
  ) {}

  async listCategories(): Promise<ExpenseCategory[]> {
    const res = await this.pool.query(
      'SELECT id, name, is_active FROM expense_categories WHERE is_active = true ORDER BY name ASC'
    );
    return res.rows;
  }

  /**
   * Rule 1: Every expense belongs to a shop.
   * Rule 3: Double-entry ledger is source of truth (Dr Operating Expenses, Cr Payment Account).
   */
  async createExpense(
    dto: CreateExpenseDto,
    shopId: number,
    userId?: number,
    opts: { client?: PoolClient; client_ref?: string } = {}
  ): Promise<Expense> {
    // With a client, every read and write joins the caller's transaction.
    const db: Pick<Pool, 'query'> = opts.client ?? this.pool;
    if (!shopId) {
      throw new BadRequestException('Shop ID is required to record an expense.');
    }
    if (!dto.amount || dto.amount <= 0) {
      throw new BadRequestException('Expense amount must be greater than zero.');
    }
    if (!dto.category_id) {
      throw new BadRequestException('Expense category is required.');
    }
    if (!dto.payment_account_id) {
      throw new BadRequestException('Payment account is required.');
    }

    // 1. Verify category exists
    const catRes = await db.query(
      'SELECT id, name FROM expense_categories WHERE id = $1 AND is_active = true',
      [dto.category_id]
    );
    if (catRes.rows.length === 0) {
      throw new NotFoundException(`Expense category #${dto.category_id} not found.`);
    }
    const category = catRes.rows[0];

    // 2. Verify payment account
    const accRes = await db.query(
      'SELECT id, code, name, type, location_id, is_active FROM accounts WHERE id = $1',
      [dto.payment_account_id]
    );
    if (accRes.rows.length === 0) {
      throw new NotFoundException(`Payment account #${dto.payment_account_id} not found.`);
    }
    const payAccount = accRes.rows[0];

    if (payAccount.type !== 'asset') {
      throw new BadRequestException(`Payment account must be an asset account. Got: ${payAccount.type}`);
    }

    // Rule 1: Cross-shop account check
    if (payAccount.location_id !== null && payAccount.location_id !== shopId) {
      throw new BadRequestException(
        `Payment account '${payAccount.code}' belongs to shop ID ${payAccount.location_id}, which does not match active shop ID ${shopId}. Cross-shop expenses are prohibited by Rule 1.`
      );
    }

    const refNo = dto.ref_no || opts.client_ref || `EXP-${Date.now()}`;

    // 3. Post balanced double-entry transaction to ledger
    // Dr OPERATING_EXPENSES (amount)
    // Cr payAccount.code (amount)
    const postRes = await this.ledgerService.postEntry(
      {
        shop_id: shopId,
        entry_type: 'expense',
        source_type: 'expense',
        source_id: refNo,
        client_ref: opts.client_ref,
        notes: dto.notes || `${category.name} expense`,
        lines: [
          {
            account_code: 'OPERATING_EXPENSES',
            direction: 'debit',
            amount: Number(dto.amount),
            notes: `${category.name} expense`,
          },
          {
            account_code: payAccount.code,
            direction: 'credit',
            amount: Number(dto.amount),
            notes: `Payment for ${category.name}`,
          },
        ],
      },
      userId,
      opts.client
    );

    // 4. Insert into expenses table
    const insRes = await db.query(
      `INSERT INTO expenses (
        location_id,
        category_id,
        amount,
        payment_account_id,
        entry_id,
        ref_no,
        notes,
        created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id, created_at`,
      [
        shopId,
        dto.category_id,
        dto.amount,
        dto.payment_account_id,
        postRes.entry_id,
        refNo,
        dto.notes || null,
        userId || null,
      ]
    );

    // 5. Fetch shop info
    const shopRes = await db.query(
      'SELECT name, code FROM locations WHERE id = $1',
      [shopId]
    );
    const shop = shopRes.rows[0];

    return {
      id: insRes.rows[0].id,
      location_id: shopId,
      shop_name: shop.name,
      shop_code: shop.code,
      category_id: category.id,
      category_name: category.name,
      amount: Number(dto.amount),
      payment_account_id: payAccount.id,
      payment_account_name: payAccount.name,
      entry_id: postRes.entry_id,
      ref_no: refNo,
      notes: dto.notes || undefined,
      created_by: userId,
      created_at: insRes.rows[0].created_at,
    };
  }

  /**
   * Section 5.4: Shop-level reporting applied in SQL.
   */
  async listExpenses(
    shopId?: number,
    categoryId?: number
  ): Promise<Expense[]> {
    let sql = `
      SELECT 
        e.id,
        e.location_id,
        l.name AS shop_name,
        l.code AS shop_code,
        e.category_id,
        c.name AS category_name,
        e.amount,
        e.payment_account_id,
        a.name AS payment_account_name,
        e.entry_id,
        e.ref_no,
        e.notes,
        e.created_by,
        e.created_at
      FROM expenses e
      JOIN locations l ON e.location_id = l.id
      JOIN expense_categories c ON e.category_id = c.id
      JOIN accounts a ON e.payment_account_id = a.id
      WHERE 1=1
    `;
    const params: any[] = [];

    if (shopId) {
      params.push(shopId);
      sql += ` AND e.location_id = $${params.length}`;
    }

    if (categoryId) {
      params.push(categoryId);
      sql += ` AND e.category_id = $${params.length}`;
    }

    sql += ` ORDER BY e.id DESC`;

    const res = await this.pool.query(sql, params);
    return res.rows.map((r) => ({
      ...r,
      amount: Number(r.amount),
    }));
  }
}

