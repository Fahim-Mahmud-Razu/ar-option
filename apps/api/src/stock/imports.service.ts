import { Injectable, Inject, BadRequestException, ForbiddenException } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { PG_POOL } from '../database/database.module';
import { ProductsService } from './products.service';
import { SettingsService } from '../settings/settings.service';
import {
  analyzeCatalogRows,
  toCsv,
  CatalogSnapshot,
  ImportAnalysis,
  MAX_IMPORT_ROWS,
} from './import-analysis';
import { ImportCommitResult, ImportPreview, ImportRequest, User } from '@ar-option/shared-types';

const SKU_LOCK_KEY = 'catalog_sku';

@Injectable()
export class ImportsService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly productsService: ProductsService,
    private readonly settingsService: SettingsService
  ) {}

  async preview(dto: ImportRequest, user: User): Promise<ImportPreview> {
    this.checkRows(dto);
    const analysis = await this.analyze(this.pool, dto, user);
    return { rows: analysis.rows, totals: analysis.totals };
  }

  /**
   * All-or-nothing. The file is analysed again inside the transaction, under the catalog lock,
   * so a change made after the preview cannot slip through.
   */
  async commit(dto: ImportRequest, user: User): Promise<ImportCommitResult> {
    this.checkRows(dto);
    const clientRef = (dto.client_ref || '').trim();
    if (!clientRef) throw new BadRequestException('client_ref is required to import.');

    const done = await this.pool.query('SELECT batch_no, totals FROM import_batches WHERE client_ref = $1', [clientRef]);
    if (done.rows.length > 0) return { batch_no: done.rows[0].batch_no, totals: done.rows[0].totals };

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [SKU_LOCK_KEY]);

      const again = await client.query('SELECT batch_no, totals FROM import_batches WHERE client_ref = $1', [clientRef]);
      if (again.rows.length > 0) {
        await client.query('COMMIT');
        return { batch_no: again.rows[0].batch_no, totals: again.rows[0].totals };
      }

      const analysis = await this.analyze(client, dto, user);
      if (analysis.totals.errors > 0) {
        const first = analysis.rows.filter((r) => r.action === 'error').slice(0, 3);
        throw new BadRequestException(
          `The file has ${analysis.totals.errors} error(s). Nothing was imported. ${first.map((r) => `Row ${r.row}: ${r.message}`).join(' ')}`
        );
      }

      const seq = await client.query("SELECT nextval('import_batch_seq') AS n");
      const batchNo = `IMP-${String(seq.rows[0].n).padStart(6, '0')}`;

      for (const planned of analysis.plan) {
        if (planned.id) {
          await this.productsService.updateProductInTx(
            client,
            planned.id,
            {
              category_name: planned.category,
              sub_category_name: planned.sub_category,
              brand_name: planned.brand,
              alert_quantity: planned.alert_quantity,
              variations: planned.variations.map((v) => ({
                id: v.id,
                size: v.size,
                sku: v.sku,
                cost_price: v.cost,
                selling_price: v.selling,
                opening_stock: v.stock.map((s) => ({ shop_id: s.shop_id, quantity: s.quantity })),
              })),
            },
            user.id,
            batchNo
          );
        } else {
          const single = planned.variations.length === 1 && planned.variations[0].sku;
          await this.productsService.createProductInTx(
            client,
            {
              name: planned.name,
              code: single ? planned.variations[0].sku : undefined,
              category_name: planned.category,
              sub_category_name: planned.sub_category,
              brand_name: planned.brand,
              alert_quantity: planned.alert_quantity,
              variations: planned.variations.map((v) => ({
                size: v.size,
                sku: single ? undefined : v.sku,
                cost_price: v.cost,
                selling_price: v.selling,
                opening_stock: v.stock.map((s) => ({ shop_id: s.shop_id, quantity: s.quantity })),
              })),
            },
            user.id,
            batchNo
          );
        }
      }

      await client.query(
        'INSERT INTO import_batches (batch_no, client_ref, file_name, totals, created_by) VALUES ($1, $2, $3, $4, $5)',
        [batchNo, clientRef, (dto.file_name || '').slice(0, 255) || null, JSON.stringify(analysis.totals), user.id]
      );
      await client.query('COMMIT');
      return { batch_no: batchNo, totals: analysis.totals };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /** The catalog as a file that can be edited and imported again. Add Stock is left blank. */
  async exportCsv(): Promise<string> {
    const useSizes = await this.settingsService.useSizes();
    const res = await this.pool.query(
      `SELECT p.name, pv.size, pv.sku, c.name AS category, sc.name AS sub_category, b.name AS brand,
              pv.cost_price, pv.selling_price, p.alert_quantity,
              COALESCE((SELECT SUM(s.qty_available) FROM stock s WHERE s.product_variation_id = pv.id), 0) AS qty
       FROM product_variations pv
       JOIN products p ON p.id = pv.product_id
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN categories sc ON sc.id = p.sub_category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.is_active = true AND pv.is_active = true
       ORDER BY p.name, pv.id`
    );
    const header = [
      'Product Name', 'Size', 'SKU', 'Category', 'Brand', 'Cost Price', 'Selling Price',
      'Add Stock', 'Sub Category', 'Alert Qty', 'Shop', 'Current Stock',
    ];
    const rows: (string | number)[][] = res.rows.map((r) => [
      r.name, r.size, r.sku, r.category ?? '', r.brand ?? '', Number(r.cost_price), Number(r.selling_price),
      '', r.sub_category ?? '', r.alert_quantity, '', Number(r.qty),
    ]);
    // Sizes off: the file has no Size column at all.
    const dropSize = (cells: (string | number)[]) => (useSizes ? cells : cells.filter((_, i) => i !== 1));
    return toCsv([dropSize(header), ...rows.map(dropSize)]);
  }

  private checkRows(dto: ImportRequest): void {
    if (!Array.isArray(dto.rows) || dto.rows.length === 0) {
      throw new BadRequestException('The file has no rows.');
    }
    if (dto.rows.length > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`A file can have up to ${MAX_IMPORT_ROWS} rows. Split it and import it in parts.`);
    }
  }

  private async analyze(db: Pool | PoolClient, dto: ImportRequest, user: User): Promise<ImportAnalysis> {
    const shops = await this.usableShops(db, user);
    const active = dto.active_shop_id ?? null;
    if (active !== null && !shops.some((s) => s.id === active)) {
      throw new ForbiddenException('That shop is outside your assigned shops.');
    }
    const snapshot = await this.snapshot(db, shops, active);
    return analyzeCatalogRows(dto.rows, snapshot);
  }

  private async usableShops(db: Pool | PoolClient, user: User) {
    const res =
      user.role === 'admin'
        ? await db.query('SELECT id, code, name FROM locations WHERE is_active = true AND is_system = false ORDER BY id')
        : await db.query(
            `SELECT l.id, l.code, l.name FROM locations l
             JOIN user_locations ul ON ul.location_id = l.id
             WHERE ul.user_id = $1 AND l.is_active = true AND l.is_system = false ORDER BY l.id`,
            [user.id]
          );
    return res.rows as { id: number; code: string; name: string }[];
  }

  private async snapshot(
    db: Pool | PoolClient,
    shops: { id: number; code: string; name: string }[],
    activeShopId: number | null
  ): Promise<CatalogSnapshot> {
    const res = await db.query(
      `SELECT p.id AS product_id, p.code, p.name, p.alert_quantity,
              COALESCE(c.name, '') AS category, COALESCE(b.name, '') AS brand,
              pv.id AS variation_id, pv.size, pv.sku, pv.cost_price, pv.selling_price,
              COALESCE((SELECT SUM(s.qty_available) FROM stock s WHERE s.product_variation_id = pv.id), 0) AS qty
       FROM products p
       JOIN product_variations pv ON pv.product_id = p.id AND pv.is_active = true
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN brands b ON b.id = p.brand_id
       WHERE p.is_active = true
       ORDER BY p.id, pv.id`
    );
    const products = new Map<number, CatalogSnapshot['products'][number]>();
    for (const r of res.rows) {
      let p = products.get(r.product_id);
      if (!p) {
        p = { id: r.product_id, code: r.code, name: r.name, category: r.category, brand: r.brand, alert_quantity: r.alert_quantity, variations: [] };
        products.set(r.product_id, p);
      }
      p.variations.push({
        id: r.variation_id, size: r.size, sku: r.sku,
        cost: Number(r.cost_price), selling: Number(r.selling_price), qty: Number(r.qty),
      });
    }
    return { products: [...products.values()], shops, activeShopId, useSizes: await this.settingsService.useSizes(db) };
  }
}
