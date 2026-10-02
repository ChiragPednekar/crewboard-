/** Spreadsheet exports. CSV is built here; Excel is lazy-loaded so it never weighs on page loads. */

export type ExportCell = string | number | null | undefined;

export interface ExportTable {
  /** Sheet / file base name */
  name: string;
  headers: string[];
  rows: ExportCell[][];
}

/** RFC 4180 quoting, plus a guard against spreadsheet formula injection. */
export function csvCell(value: ExportCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  let s = value;
  // =, +, -, @ (and tab/CR) at the start make Excel treat text as a formula
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(table: Pick<ExportTable, 'headers' | 'rows'>): string {
  return [table.headers, ...table.rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name: string): string {
  return name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'export';
}

export function downloadCsv(table: ExportTable) {
  // BOM so Excel opens UTF-8 (₹, names with accents) correctly
  download(new Blob(['﻿', toCsv(table)], { type: 'text/csv;charset=utf-8' }), `${safeFileName(table.name)}.csv`);
}

export async function downloadXlsx(table: ExportTable) {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const header = table.headers.map((h) => ({ value: h, fontWeight: 'bold' as const }));
  const body = table.rows.map((row) =>
    row.map((v) => (v === null || v === undefined || v === '' ? null : typeof v === 'number' ? { value: v, type: Number } : { value: String(v), type: String })),
  );
  await writeXlsxFile([header, ...body], {
    sheet: table.name.slice(0, 31),
    stickyRowsCount: 1,
    columns: table.headers.map((h) => ({ width: Math.min(48, Math.max(10, h.length + 4)) })),
  }).toFile(`${safeFileName(table.name)}.xlsx`);
}

export function downloadBlob(blob: Blob, fileName: string) {
  download(blob, fileName);
}
