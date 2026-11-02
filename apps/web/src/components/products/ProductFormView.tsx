import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ArrowLeft, Copy, Plus, Save, Trash2 } from 'lucide-react';
import type { Brand, Category, Product, Shop, StockByShopGridItem } from '@ar-option/shared-types';
import { apiFetch } from '../../lib/api';

interface ProductFormViewProps {
  apiUrl: string;
  /** null adds a new product. */
  productId: number | null;
  shops: Shop[];
  onClose: () => void;
  onSaved: () => void;
  onDirtyChange: (dirty: boolean) => void;
}

interface Row {
  key: string;
  id?: number;
  size: string;
  sku: string;
  cost: string;
  margin: string;
  selling: string;
  /** Total units now, in every location. Only known for saved sizes. */
  currentQty: number;
  savedCost: number;
  stock: Record<number, string>;
}

const PRESET_SIZES = ['S', 'M', 'L', 'XL', 'XXL', '28', '30', '32', '34', '36', '38', '40', '42'];
const UNITS = [
  ['pcs', 'Pieces'],
  ['pair', 'Pair'],
  ['set', 'Set'],
  ['meter', 'Meter'],
  ['kg', 'Kilogram'],
];

const input =
  'w-full h-11 px-3 rounded-xl text-sm bg-light-surface-hover dark:bg-dark-surface-hover border border-light-border dark:border-dark-border text-light-text dark:text-dark-text focus:outline-none focus:ring-2 focus:ring-focus-ring disabled:opacity-60';
const money = `${input} font-mono text-right`;
const label = 'block text-xs font-semibold text-light-text-muted dark:text-dark-text-muted mb-1';
const card =
  'bg-light-surface dark:bg-dark-surface p-4 md:p-5 rounded-2xl border border-light-border dark:border-dark-border space-y-4';

const num = (v: string): number => {
  const n = parseFloat(v.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const fixed = (n: number): string => (Number.isFinite(n) ? String(Math.round(n * 100) / 100) : '');
const taka = (n: number): string =>
  `৳${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

let rowCounter = 0;
const blankRow = (size: string): Row => ({
  key: `r${++rowCounter}`,
  size,
  sku: '',
  cost: '',
  margin: '',
  selling: '',
  currentQty: 0,
  savedCost: 0,
  stock: {},
});

export const ProductFormView: React.FC<ProductFormViewProps> = ({
  apiUrl,
  productId,
  shops,
  onClose,
  onSaved,
  onDirtyChange,
}) => {
  const isEdit = productId !== null;
  const sellingShops = shops.filter((s) => !s.is_system);

  const [loading, setLoading] = useState<boolean>(isEdit);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeMode, setCodeMode] = useState<'auto' | 'custom'>('auto');
  const [nextCode, setNextCode] = useState('');
  const [codeCheck, setCodeCheck] = useState<string | null>(null);
  const [unit, setUnit] = useState('pcs');
  const [categoryId, setCategoryId] = useState<string>('');
  const [subCategoryId, setSubCategoryId] = useState<string>('');
  const [brandId, setBrandId] = useState<string>('');
  const [alertQty, setAlertQty] = useState('0');
  const [rows, setRows] = useState<Row[]>([]);
  const [customSize, setCustomSize] = useState('');

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [newCategory, setNewCategory] = useState<string | null>(null);
  const [newBrand, setNewBrand] = useState<string | null>(null);

  const [dirty, setDirty] = useState(false);
  const firstError = useRef<HTMLDivElement>(null);

  const touch = () => {
    if (!dirty) {
      setDirty(true);
      onDirtyChange(true);
    }
  };

  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  // Load lists, the next code, and the product when editing.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [cats, brs, next] = await Promise.all([
        apiFetch(`${apiUrl}/products/categories`).then((r) => (r.ok ? r.json() : [])),
        apiFetch(`${apiUrl}/products/brands`).then((r) => (r.ok ? r.json() : [])),
        apiFetch(`${apiUrl}/products/next-sku`).then((r) => (r.ok ? r.json() : { sku: '' })),
      ]);
      if (!alive) return;
      setCategories(cats);
      setBrands(brs);
      setNextCode(next.sku);

      if (productId === null) {
        setRows(['M', 'L', 'XL'].map(blankRow));
        return;
      }

      try {
        const [res, grid] = await Promise.all([
          apiFetch(`${apiUrl}/products/${productId}`),
          apiFetch(`${apiUrl}/reports/stock-by-shop`).then((r) => (r.ok ? r.json() : [])),
        ]);
        if (!res.ok) throw new Error('Could not load this product.');
        const p: Product = await res.json();
        if (!alive) return;
        const qtyByVariation = new Map<number, number>();
        for (const item of grid as StockByShopGridItem[]) {
          qtyByVariation.set(item.variation_id, item.stocks.reduce((sum, s) => sum + s.qty, 0));
        }
        setName(p.name);
        setCode(p.code);
        setUnit(p.unit || 'pcs');
        setCategoryId(p.category_id ? String(p.category_id) : '');
        setSubCategoryId(p.sub_category_id ? String(p.sub_category_id) : '');
        setBrandId(p.brand_id ? String(p.brand_id) : '');
        setAlertQty(String(p.alert_quantity ?? 0));
        setRows(
          (p.variations || []).map((v) => ({
            key: `r${++rowCounter}`,
            id: v.id,
            size: v.size,
            sku: v.sku,
            cost: fixed(v.cost_price),
            margin: v.cost_price > 0 ? fixed(((v.selling_price - v.cost_price) / v.cost_price) * 100) : '',
            selling: fixed(v.selling_price),
            currentQty: qtyByVariation.get(v.id) ?? 0,
            savedCost: v.cost_price,
            stock: {},
          }))
        );
      } catch (err: any) {
        setError(err.message || 'Could not load this product.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiUrl, productId]);

  // Live check of a typed code. Product codes and size SKUs share one list.
  useEffect(() => {
    if (isEdit || codeMode !== 'custom' || !code.trim()) {
      setCodeCheck(null);
      return;
    }
    const timer = setTimeout(async () => {
      const res = await apiFetch(`${apiUrl}/products/sku-available?code=${encodeURIComponent(code.trim())}`);
      if (!res.ok) return;
      const data = await res.json();
      setCodeCheck(
        data.available
          ? 'Available'
          : `Already used by ${data.owner.product_name}${data.owner.size ? ` (${data.owner.size})` : ''}`
      );
    }, 400);
    return () => clearTimeout(timer);
  }, [apiUrl, code, codeMode, isEdit]);

  const subCategories = useMemo(
    () => categories.filter((c) => String(c.parent_id) === categoryId && categoryId !== ''),
    [categories, categoryId]
  );
  const topCategories = categories.filter((c) => c.parent_id === null);

  const setRow = (key: string, patch: Partial<Row>) => {
    touch();
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  // Selling = cost x (1 + margin / 100). Editing the selling price recalculates the margin.
  const editCost = (r: Row, v: string) =>
    setRow(r.key, { cost: v, selling: fixed(num(v) * (1 + num(r.margin) / 100)) });
  const editMargin = (r: Row, v: string) =>
    setRow(r.key, { margin: v, selling: fixed(num(r.cost) * (1 + num(v) / 100)) });
  const editSelling = (r: Row, v: string) =>
    setRow(r.key, {
      selling: v,
      margin: num(r.cost) > 0 ? fixed(((num(v) - num(r.cost)) / num(r.cost)) * 100) : r.margin,
    });

  const addSize = (size: string) => {
    const clean = size.trim();
    if (!clean) return;
    if (rows.some((r) => r.size.toLowerCase() === clean.toLowerCase())) return;
    touch();
    const first = rows[0];
    setRows((prev) => [
      ...prev,
      { ...blankRow(clean), cost: first?.cost ?? '', margin: first?.margin ?? '', selling: first?.selling ?? '' },
    ]);
    setCustomSize('');
  };

  const removeRow = (key: string) => {
    touch();
    setRows((prev) => prev.filter((r) => r.key !== key));
  };

  const copyFirstToAll = () => {
    if (rows.length < 2) return;
    touch();
    const [first] = rows;
    setRows((prev) => prev.map((r) => ({ ...r, cost: first.cost, margin: first.margin, selling: first.selling })));
  };

  const createCategory = async () => {
    const res = await apiFetch(`${apiUrl}/products/categories`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newCategory, parent_id: categoryId ? Number(categoryId) : undefined }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).message || 'Could not add the category.');
    const created: Category = await res.json();
    setCategories((prev) => (prev.some((c) => c.id === created.id) ? prev : [...prev, created]));
    if (created.parent_id === null) setCategoryId(String(created.id));
    else setSubCategoryId(String(created.id));
    setNewCategory(null);
    touch();
  };

  const createBrand = async () => {
    const res = await apiFetch(`${apiUrl}/products/brands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newBrand }),
    });
    if (!res.ok) return setError((await res.json().catch(() => ({}))).message || 'Could not add the brand.');
    const created: Brand = await res.json();
    setBrands((prev) => (prev.some((b) => b.id === created.id) ? prev : [...prev, created]));
    setBrandId(String(created.id));
    setNewBrand(null);
    touch();
  };

  // Stock value that a cost change will move, shown before saving.
  const revaluation = rows.reduce(
    (sum, r) => (r.id && Math.abs(num(r.cost) - r.savedCost) > 0.004 ? sum + (num(r.cost) - r.savedCost) * r.currentQty : sum),
    0
  );

  const validate = (): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Product name is required.';
    if (!categoryId) errs.category = 'Choose a category.';
    if (!brandId) errs.brand = 'Choose a brand.';
    if (!isEdit && codeMode === 'custom') {
      if (!code.trim()) errs.code = 'Enter a code, or switch back to Auto.';
      else if (codeCheck && codeCheck.startsWith('Already')) errs.code = codeCheck;
    }
    if (rows.length === 0) errs.rows = 'Add at least one size.';
    rows.forEach((r) => {
      if (!r.size.trim()) errs[`size-${r.key}`] = 'Every size needs a name.';
      if (num(r.selling) <= 0) errs[`price-${r.key}`] = 'Enter a selling price.';
      if (num(r.cost) > num(r.selling) && num(r.selling) > 0) errs[`price-${r.key}`] = 'Selling price is below cost.';
    });
    return errs;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length > 0) {
      setTimeout(() => firstError.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }

    const variations = rows.map((r) => ({
      id: r.id,
      size: r.size.trim(),
      sku: r.id ? undefined : r.sku.trim() || undefined,
      cost_price: num(r.cost),
      selling_price: num(r.selling),
      opening_stock: Object.entries(r.stock)
        .filter(([, q]) => num(q) > 0)
        .map(([shopId, q]) => ({ shop_id: Number(shopId), quantity: Math.floor(num(q)) })),
    }));

    const body = {
      name: name.trim(),
      code: !isEdit && codeMode === 'custom' ? code.trim() : undefined,
      category_id: Number(categoryId),
      sub_category_id: subCategoryId ? Number(subCategoryId) : null,
      brand_id: Number(brandId),
      unit,
      alert_quantity: Math.floor(num(alertQty)),
      variations,
    };

    setSaving(true);
    try {
      const res = await apiFetch(isEdit ? `${apiUrl}/products/${productId}` : `${apiUrl}/products`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Could not save the product.');
      setDirty(false);
      onDirtyChange(false);
      onSaved();
    } catch (err: any) {
      // Everything the user typed stays on screen.
      setError(err.message || 'Could not save the product.');
    } finally {
      setSaving(false);
    }
  };

  const err = (key: string) =>
    fieldErrors[key] ? (
      <div
        ref={Object.keys(fieldErrors)[0] === key ? firstError : undefined}
        role="alert"
        className="text-xs mt-1 text-danger-text-light dark:text-danger"
      >
        {fieldErrors[key]}
      </div>
    ) : null;

  if (loading) {
    return <div className="py-12 text-center text-sm text-light-text-muted dark:text-dark-text-muted">Loading product...</div>;
  }

  const sizeInputs = (r: Row) => (
    <div className="flex flex-col">
      <input
        aria-label={`Size name for ${r.size || 'new size'}`}
        value={r.size}
        disabled={!!r.id}
        onChange={(e) => setRow(r.key, { size: e.target.value })}
        className={input}
      />
      {err(`size-${r.key}`)}
    </div>
  );

  const skuInput = (r: Row) => (
    <input
      aria-label={`SKU for ${r.size}`}
      value={r.sku}
      disabled={!!r.id}
      placeholder={r.id ? '' : 'Auto'}
      onChange={(e) => setRow(r.key, { sku: e.target.value.toUpperCase() })}
      className={`${input} font-mono`}
    />
  );

  const moneyInput = (r: Row, kind: 'cost' | 'margin' | 'selling', aria: string) => (
    <input
      aria-label={`${aria} for ${r.size}`}
      type="text"
      inputMode="decimal"
      value={r[kind]}
      onChange={(e) => (kind === 'cost' ? editCost(r, e.target.value) : kind === 'margin' ? editMargin(r, e.target.value) : editSelling(r, e.target.value))}
      className={money}
    />
  );

  const stockInputs = (r: Row) =>
    sellingShops.length === 0 ? null : (
      <div className="space-y-1.5">
        {r.id && (
          <div className="text-xs text-light-text-muted dark:text-dark-text-muted">
            In stock now: {r.currentQty}. Add more here.
          </div>
        )}
        {sellingShops.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-2">
            <span className="text-xs">{s.name}</span>
            <input
              aria-label={`Opening stock of ${r.size} in ${s.name}`}
              type="text"
              inputMode="numeric"
              value={r.stock[s.id] ?? ''}
              placeholder="0"
              onChange={(e) => setRow(r.key, { stock: { ...r.stock, [s.id]: e.target.value.replace(/\D/g, '') } })}
              className={`${money} w-24`}
            />
          </div>
        ))}
      </div>
    );

  return (
    <form onSubmit={handleSave} className="max-w-3xl md:max-w-4xl mx-auto pb-28 space-y-4">
      <div className="flex items-center space-x-3">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          data-testid="product-back"
          className="w-11 h-11 flex items-center justify-center rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-lg font-bold">{isEdit ? 'Edit Product' : 'Add Product'}</h2>
          <p className="text-xs text-light-text-muted dark:text-dark-text-muted">
            Name, sizes, prices and opening stock in one place.
          </p>
        </div>
      </div>

      {error && (
        <div role="alert" className="p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger-text-light dark:text-danger text-sm flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <section className={card} aria-labelledby="general-heading">
        <h3 id="general-heading" className="font-bold text-sm">General</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label htmlFor="pf-name" className={label}>Product Name *</label>
            <input id="pf-name" value={name} onChange={(e) => { setName(e.target.value); touch(); }} placeholder="e.g. Classic Pique Polo" className={input} />
            {err('name')}
          </div>

          <div>
            <label htmlFor="pf-code" className={label}>Product Code (SKU)</label>
            {isEdit ? (
              <input id="pf-code" value={code} disabled className={`${input} font-mono`} />
            ) : codeMode === 'auto' ? (
              <input id="pf-code" value={nextCode ? `${nextCode} (next automatic code)` : 'Assigned when you save'} disabled className={`${input} font-mono`} />
            ) : (
              <input id="pf-code" value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); touch(); }} className={`${input} font-mono`} />
            )}
            {err('code')}
            {!isEdit && (
              <div className="flex items-center justify-between mt-1 text-xs">
                <span className={codeCheck === 'Available' ? 'text-success-text-light dark:text-success' : 'text-danger-text-light dark:text-danger'}>
                  {codeMode === 'custom' ? codeCheck : ''}
                </span>
                <button type="button" onClick={() => { setCodeMode(codeMode === 'auto' ? 'custom' : 'auto'); setCode(''); setCodeCheck(null); }} className="font-semibold text-primary dark:text-primary-tint min-h-[44px] px-1">
                  {codeMode === 'auto' ? 'Type my own code' : 'Use the next automatic code'}
                </button>
              </div>
            )}
            {isEdit && <p className="text-xs mt-1 text-light-text-muted dark:text-dark-text-muted">A saved code cannot be changed.</p>}
          </div>

          <div>
            <label htmlFor="pf-unit" className={label}>Unit</label>
            <select id="pf-unit" value={unit} onChange={(e) => { setUnit(e.target.value); touch(); }} className={input}>
              {UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="pf-cat" className={label}>Category *</label>
            <select id="pf-cat" value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubCategoryId(''); touch(); }} className={input}>
              <option value="">Select category</option>
              {topCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {err('category')}
            {newCategory === null ? (
              <button type="button" onClick={() => setNewCategory('')} className="text-xs font-semibold text-primary dark:text-primary-tint min-h-[44px]">+ New category</button>
            ) : (
              <div className="flex gap-2 mt-1">
                <input aria-label="New category name" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} className={input} />
                <button type="button" onClick={createCategory} disabled={!newCategory.trim()} className="h-11 px-4 rounded-xl bg-primary text-on-primary text-sm font-bold disabled:opacity-50">Add</button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="pf-sub" className={label}>Sub-category</label>
            <select id="pf-sub" value={subCategoryId} onChange={(e) => { setSubCategoryId(e.target.value); touch(); }} disabled={!categoryId} className={input}>
              <option value="">{categoryId ? 'None' : 'Select a category first'}</option>
              {subCategories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor="pf-brand" className={label}>Brand *</label>
            <select id="pf-brand" value={brandId} onChange={(e) => { setBrandId(e.target.value); touch(); }} className={input}>
              <option value="">Select brand</option>
              {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            {err('brand')}
            {newBrand === null ? (
              <button type="button" onClick={() => setNewBrand('')} className="text-xs font-semibold text-primary dark:text-primary-tint min-h-[44px]">+ New brand</button>
            ) : (
              <div className="flex gap-2 mt-1">
                <input aria-label="New brand name" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} className={input} />
                <button type="button" onClick={createBrand} disabled={!newBrand.trim()} className="h-11 px-4 rounded-xl bg-primary text-on-primary text-sm font-bold disabled:opacity-50">Add</button>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="pf-alert" className={label}>Low Stock Alert</label>
            <input id="pf-alert" type="text" inputMode="numeric" value={alertQty} onChange={(e) => { setAlertQty(e.target.value.replace(/\D/g, '')); touch(); }} className={money} />
          </div>
        </div>
      </section>

      <section className={card} aria-labelledby="sizes-heading">
        <div className="flex items-center justify-between gap-2">
          <h3 id="sizes-heading" className="font-bold text-sm">Sizes and Prices</h3>
          <button type="button" onClick={copyFirstToAll} disabled={rows.length < 2} className="min-h-[44px] px-3 rounded-xl text-xs font-semibold flex items-center space-x-1.5 bg-light-surface-hover dark:bg-dark-surface-hover disabled:opacity-50">
            <Copy className="w-3.5 h-3.5" />
            <span>Copy first row to all</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Add a size">
          {PRESET_SIZES.map((s) => {
            const used = rows.some((r) => r.size.toLowerCase() === s.toLowerCase());
            return (
              <button key={s} type="button" disabled={used} onClick={() => addSize(s)} aria-pressed={used} className={`min-w-[44px] h-11 px-3 rounded-xl text-sm font-bold border ${used ? 'bg-primary text-on-primary border-primary opacity-70' : 'border-light-border dark:border-dark-border hover:border-primary'}`}>
                {s}
              </button>
            );
          })}
          <div className="flex gap-2">
            <input aria-label="Custom size" value={customSize} onChange={(e) => setCustomSize(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addSize(customSize); } }} placeholder="Other size" className={`${input} w-32`} />
            <button type="button" onClick={() => addSize(customSize)} aria-label="Add custom size" className="w-11 h-11 rounded-xl bg-light-surface-hover dark:bg-dark-surface-hover flex items-center justify-center"><Plus className="w-4 h-4" /></button>
          </div>
        </div>
        {err('rows')}

        {revaluation !== 0 && (
          <div role="status" className="p-3 rounded-xl bg-warning/10 border border-warning/30 text-warning-text-light dark:text-warning text-sm">
            This changes the value of stock you already hold by {revaluation > 0 ? '+' : '-'}{taka(Math.abs(revaluation))}. It is recorded as a stock revaluation in the books.
          </div>
        )}

        {/* Phone: one card per size */}
        <div className="md:hidden space-y-3">
          {rows.map((r) => (
            <div key={r.key} className="p-3 rounded-xl border border-light-border dark:border-dark-border space-y-3">
              <div className="flex items-end gap-2">
                <div className="flex-1"><span className={label}>Size</span>{sizeInputs(r)}</div>
                {!r.id && (
                  <button type="button" onClick={() => removeRow(r.key)} aria-label={`Remove size ${r.size}`} className="w-11 h-11 rounded-xl flex items-center justify-center text-danger-text-light dark:text-danger"><Trash2 className="w-4 h-4" /></button>
                )}
              </div>
              <div><span className={label}>SKU</span>{skuInput(r)}</div>
              <div className="grid grid-cols-3 gap-2">
                <div><span className={label}>Cost ৳</span>{moneyInput(r, 'cost', 'Cost')}</div>
                <div><span className={label}>Margin %</span>{moneyInput(r, 'margin', 'Margin')}</div>
                <div><span className={label}>Selling ৳</span>{moneyInput(r, 'selling', 'Selling price')}</div>
              </div>
              {err(`price-${r.key}`)}
              <div><span className={label}>{r.id ? 'Add stock' : 'Opening stock'}</span>{stockInputs(r)}</div>
            </div>
          ))}
        </div>

        {/* Tablet and wider: a table that scrolls inside its card */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-light-text-muted dark:text-dark-text-muted">
                <th className="pb-2 pr-2 font-semibold">Size</th>
                <th className="pb-2 pr-2 font-semibold">SKU</th>
                <th className="pb-2 pr-2 font-semibold text-right">Cost ৳</th>
                <th className="pb-2 pr-2 font-semibold text-right">Margin %</th>
                <th className="pb-2 pr-2 font-semibold text-right">Selling ৳</th>
                <th className="pb-2 pr-2 font-semibold">{isEdit ? 'Add stock' : 'Opening stock'}</th>
                <th className="pb-2"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-light-border dark:divide-dark-border">
              {rows.map((r) => (
                <tr key={r.key} className="align-top">
                  <td className="py-2 pr-2 w-24">{sizeInputs(r)}</td>
                  <td className="py-2 pr-2 w-40">{skuInput(r)}</td>
                  <td className="py-2 pr-2 w-28">{moneyInput(r, 'cost', 'Cost')}</td>
                  <td className="py-2 pr-2 w-24">{moneyInput(r, 'margin', 'Margin')}</td>
                  <td className="py-2 pr-2 w-28">{moneyInput(r, 'selling', 'Selling price')}{err(`price-${r.key}`)}</td>
                  <td className="py-2 pr-2 min-w-[200px]">{stockInputs(r)}</td>
                  <td className="py-2">
                    {!r.id && <button type="button" onClick={() => removeRow(r.key)} aria-label={`Remove size ${r.size}`} className="w-11 h-11 rounded-xl flex items-center justify-center text-danger-text-light dark:text-danger"><Trash2 className="w-4 h-4" /></button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-light-text-muted dark:text-dark-text-muted">Selling price = cost x (1 + margin / 100). Editing the selling price recalculates the margin.</p>
      </section>

      <div
        className="fixed bottom-0 left-0 right-0 z-20 md:static bg-light-surface dark:bg-dark-surface md:bg-transparent md:dark:bg-transparent border-t md:border-0 border-light-border dark:border-dark-border p-3 md:p-0 flex gap-3 justify-end"
        style={{ paddingBottom: 'max(12px, var(--safe-bottom))' }}
      >
        <button type="button" onClick={onClose} className="h-12 px-5 rounded-xl text-sm font-semibold bg-light-surface-hover dark:bg-dark-surface-hover">Cancel</button>
        <button type="submit" disabled={saving} className="h-12 px-6 rounded-xl text-sm font-bold bg-primary hover:bg-primary-hover text-on-primary flex items-center space-x-2 disabled:opacity-50">
          <Save className="w-4 h-4" />
          <span>{saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Save Product'}</span>
        </button>
      </div>
    </form>
  );
};
