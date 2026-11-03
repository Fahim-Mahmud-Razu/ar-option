export const MAX_IMPORT_ROWS = 2000;

export class ImportFileError extends Error {}

/**
 * Reads CSV text into rows of cells. Handles a leading byte-order mark, quoted cells that hold
 * commas or line breaks, doubled quotes, and a comma, semicolon or tab separator.
 */
export const parseCsvText = (input: string): string[][] => {
  const text = input.replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t']
    .map((d) => ({ d, n: firstLine.split(d).length }))
    .sort((a, b) => b.n - a.n)[0].d;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
    } else if (c === '"' && cell === '') {
      quoted = true;
    } else if (c === delimiter) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
};

/** The first row names the columns. Blank rows are dropped. */
export const tableToObjects = (table: string[][]): Record<string, string>[] => {
  if (table.length < 2) return [];
  const headers = table[0].map((h) => String(h ?? '').trim());
  const out: Record<string, string>[] = [];
  for (const cells of table.slice(1)) {
    if (cells.every((c) => String(c ?? '').trim() === '')) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      if (h) obj[h] = String(cells[i] ?? '').trim();
    });
    out.push(obj);
  }
  return out;
};

export const readImportFile = async (file: File): Promise<Record<string, string>[]> => {
  const name = file.name.toLowerCase();
  let table: string[][];

  if (name.endsWith('.xls')) {
    throw new ImportFileError('Old .xls files are not supported. Save the sheet as .xlsx or CSV and try again.');
  }

  if (name.endsWith('.xlsx')) {
    const { default: readXlsxFile } = await import('read-excel-file/browser');
    const result: unknown = await readXlsxFile(file);
    const sheet = Array.isArray(result) && result.length > 0 && !Array.isArray(result[0])
      ? (result[0] as { data: unknown[][] }).data
      : (result as unknown[][]);
    table = sheet.map((r) =>
      r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : c === null || c === undefined ? '' : String(c)))
    );
  } else if (name.endsWith('.csv') || name.endsWith('.txt')) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer());
    } catch {
      throw new ImportFileError('This file is not UTF-8, so Bengali text would be damaged. In Excel, save it as "CSV UTF-8".');
    }
    if (text.includes('�')) {
      throw new ImportFileError('This file has damaged characters. In Excel, save it as "CSV UTF-8".');
    }
    table = parseCsvText(text);
  } else {
    throw new ImportFileError('Choose a .csv or .xlsx file.');
  }

  const rows = tableToObjects(table);
  if (rows.length === 0) throw new ImportFileError('The file has no data rows under its header.');
  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(`The file has ${rows.length} rows. Up to ${MAX_IMPORT_ROWS} can be imported at once. Split it into parts.`);
  }
  return rows;
};

export const TEMPLATE_HEADERS = [
  'Product Name', 'Size', 'SKU', 'Category', 'Brand', 'Cost Price', 'Selling Price',
  'Add Stock', 'Sub Category', 'Alert Qty', 'Shop',
];

/** Sizes off: no Size column, and every sample row is its own product. */
export const templateCsv = (useSizes = true): string => {
  const sample = [
    ['Classic Crewneck T-Shirt', '', '100001', 'T-Shirts', 'Polo Club', '350', '595', '20', '', '10', ''],
    ['Oxford Long Sleeve Shirt', 'M', '', 'Shirts', 'AR Option', '650', '1100', '15', 'Casual', '5', ''],
    ['Oxford Long Sleeve Shirt', 'L', '', 'Shirts', 'AR Option', '650', '1100', '25', 'Casual', '5', ''],
    ['Slim Fit Denim Pant', '32', 'PANT-SLIM-32', 'Denim', 'Zara Man', '900', '1650', '30', 'Jeans', '8', ''],
  ];
  const rows = useSizes
    ? [TEMPLATE_HEADERS, ...sample]
    : [TEMPLATE_HEADERS, ...sample.filter((r) => r[1] === '' || r[1] === 'M')].map((r) => r.filter((_, i) => i !== 1));
  const quote = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return '\uFEFF' + rows.map((r) => r.map(quote).join(',')).join('\r\n') + '\r\n';
};

export const downloadBlob = (content: BlobPart, fileName: string, type: string): void => {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
