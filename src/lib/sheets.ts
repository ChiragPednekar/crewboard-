/** Spreadsheet ID from a pasted Google Sheets URL or a raw ID (mirrors the sync's own parser). */
export function spreadsheetIdFrom(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}

export function sheetUrl(spreadsheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;
}
