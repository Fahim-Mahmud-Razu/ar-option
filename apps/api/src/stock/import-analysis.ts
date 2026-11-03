/**
 * Catalog import analysis. Pure: it reads a snapshot and the file rows, and decides what each
 * row would do. Preview and commit both call it, so they can never disagree.
 */

export interface SnapshotVariation {
  id: number;
  size: string;
  sku: string;
  cost: number;
  selling: number;
  qty: number;
}

export interface SnapshotProduct {
  id: number;
  code: string;
  name: string;
  category: string;
  brand: string;
  alert_quantity: number;
  variations: SnapshotVariation[];
}

export interface SnapshotShop {
  id: number;
  code: string;
  name: string;
}

export interface CatalogSnapshot {
  products: SnapshotProduct[];
  /** Shops this user may put stock into. */
  shops: SnapshotShop[];
  activeShopId: number | null;
  /** Off: the Size column must be blank or Standard, and every product has one variation. */
  useSizes: boolean;
}

export type RowAction = 'new_product' | 'new_size' | 'update' | 'unchanged' | 'error';

export interface AnalyzedRow {
  row: number;
  action: RowAction;
  message: string;
  product_name: string;
  size: string;
  sku: string;
  category: string;
  selling_price: string;
  add_stock: number;
  shop: string;
}

export interface ImportTotals {
  total_rows: number;
  new_products: number;
  new_sizes: number;
  updated: number;
  unchanged: number;
  stock_added: number;
  errors: number;
}

export interface StockLine {
  shop_id: number;
  quantity: number;
}

export interface PlannedVariation {
  /** Set for a size that already exists. */
  id?: number;
  size: string;
  sku?: string;
  cost?: number;
  selling?: number;
  stock: StockLine[];
}

export interface PlannedProduct {
  /** Set for a product that already exists. */
  id?: number;
  name: string;
  category?: string;
  sub_category?: string;
  brand?: string;
  alert_quantity?: number;
  variations: PlannedVariation[];
}

export interface ImportAnalysis {
  rows: AnalyzedRow[];
  totals: ImportTotals;
  plan: PlannedProduct[];
}

export const MAX_IMPORT_ROWS = 2000;

const BENGALI_DIGITS: Record<string, string> = {
  '০': '0', '১': '1', '২': '2', '৩': '3', '৪': '4', '৫': '5', '৬': '6', '৭': '7', '৮': '8', '৯': '9',
};

const ALIASES: Record<string, string> = {
  'product name': 'name', name: 'name', product: 'name', 'item name': 'name',
  size: 'size', variation: 'size',
  sku: 'sku', 'sub sku': 'sku', code: 'sku',
  category: 'category',
  'sub category': 'sub', subcategory: 'sub',
  brand: 'brand',
  'cost price': 'cost', cost: 'cost', 'purchase price': 'cost',
  'selling price': 'selling', price: 'selling', mrp: 'selling',
  'add stock': 'stock', stock: 'stock',
  'alert qty': 'alert', 'alert quantity': 'alert',
  shop: 'shop', branch: 'shop',
};

const clean = (v: unknown): string => String(v ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const fold = (v: unknown): string => clean(v).toLowerCase();

/** Maps the file's own headers onto the names the analysis uses. Unknown columns are ignored. */
export const canonicalRow = (raw: Record<string, unknown>): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [header, value] of Object.entries(raw)) {
    const key = ALIASES[fold(header).replace(/[_\-.]+/g, ' ')];
    if (key && out[key] === undefined) out[key] = String(value ?? '');
  }
  return out;
};

const parseNumber = (value: string): number | null => {
  const s = clean(value)
    .replace(/[০-৯]/g, (d) => BENGALI_DIGITS[d])
    .replace(/[৳,\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
};

/** Excel can turn 100001 into 100001.0, or wrap a code as ="100001". */
const cleanSku = (value: string): { sku: string; error?: string } => {
  let s = clean(value);
  const wrapped = s.match(/^="(.*)"$/);
  if (wrapped) s = wrapped[1];
  if (/^\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, '');
  if (/^\d(\.\d+)?e\+\d+$/i.test(s)) {
    return { sku: '', error: `SKU '${s}' was turned into a number by the spreadsheet. Format the SKU column as Text.` };
  }
  return { sku: s.toUpperCase() };
};

interface Resolved {
  row: number;
  raw: Record<string, string>;
  error?: string;
  productId?: number;
  productKey: string;
  variationId?: number;
  size: string;
  sku: string;
  isNewProduct: boolean;
  cost?: number;
  selling?: number;
  stock: number;
  shopId?: number;
  shopLabel: string;
  changes: string[];
}

export const analyzeCatalogRows = (
  rawRows: Record<string, unknown>[],
  snapshot: CatalogSnapshot
): ImportAnalysis => {
  const byCode = new Map<string, SnapshotProduct>();
  const byName = new Map<string, SnapshotProduct[]>();
  const bySku = new Map<string, { product: SnapshotProduct; variation: SnapshotVariation }>();
  for (const p of snapshot.products) {
    byCode.set(p.code.toUpperCase(), p);
    byName.set(fold(p.name), [...(byName.get(fold(p.name)) || []), p]);
    for (const v of p.variations) bySku.set(v.sku.toUpperCase(), { product: p, variation: v });
  }
  const shopByCode = new Map(snapshot.shops.map((s) => [s.code.toUpperCase(), s]));
  const shopsByName = new Map<string, SnapshotShop[]>();
  for (const s of snapshot.shops) shopsByName.set(fold(s.name), [...(shopsByName.get(fold(s.name)) || []), s]);

  const resolved: Resolved[] = [];
  const claimedSkus = new Map<string, number>(); // sku claimed by a new size in this file -> row
  const productLevel = new Map<string, { category: string; brand: string; sub: string; alert: string; row: number }>();

  rawRows.forEach((original, index) => {
    const row = index + 2; // row 1 of the sheet is the header
    const raw = canonicalRow(original);
    const r: Resolved = {
      row, raw, productKey: '', size: '', sku: '', isNewProduct: false, stock: 0, shopLabel: '', changes: [],
    };
    resolved.push(r);
    const fail = (message: string) => {
      r.error = r.error ?? message;
    };

    const name = clean(raw.name);
    const skuCell = cleanSku(raw.sku ?? '');
    if (skuCell.error) fail(skuCell.error);
    let sizeCell = clean(raw.size);
    if (!snapshot.useSizes) {
      if (sizeCell && fold(sizeCell) !== 'standard') {
        fail(`Sizes are turned off. Leave Size blank, or turn on sizes in Settings.`);
      }
      sizeCell = '';
    }
    r.sku = skuCell.sku;

    // Numbers. A blank cell keeps the current value, so it is "not given", never zero.
    const readMoney = (key: 'cost' | 'selling', label: string): number | undefined => {
      const text = clean(raw[key]);
      if (!text) return undefined;
      const n = parseNumber(text);
      if (n === null) {
        fail(`${label} '${text}' is not a number.`);
        return undefined;
      }
      return Math.round(n * 100) / 100;
    };
    r.cost = readMoney('cost', 'Cost price');
    r.selling = readMoney('selling', 'Selling price');

    const stockText = clean(raw.stock);
    if (stockText) {
      const n = parseNumber(stockText);
      if (n === null || !Number.isInteger(n)) fail(`Add Stock '${stockText}' must be a whole number, 0 or more.`);
      else r.stock = n;
    }
    const alertText = clean(raw.alert);
    if (alertText) {
      const n = parseNumber(alertText);
      if (n === null || !Number.isInteger(n)) fail(`Alert Qty '${alertText}' must be a whole number, 0 or more.`);
    }

    for (const [key, label, max] of [['name', 'Product name', 150], ['category', 'Category', 100], ['brand', 'Brand', 100], ['sub', 'Sub category', 100], ['size', 'Size', 50]] as const) {
      if (clean(raw[key]).length > max) fail(`${label} is longer than ${max} characters.`);
    }

    // Which product, and which size?
    let product: SnapshotProduct | undefined;
    let variation: SnapshotVariation | undefined;

    if (r.sku) {
      const hit = bySku.get(r.sku);
      if (hit) {
        product = hit.product;
        variation = hit.variation;
        if (sizeCell && fold(sizeCell) !== fold(variation.size)) {
          fail(`SKU ${r.sku} belongs to ${product.name} (${variation.size}), not size '${sizeCell}'.`);
        }
      } else if (byCode.has(r.sku)) {
        product = byCode.get(r.sku);
      }
    }
    if (product && r.sku && name && fold(name) !== fold(product.name)) {
      fail(`SKU ${r.sku} belongs to ${product.name}, not '${name}'. Import cannot rename a product.`);
    }
    if (!product && !r.sku) {
      if (!name) fail('Enter a product name or a SKU.');
      else {
        const matches = byName.get(fold(name)) || [];
        if (matches.length > 1) fail(`More than one product is named '${name}'. Add the SKU.`);
        else product = matches[0];
      }
    }
    if (!product && r.sku && !name) fail(`SKU ${r.sku} is not in the catalog. Add a product name to create it.`);

    if (product && !variation) {
      const realSizes = product.variations.filter((v) => fold(v.size) !== 'standard');
      if (!sizeCell) {
        if (product.variations.length === 1) variation = product.variations[0];
        else fail(`${product.name} has sizes (${product.variations.map((v) => v.size).join(', ')}). Add the Size.`);
      } else {
        variation = product.variations.find((v) => fold(v.size) === fold(sizeCell));
        if (!variation && realSizes.length === 0 && product.variations.length === 1 && product.variations[0].qty > 0) {
          fail(`${product.name} is a one-size product that holds stock. Adding size '${sizeCell}' would split it.`);
        }
      }
    }

    r.isNewProduct = !product;
    r.productId = product?.id;
    r.variationId = variation?.id;
    r.size = variation?.size ?? (sizeCell || 'Standard');
    r.productKey = product ? `p${product.id}` : `n:${fold(name)}`;

    // New things need a full set of facts.
    if (!variation) {
      if ((r.selling ?? 0) <= 0) fail('A new size needs a Selling Price above zero.');
      if (r.isNewProduct) {
        if (!clean(raw.category)) fail('A new product needs a Category.');
        if (!clean(raw.brand)) fail('A new product needs a Brand.');
      }
      if (r.sku) {
        if (bySku.has(r.sku) || byCode.has(r.sku)) {
          if (!product || !byCode.has(r.sku)) fail(`SKU ${r.sku} is already used.`);
        }
        const earlier = claimedSkus.get(r.sku);
        if (earlier !== undefined) fail(`SKU ${r.sku} is also used in row ${earlier}.`);
        else claimedSkus.set(r.sku, row);
      } else if (product) {
        const generated = `${product.code}-${r.size.replace(/\s+/g, '_').toUpperCase()}`.toUpperCase();
        if (bySku.has(generated) || byCode.has(generated)) fail(`The automatic SKU ${generated} is already used. Add a SKU.`);
      }
    }
    if (r.stock > 0) {
      const effectiveCost = r.cost ?? variation?.cost;
      if (effectiveCost === undefined || effectiveCost <= 0) {
        fail('Stock needs a Cost Price above zero, so the books can value it.');
      }
    }

    // Shop for stock.
    if (r.stock > 0) {
      const shopText = clean(raw.shop);
      if (shopText) {
        const byCodeHit = shopByCode.get(shopText.toUpperCase());
        const nameHits = shopsByName.get(fold(shopText)) || [];
        const shop = byCodeHit ?? (nameHits.length === 1 ? nameHits[0] : undefined);
        if (!shop) fail(`Shop '${shopText}' is not a shop you can add stock to.`);
        else {
          r.shopId = shop.id;
          r.shopLabel = shop.name;
        }
      } else if (snapshot.activeShopId) {
        const shop = snapshot.shops.find((s) => s.id === snapshot.activeShopId);
        r.shopId = shop?.id;
        r.shopLabel = shop?.name ?? '';
      } else {
        fail('Choose a shop in the top bar, or fill the Shop column.');
      }
    }

    // Product-level facts must agree across the rows of one product.
    const level = {
      category: clean(raw.category), brand: clean(raw.brand), sub: clean(raw.sub), alert: alertText, row,
    };
    const seen = productLevel.get(r.productKey);
    if (!seen) productLevel.set(r.productKey, level);
    else {
      for (const key of ['category', 'brand', 'sub', 'alert'] as const) {
        if (level[key] && seen[key] && fold(level[key]) !== fold(seen[key])) {
          fail(`${key === 'sub' ? 'Sub category' : key[0].toUpperCase() + key.slice(1)} '${level[key]}' differs from row ${seen.row}.`);
        } else if (level[key] && !seen[key]) {
          seen[key] = level[key];
        }
      }
    }

    // Changes to an existing size.
    if (variation && product) {
      if (r.cost !== undefined && r.cost !== variation.cost) {
        const impact = Math.round((r.cost - variation.cost) * variation.qty * 100) / 100;
        r.changes.push(`Cost ${variation.cost} → ${r.cost}${variation.qty > 0 ? ` (restates stock value by ${impact > 0 ? '+' : ''}${impact})` : ''}`);
      }
      if (r.selling !== undefined && r.selling !== variation.selling) r.changes.push(`Price ${variation.selling} → ${r.selling}`);
      if (level.category && fold(level.category) !== fold(product.category)) r.changes.push(`Category → ${level.category}`);
      if (level.brand && fold(level.brand) !== fold(product.brand)) r.changes.push(`Brand → ${level.brand}`);
      if (alertText && Number(parseNumber(alertText)) !== product.alert_quantity) r.changes.push(`Alert → ${alertText}`);
      if (level.sub) r.changes.push(`Sub category → ${level.sub}`);
    }
    if (r.stock > 0) r.changes.push(`+${r.stock} at ${r.shopLabel || 'shop'}`);
  });

  // The same size twice in one file is only fine when the rows add stock to different shops.
  const byTarget = new Map<string, Resolved[]>();
  for (const r of resolved) {
    if (r.error) continue;
    const key = r.variationId ? `v${r.variationId}` : `${r.productKey}|${fold(r.size)}`;
    byTarget.set(key, [...(byTarget.get(key) || []), r]);
  }
  for (const group of byTarget.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = group;
    const mergeable = rest.every(
      (r) =>
        r.stock > 0 && first.stock > 0 && r.shopId !== undefined &&
        group.filter((g) => g.shopId === r.shopId).length === 1 &&
        (['cost', 'selling'] as const).every((k) => r[k] === undefined || first[k] === undefined || r[k] === first[k]) &&
        (['category', 'brand'] as const).every((k) => !clean(r.raw[k]) || !clean(first.raw[k]) || fold(r.raw[k]) === fold(first.raw[k]))
    );
    if (!mergeable) {
      for (const r of group) {
        const others = group.filter((g) => g !== r).map((g) => g.row).join(', ');
        r.error = `Size ${r.size} appears again in row ${others}. Keep one row, or add stock to different shops.`;
      }
    }
  }

  const rows: AnalyzedRow[] = [];
  const totals: ImportTotals = {
    total_rows: resolved.length, new_products: 0, new_sizes: 0, updated: 0, unchanged: 0, stock_added: 0, errors: 0,
  };
  const newProductsSeen = new Set<string>();

  for (const r of resolved) {
    let action: RowAction;
    let message: string;
    if (r.error) {
      action = 'error';
      message = r.error;
      totals.errors++;
    } else if (!r.variationId) {
      const firstOfProduct = r.isNewProduct && !newProductsSeen.has(r.productKey);
      if (r.isNewProduct) newProductsSeen.add(r.productKey);
      action = firstOfProduct ? 'new_product' : 'new_size';
      message = firstOfProduct ? 'New product' : 'New size';
      if (action === 'new_product') totals.new_products++;
      else totals.new_sizes++;
      if (r.stock > 0) message += `, +${r.stock} at ${r.shopLabel}`;
    } else if (r.changes.length > 0) {
      action = 'update';
      message = r.changes.join('; ');
      totals.updated++;
    } else {
      action = 'unchanged';
      message = 'No changes';
      totals.unchanged++;
    }
    if (!r.error) totals.stock_added += r.stock;
    rows.push({
      row: r.row,
      action,
      message,
      product_name: clean(r.raw.name),
      size: r.size,
      sku: r.sku,
      category: clean(r.raw.category),
      selling_price: clean(r.raw.selling),
      add_stock: r.stock,
      shop: r.shopLabel,
    });
  }

  return { rows, totals, plan: totals.errors === 0 ? buildPlan(resolved, snapshot) : [] };
};

const buildPlan = (resolved: Resolved[], snapshot: CatalogSnapshot): PlannedProduct[] => {
  const products = new Map<string, PlannedProduct>();
  for (const r of resolved) {
    let plan = products.get(r.productKey);
    if (!plan) {
      plan = {
        id: r.productId,
        name: clean(r.raw.name) || snapshot.products.find((p) => p.id === r.productId)?.name || '',
        variations: [],
      };
      products.set(r.productKey, plan);
    }
    for (const [from, to] of [['category', 'category'], ['sub', 'sub_category'], ['brand', 'brand']] as const) {
      const value = clean(r.raw[from]);
      if (value) (plan as any)[to] = value;
    }
    const alert = parseNumber(clean(r.raw.alert));
    if (alert !== null) plan.alert_quantity = alert;

    let variation = plan.variations.find((v) => (r.variationId ? v.id === r.variationId : !v.id && fold(v.size) === fold(r.size)));
    if (!variation) {
      variation = { id: r.variationId, size: r.size, sku: r.variationId ? undefined : r.sku || undefined, stock: [] };
      plan.variations.push(variation);
    }
    if (r.cost !== undefined) variation.cost = r.cost;
    if (r.selling !== undefined) variation.selling = r.selling;
    if (r.stock > 0 && r.shopId) variation.stock.push({ shop_id: r.shopId, quantity: r.stock });
  }
  return [...products.values()];
};

export const toCsv = (rows: (string | number)[][]): string => {
  const cell = (v: string | number): string => {
    let s = String(v ?? '');
    // A cell that starts like a formula would run in a spreadsheet.
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
};
