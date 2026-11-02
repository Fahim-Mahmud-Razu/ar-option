import {
  Injectable,
  Inject,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { LedgerService } from '../ledger/ledger.service';
import { ExpensesService } from '../expenses/expenses.service';
import {
  CloseTillDto,
  OpenTillDto,
  PermissionKey,
  TillMovement,
  TillMovementDto,
  TillOverview,
  TillSession,
  TillStatus,
  TillSummary,
} from '@ar-option/shared-types';

type Db = Pick<Pool, 'query'>;
interface Actor {
  id: number;
  role: string;
}

const toPaisa = (v: unknown): number => Math.round(Number(v) * 100);
const fromPaisa = (p: number): number => p / 100;

function requireRef(ref: unknown): string {
  if (typeof ref !== 'string' || !ref.trim() || ref.length > 80) {
    throw new BadRequestException('client_ref is required (80 characters at most).');
  }
  return ref.trim();
}

function requireMoney(value: unknown, label: string, allowZero = false): number {
  const n = Number(value);
  const paisa = toPaisa(n);
  if (!Number.isFinite(n) || paisa < 0 || (!allowZero && paisa === 0)) {
    throw new BadRequestException(
      allowZero ? `${label} cannot be negative.` : `${label} must be greater than zero.`
    );
  }
  return paisa;
}

/**
 * Rule 3: the expected cash in a till is always the ledger balance of the shop's cash account.
 * Nothing here keeps a second balance. Every cash movement is a ledger entry with its own client_ref.
 */
@Injectable()
export class TillService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly ledger: LedgerService,
    private readonly expenses: ExpensesService
  ) {}

  private async can(user: Actor, key: PermissionKey): Promise<boolean> {
    if (user.role === 'admin') return true;
    const res = await this.pool.query(
      'SELECT 1 FROM role_permissions WHERE role = $1 AND permission = $2',
      [user.role, key]
    );
    return res.rows.length > 0;
  }

  private async requirePermission(user: Actor, key: PermissionKey): Promise<void> {
    if (!(await this.can(user, key))) {
      throw new ForbiddenException(
        `Permission denied. Missing required permission: '${key}' for role '${user.role}'`
      );
    }
  }

  private async getShop(db: Db, shopId: number) {
    if (!shopId) throw new BadRequestException('An active shop is required.');
    const res = await db.query(
      'SELECT id, name, code, is_system FROM locations WHERE id = $1',
      [shopId]
    );
    if (res.rows.length === 0) throw new NotFoundException(`Shop #${shopId} not found.`);
    if (res.rows[0].is_system) {
      throw new BadRequestException('System locations do not have a till.');
    }
    return res.rows[0];
  }

  private async getCashAccount(db: Db, shop: { id: number; name: string }) {
    const res = await db.query(
      "SELECT id, code FROM accounts WHERE location_id = $1 AND payment_method = 'cash'",
      [shop.id]
    );
    if (res.rows.length === 0) {
      throw new BadRequestException(`Shop '${shop.name}' does not have a cash account.`);
    }
    return res.rows[0] as { id: number; code: string };
  }

  /** Ledger balance of an asset account, in whole paisa. */
  private async balancePaisa(db: Db, accountId: number): Promise<number> {
    const res = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount ELSE -amount END), 0) AS balance
       FROM account_transactions WHERE account_id = $1`,
      [accountId]
    );
    return toPaisa(res.rows[0].balance);
  }

  private mapSession(row: any): TillSession {
    const num = (v: any) => (v === null || v === undefined ? null : Number(v));
    return {
      id: Number(row.id),
      location_id: row.location_id,
      status: row.status,
      opened_by: row.opened_by,
      opened_by_name: row.opened_by_name ?? null,
      opened_at: row.opened_at,
      opening_float: Number(row.opening_float),
      open_adjustment: Number(row.open_adjustment),
      open_reason: row.open_reason,
      open_note: row.open_note,
      closed_by: row.closed_by,
      closed_at: row.closed_at,
      expected_cash: num(row.expected_cash),
      counted_cash: num(row.counted_cash),
      difference: num(row.difference),
      difference_reason: row.difference_reason,
      handover_amount: num(row.handover_amount),
      retained_amount: num(row.retained_amount),
      close_note: row.close_note,
    };
  }

  private async buildSummary(db: Db, session: any, accountId: number): Promise<TillSummary> {
    const sums = await db.query(
      `SELECT
         COALESCE(SUM(CASE WHEN entry_type = 'sale'
           THEN CASE WHEN direction = 'debit' THEN amount ELSE -amount END ELSE 0 END), 0) AS cash_sales,
         COALESCE(SUM(CASE WHEN entry_type = 'till_pay_in'
           THEN CASE WHEN direction = 'debit' THEN amount ELSE -amount END ELSE 0 END), 0) AS pay_ins,
         COALESCE(SUM(CASE WHEN entry_type = 'expense'
           THEN CASE WHEN direction = 'credit' THEN amount ELSE -amount END ELSE 0 END), 0) AS petty_cash,
         COALESCE(SUM(CASE WHEN entry_type IN ('return', 'manual_return')
           THEN CASE WHEN direction = 'credit' THEN amount ELSE -amount END ELSE 0 END), 0) AS refunds
       FROM account_transactions
       WHERE account_id = $1
         AND created_at >= $2
         AND source_type IS DISTINCT FROM 'till_open'`,
      [accountId, session.opened_at]
    );
    const digital = await db.query(
      `SELECT COALESCE(SUM(CASE WHEN t.direction = 'debit' THEN t.amount ELSE -t.amount END), 0) AS digital
       FROM account_transactions t
       JOIN accounts a ON a.id = t.account_id
       WHERE a.type = 'asset' AND a.payment_method IS NOT NULL AND a.payment_method <> 'cash'
         AND t.entry_type = 'sale' AND t.location_id = $1 AND t.created_at >= $2`,
      [session.location_id, session.opened_at]
    );
    const current = await this.balancePaisa(db, accountId);
    const float = toPaisa(session.opening_float);
    const cashSales = toPaisa(sums.rows[0].cash_sales);
    const payIns = toPaisa(sums.rows[0].pay_ins);
    const petty = toPaisa(sums.rows[0].petty_cash);
    const refunds = toPaisa(sums.rows[0].refunds);
    // Whatever is left (owner pulls, courier advances, a sale that landed during the open) is Other Cash,
    // so the lines always add up to the drawer figure.
    const other = current - float - cashSales - payIns + petty + refunds;
    return {
      current_cash: fromPaisa(current),
      opening_float: fromPaisa(float),
      cash_sales: fromPaisa(cashSales),
      digital_sales: fromPaisa(toPaisa(digital.rows[0].digital)),
      pay_ins: fromPaisa(payIns),
      petty_cash: fromPaisa(petty),
      refunds: fromPaisa(refunds),
      other_cash: fromPaisa(other),
    };
  }

  async getStatus(shopId: number): Promise<TillStatus> {
    const shop = await this.getShop(this.pool, shopId);
    const account = await this.getCashAccount(this.pool, shop);
    const ledgerCash = fromPaisa(await this.balancePaisa(this.pool, account.id));

    const open = await this.pool.query(
      `SELECT s.*, u.name AS opened_by_name
       FROM till_sessions s LEFT JOIN users u ON u.id = s.opened_by
       WHERE s.location_id = $1 AND s.status = 'open'`,
      [shopId]
    );
    const any = await this.pool.query('SELECT 1 FROM till_sessions WHERE location_id = $1 LIMIT 1', [shopId]);

    let session: TillSession | null = null;
    let summary: TillSummary | null = null;
    let movements: TillMovement[] = [];
    if (open.rows.length > 0) {
      session = this.mapSession(open.rows[0]);
      summary = await this.buildSummary(this.pool, open.rows[0], account.id);
      const mv = await this.pool.query(
        `SELECT m.id, m.session_id, m.kind, m.amount, m.category_id, c.name AS category_name,
                m.note, m.created_by, u.name AS user_name, m.created_at
         FROM till_movements m
         LEFT JOIN expense_categories c ON c.id = m.category_id
         LEFT JOIN users u ON u.id = m.created_by
         WHERE m.session_id = $1 ORDER BY m.id DESC`,
        [open.rows[0].id]
      );
      movements = mv.rows.map((r) => ({ ...r, id: Number(r.id), session_id: Number(r.session_id), amount: Number(r.amount) }));
    }

    return {
      shop_id: shop.id,
      shop_name: shop.name,
      shop_code: shop.code,
      ledger_cash: ledgerCash,
      session,
      summary,
      movements,
      is_first_open: any.rows.length === 0,
    };
  }

  /** One row per shop for the dashboard Cash in Hand card. */
  async getOverview(shopIds: number[]): Promise<TillOverview> {
    const rows: TillOverview['shops'] = [];
    for (const id of shopIds) {
      const shopRes = await this.pool.query(
        'SELECT id, name, code FROM locations WHERE id = $1 AND is_system = false AND is_active = true',
        [id]
      );
      if (shopRes.rows.length === 0) continue;
      const shop = shopRes.rows[0];
      const accRes = await this.pool.query(
        "SELECT id FROM accounts WHERE location_id = $1 AND payment_method = 'cash'",
        [id]
      );
      if (accRes.rows.length === 0) continue;
      const accountId = accRes.rows[0].id;
      const open = await this.pool.query(
        "SELECT * FROM till_sessions WHERE location_id = $1 AND status = 'open'",
        [id]
      );
      const cash = fromPaisa(await this.balancePaisa(this.pool, accountId));
      let summary: TillSummary | null = null;
      if (open.rows.length > 0) summary = await this.buildSummary(this.pool, open.rows[0], accountId);
      rows.push({
        shop_id: shop.id,
        shop_name: shop.name,
        shop_code: shop.code,
        is_open: open.rows.length > 0,
        session_id: open.rows.length > 0 ? Number(open.rows[0].id) : null,
        cash_in_hand: cash,
        opening_float: summary?.opening_float ?? 0,
        cash_sales: summary?.cash_sales ?? 0,
        petty_cash: summary?.petty_cash ?? 0,
      });
    }
    const total = rows.reduce((sum, r) => sum + toPaisa(r.cash_in_hand), 0);
    return { shops: rows, total_cash: fromPaisa(total) };
  }

  async open(shopId: number, dto: OpenTillDto, user: Actor): Promise<TillStatus> {
    const ref = requireRef(dto.client_ref);
    const floatP = requireMoney(dto.opening_float, 'Opening float', true);
    const reason = dto.reason?.trim() || null;
    const canSetup = await this.can(user, 'till.setup');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const shop = await this.getShop(client, shopId);
      await client.query('SELECT id FROM locations WHERE id = $1 FOR NO KEY UPDATE', [shopId]);

      const same = await client.query(
        'SELECT location_id FROM till_sessions WHERE open_client_ref = $1',
        [ref]
      );
      if (same.rows.length > 0) {
        if (same.rows[0].location_id !== shopId) {
          throw new ConflictException('This client_ref was already used for another shop.');
        }
        await client.query('COMMIT');
      } else {
        const open = await client.query(
          "SELECT 1 FROM till_sessions WHERE location_id = $1 AND status = 'open'",
          [shopId]
        );
        if (open.rows.length > 0) throw new ConflictException('This shop already has an open till.');

        const prior = await client.query('SELECT 1 FROM till_sessions WHERE location_id = $1 LIMIT 1', [shopId]);
        const isFirst = prior.rows.length === 0;
        if (isFirst && !canSetup) {
          throw new ForbiddenException(
            "Permission denied. The first till open needs 'till.setup' because it sets the starting cash."
          );
        }

        const account = await this.getCashAccount(client, shop);
        const diffP = floatP - (await this.balancePaisa(client, account.id));
        if (diffP !== 0 && !isFirst && !reason) {
          throw new BadRequestException(
            `The float differs from the cash the books expect by ৳${fromPaisa(Math.abs(diffP)).toFixed(2)}. A reason is required.`
          );
        }

        const ins = await client.query(
          `INSERT INTO till_sessions
             (location_id, opened_by, opening_float, open_adjustment, open_reason, open_note, open_client_ref)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [shopId, user.id, fromPaisa(floatP), fromPaisa(diffP), reason, dto.note?.trim() || null, ref]
        );
        if (diffP !== 0) {
          await this.postCashDifference(client, {
            shopId,
            cashCode: account.code,
            diffP,
            otherCode: isFirst ? 'OWNER_EQUITY' : 'TILL_OVER_SHORT',
            entryType: 'till_open',
            sourceType: 'till_open',
            sourceId: String(ins.rows[0].id),
            clientRef: `${ref}:open`,
            notes: isFirst ? 'Starting cash set when the till was first opened' : `Till open difference: ${reason}`,
            userId: user.id,
          });
        }
        await client.query('COMMIT');
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getStatus(shopId);
  }

  async addMovement(shopId: number, dto: TillMovementDto, user: Actor): Promise<TillStatus> {
    const ref = requireRef(dto.client_ref);
    if (!['pay_in', 'pay_out', 'owner_pull'].includes(dto.kind)) {
      throw new BadRequestException('kind must be pay_in, pay_out or owner_pull.');
    }
    const amountP = requireMoney(dto.amount, 'Amount');
    await this.requirePermission(user, dto.kind === 'pay_in' ? 'till.cash_in' : 'till.cash_out');
    if (dto.kind === 'pay_out' && !dto.category_id) {
      throw new BadRequestException('A category is required for cash out.');
    }
    const note = dto.note?.trim() || null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const shop = await this.getShop(client, shopId);
      await client.query('SELECT id FROM locations WHERE id = $1 FOR NO KEY UPDATE', [shopId]);

      const same = await client.query('SELECT location_id FROM till_movements WHERE client_ref = $1', [ref]);
      if (same.rows.length > 0) {
        if (same.rows[0].location_id !== shopId) {
          throw new ConflictException('This client_ref was already used for another shop.');
        }
        await client.query('COMMIT');
      } else {
        const sess = await client.query(
          "SELECT id FROM till_sessions WHERE location_id = $1 AND status = 'open'",
          [shopId]
        );
        if (sess.rows.length === 0) throw new ConflictException('Open the till first.');
        const sessionId = sess.rows[0].id;

        const account = await this.getCashAccount(client, shop);
        const balanceP = await this.balancePaisa(client, account.id);
        if (dto.kind !== 'pay_in' && amountP > balanceP) {
          throw new BadRequestException(
            `Not enough cash in the till. The drawer holds ৳${fromPaisa(balanceP).toFixed(2)}.`
          );
        }

        let entryId: string | null = null;
        let expenseId: number | null = null;
        const amount = fromPaisa(amountP);

        if (dto.kind === 'pay_out') {
          const expense = await this.expenses.createExpense(
            {
              category_id: dto.category_id!,
              amount,
              payment_account_id: account.id,
              ref_no: ref,
              notes: note || undefined,
            },
            shopId,
            user.id,
            { client, client_ref: ref }
          );
          entryId = expense.entry_id ?? null;
          expenseId = expense.id;
        } else {
          const isIn = dto.kind === 'pay_in';
          const posted = await this.ledger.postEntry(
            {
              shop_id: shopId,
              entry_type: isIn ? 'till_pay_in' : 'till_owner_pull',
              source_type: 'till_movement',
              source_id: ref,
              client_ref: ref,
              notes: note || (isIn ? 'Cash put in the till' : 'Cash taken by the owner'),
              lines: [
                { account_code: account.code, direction: isIn ? 'debit' : 'credit', amount },
                { account_code: isIn ? 'OWNER_EQUITY' : 'OWNER_DRAWINGS', direction: isIn ? 'credit' : 'debit', amount },
              ],
            },
            user.id,
            client
          );
          entryId = posted.entry_id;
        }

        await client.query(
          `INSERT INTO till_movements
             (session_id, location_id, kind, amount, category_id, note, entry_id, expense_id, client_ref, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [sessionId, shopId, dto.kind, amount, dto.kind === 'pay_out' ? dto.category_id : null, note, entryId, expenseId, ref, user.id]
        );
        await client.query('COMMIT');
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getStatus(shopId);
  }

  async close(shopId: number, dto: CloseTillDto, user: Actor): Promise<TillStatus> {
    const ref = requireRef(dto.client_ref);
    const countedP = requireMoney(dto.counted_cash, 'Counted cash', true);
    const handoverP = requireMoney(dto.handover_amount ?? 0, 'Handover amount', true);
    if (handoverP > countedP) {
      throw new BadRequestException('The owner cannot take more than the counted cash.');
    }
    const reason = dto.difference_reason?.trim() || null;

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const shop = await this.getShop(client, shopId);
      await client.query('SELECT id FROM locations WHERE id = $1 FOR NO KEY UPDATE', [shopId]);

      const same = await client.query('SELECT location_id FROM till_sessions WHERE close_client_ref = $1', [ref]);
      if (same.rows.length > 0) {
        if (same.rows[0].location_id !== shopId) {
          throw new ConflictException('This client_ref was already used for another shop.');
        }
        await client.query('COMMIT');
      } else {
        const sess = await client.query(
          "SELECT * FROM till_sessions WHERE location_id = $1 AND status = 'open' FOR UPDATE",
          [shopId]
        );
        if (sess.rows.length === 0) throw new ConflictException('This shop has no open till.');
        const session = sess.rows[0];

        const account = await this.getCashAccount(client, shop);
        const summary = await this.buildSummary(client, session, account.id);
        const expectedP = toPaisa(summary.current_cash);
        const diffP = countedP - expectedP;
        if (diffP !== 0 && !reason) {
          throw new BadRequestException(
            `The count differs from the cash the books expect (৳${fromPaisa(expectedP).toFixed(2)}) by ৳${fromPaisa(Math.abs(diffP)).toFixed(2)}. A reason is required.`
          );
        }

        if (diffP !== 0) {
          await this.postCashDifference(client, {
            shopId,
            cashCode: account.code,
            diffP,
            otherCode: 'TILL_OVER_SHORT',
            entryType: 'till_close_adjust',
            sourceType: 'till_close',
            sourceId: String(session.id),
            clientRef: `${ref}:adjust`,
            notes: `Till close difference: ${reason}`,
            userId: user.id,
          });
        }
        if (handoverP > 0) {
          const amount = fromPaisa(handoverP);
          await this.ledger.postEntry(
            {
              shop_id: shopId,
              entry_type: 'till_handover',
              source_type: 'till_close',
              source_id: String(session.id),
              client_ref: `${ref}:handover`,
              notes: 'Cash collected by the owner at close',
              lines: [
                { account_code: 'OWNER_DRAWINGS', direction: 'debit', amount },
                { account_code: account.code, direction: 'credit', amount },
              ],
            },
            user.id,
            client
          );
        }

        const closing = await client.query(
          `INSERT INTO daily_cash_closings
             (location_id, user_id, closing_date, opening_cash, cash_sales, cash_expenses, cash_returns,
              system_expected_cash, physical_counted_cash, discrepancy_amount, discrepancy_reason, notes)
           VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
          [
            shopId, user.id, summary.opening_float, summary.cash_sales, summary.petty_cash, summary.refunds,
            fromPaisa(expectedP), fromPaisa(countedP), fromPaisa(diffP), reason, dto.note?.trim() || null,
          ]
        );
        await client.query(
          `UPDATE till_sessions SET
             status = 'closed', closed_by = $2, closed_at = CURRENT_TIMESTAMP,
             expected_cash = $3, counted_cash = $4, difference = $5, difference_reason = $6,
             handover_amount = $7, retained_amount = $8, close_note = $9,
             close_client_ref = $10, daily_closing_id = $11
           WHERE id = $1`,
          [
            session.id, user.id, fromPaisa(expectedP), fromPaisa(countedP), fromPaisa(diffP), reason,
            fromPaisa(handoverP), fromPaisa(countedP - handoverP), dto.note?.trim() || null, ref, closing.rows[0].id,
          ]
        );
        await client.query('COMMIT');
      }
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
    return this.getStatus(shopId);
  }

  /** Dr/Cr the cash account against another account so the ledger moves by diffP (positive adds cash). */
  private async postCashDifference(
    client: PoolClient,
    p: {
      shopId: number;
      cashCode: string;
      diffP: number;
      otherCode: string;
      entryType: string;
      sourceType: string;
      sourceId: string;
      clientRef: string;
      notes: string;
      userId: number;
    }
  ) {
    const amount = fromPaisa(Math.abs(p.diffP));
    const gain = p.diffP > 0;
    await this.ledger.postEntry(
      {
        shop_id: p.shopId,
        entry_type: p.entryType,
        source_type: p.sourceType,
        source_id: p.sourceId,
        client_ref: p.clientRef,
        notes: p.notes,
        lines: [
          { account_code: p.cashCode, direction: gain ? 'debit' : 'credit', amount },
          { account_code: p.otherCode, direction: gain ? 'credit' : 'debit', amount },
        ],
      },
      p.userId,
      client
    );
  }
}
