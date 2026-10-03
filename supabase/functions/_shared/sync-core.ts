// Google Sheets ⇄ app sync — pure decision logic (no I/O, unit-tested with Vitest).
//
// One tab per videographer (own spreadsheet, or a tab in a master spreadsheet).
// Row 1 is the header; each task has one row, matched by the Task ID in column A,
// never by position. The videographer edits only Status, Deliverable link and Notes.
// Setting Status to Completed is enough to hand work in; the link is optional.
//
// A run has two pure planning steps around the database calls:
//   1. planSheetToApp: read rows → actions for the app (start, submit, notes) + events
//   2. planAppToSheet: tasks that changed (or are missing from the sheet) → cell writes
// `sheet_row_state` remembers what each row held after our last read/write, so we
// can tell a videographer's edit from our own previous write.

export const COLUMNS = [
  'Task ID', 'Month', 'Client', 'Title', 'Category', 'Brief', 'References', 'Due date',
  'Status', 'Deliverable link', 'Videographer notes', 'Admin feedback', 'Points', 'Last updated',
  'Sheet edited at',
] as const;

/** 0-based column indexes */
export const COL = {
  id: 0, month: 1, client: 2, title: 3, category: 4, brief: 5, refs: 6, due: 7,
  status: 8, link: 9, notes: 10, feedback: 11, points: 12, updated: 13, editedAt: 14,
} as const;

export const LAST_WRITTEN_COL = 'N'; // we write A..N; O is the Apps Script edit stamp
export const LAST_COL = 'O';
export const EDITABLE_RANGES = ['I', 'J', 'K'] as const; // status, link, notes

export type TaskStatus = 'assigned' | 'in_progress' | 'submitted' | 'revision_requested' | 'approved' | 'cancelled';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  assigned: 'Assigned',
  in_progress: 'In Progress',
  submitted: 'Completed',
  revision_requested: 'Revision Requested',
  approved: 'Approved',
  cancelled: 'Cancelled',
};
export const STATUS_OPTIONS = Object.values(STATUS_LABEL);

/** Statuses a videographer may choose in the sheet. */
const SHEET_SETTABLE: TaskStatus[] = ['assigned', 'in_progress', 'submitted'];

export function parseStatus(raw: string): TaskStatus | null {
  const s = raw.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  if (!s) return null;
  const map: Record<string, TaskStatus> = {
    assigned: 'assigned', 'not started': 'assigned', todo: 'assigned', 'to do': 'assigned',
    'in progress': 'in_progress', started: 'in_progress', 'in prog': 'in_progress', wip: 'in_progress',
    submitted: 'submitted', done: 'submitted', delivered: 'submitted',
    completed: 'submitted', complete: 'submitted', finished: 'submitted',
    'revision requested': 'revision_requested', revision: 'revision_requested',
    approved: 'approved', cancelled: 'cancelled', canceled: 'cancelled',
  };
  return map[s] ?? null;
}

/** Links typed into one cell: split on whitespace, commas or semicolons; keep http(s) only order-preserving and unique. */
export function parseLinks(raw: string): { links: string[]; invalid: string[] } {
  const parts = raw
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const links: string[] = [];
  const invalid: string[] = [];
  for (const p of parts) {
    if (/^https?:\/\/[^\s]+\.[^\s]+/i.test(p)) {
      if (!links.includes(p)) links.push(p);
    } else invalid.push(p);
  }
  return { links, invalid };
}

export const normLinks = (links: string[]) => links.join('\n');
export const normNotes = (s: string) => s.replace(/\r\n/g, '\n').trim();

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/** What the app knows about a task (published plans only). */
export interface TaskSnapshot {
  id: string;
  month: string; // YYYY-MM-DD (1st)
  client: string;
  title: string;
  category: string;
  brief: string | null;
  references: string[]; // already formatted lines
  dueDate: string;
  status: TaskStatus;
  statusChangedAt: string; // ISO
  maxPoints: number;
  pointsAwarded: number | null;
  notes: string | null; // videographer_notes
  latestLinks: string[]; // latest submission
  feedback: string | null; // latest review, formatted
  updatedAt: string; // ISO
}

export interface RowState {
  taskId: string;
  lastStatus: string | null;
  lastLink: string | null;
  lastNotes: string | null;
  lastSheetEditAt: string | null;
  lastWrittenAt: string | null;
}

export interface SheetRow {
  rowNumber: number; // 1-based sheet row
  cells: string[];
}

// ---------------------------------------------------------------------------
// Sheet → app
// ---------------------------------------------------------------------------

export type SyncEventKind =
  | 'updated' | 'submission_created' | 'written' | 'unknown_id' | 'missing_id'
  | 'conflict_approved' | 'conflict_lww' | 'permission_denied' | 'bad_link' | 'invalid_status' | 'error';

export interface SyncEvent {
  kind: SyncEventKind;
  taskId?: string;
  rowNumber?: number;
  detail: Record<string, unknown>;
}

export type AppAction =
  | { type: 'submit'; taskId: string; links: string[]; notes: string | null; submittedAt: string | null; rowNumber: number }
  | { type: 'progress'; taskId: string; status: 'assigned' | 'in_progress'; rowNumber: number }
  | { type: 'notes'; taskId: string; notes: string | null; rowNumber: number };

export interface SheetToAppPlan {
  actions: AppAction[];
  events: SyncEvent[];
  /** Tasks whose row must be rewritten from the app (reverts, refresh after an action). */
  rewrite: Set<string>;
  /** Rows whose link cell holds the videographer's own text that we must not overwrite. */
  keepSheetLink: Set<string>;
  /** Values just read, to store as the new baseline for rows we accept or ignore. */
  readStates: Map<string, { status: string; link: string; notes: string; sheetEditAt: string | null }>;
  /** Row number of each task currently in the sheet. */
  rowOf: Map<string, number>;
  /** Highest row number with any content (to append after). */
  lastRow: number;
}

const cell = (row: SheetRow, i: number) => (row.cells[i] ?? '').toString();

function parseStamp(raw: string, now: Date): string | null {
  if (!raw.trim()) return null;
  const d = new Date(raw.trim());
  if (Number.isNaN(d.getTime())) return null;
  // never trust a stamp from the future (clock skew or tampering)
  return (d > now ? now : d).toISOString();
}

export function planSheetToApp(input: {
  rows: SheetRow[]; // data rows only (header excluded)
  tasks: Map<string, TaskSnapshot>;
  states: Map<string, RowState>;
  /** Tasks changed in the app since our last write to the sheet (pending outbox). */
  pendingApp: Set<string>;
  now: Date;
}): SheetToAppPlan {
  const { rows, tasks, states, pendingApp, now } = input;
  const plan: SheetToAppPlan = { actions: [], events: [], rewrite: new Set(), keepSheetLink: new Set(), readStates: new Map(), rowOf: new Map(), lastRow: 1 };

  for (const row of rows) {
    const hasContent = row.cells.some((c) => (c ?? '').toString().trim() !== '');
    if (!hasContent) continue;
    plan.lastRow = Math.max(plan.lastRow, row.rowNumber);

    const id = cell(row, COL.id).trim();
    if (!id) {
      plan.events.push({ kind: 'missing_id', rowNumber: row.rowNumber, detail: { title: cell(row, COL.title).slice(0, 120) } });
      continue;
    }
    const task = tasks.get(id);
    if (!task) {
      plan.events.push({ kind: 'unknown_id', rowNumber: row.rowNumber, detail: { taskId: id.slice(0, 64) } });
      continue;
    }
    if (plan.rowOf.has(id)) {
      plan.events.push({ kind: 'unknown_id', taskId: id, rowNumber: row.rowNumber, detail: { reason: 'duplicate row', firstRow: plan.rowOf.get(id) } });
      continue;
    }
    plan.rowOf.set(id, row.rowNumber);

    const rawStatus = cell(row, COL.status).trim();
    const rawLink = normNotes(cell(row, COL.link));
    const { links, invalid } = parseLinks(rawLink);
    const linkText = normLinks(links);
    const notes = normNotes(cell(row, COL.notes));
    const sheetEditAt = parseStamp(cell(row, COL.editedAt), now);
    const read = { status: rawStatus, link: rawLink, notes, sheetEditAt };

    const state = states.get(id);
    const baseline = state
      ? { status: state.lastStatus ?? '', link: state.lastLink ?? '', notes: state.lastNotes ?? '' }
      : // never synced: the app's own view is the baseline
        { status: STATUS_LABEL[task.status], link: normLinks(task.latestLinks), notes: normNotes(task.notes ?? '') };

    const statusChanged = rawStatus !== baseline.status;
    const linkChanged = rawLink !== baseline.link;
    const notesChanged = notes !== baseline.notes;

    if (!statusChanged && !linkChanged && !notesChanged) {
      plan.readStates.set(id, read);
      continue;
    }

    // Approved / cancelled work is closed: the sheet can't reopen it.
    if (task.status === 'approved' || task.status === 'cancelled') {
      plan.events.push({ kind: 'conflict_approved', taskId: id, rowNumber: row.rowNumber, detail: { status: task.status, sheet: { status: rawStatus, link: linkText } } });
      plan.rewrite.add(id);
      continue;
    }

    // Both sides changed since the last sync: last write wins.
    if (pendingApp.has(id)) {
      const sheetTime = sheetEditAt ?? now.toISOString();
      const appTime = new Date(Math.max(Date.parse(task.updatedAt), Date.parse(task.statusChangedAt))).toISOString();
      const sheetWins = Date.parse(sheetTime) > Date.parse(appTime);
      plan.events.push({ kind: 'conflict_lww', taskId: id, rowNumber: row.rowNumber, detail: { winner: sheetWins ? 'sheet' : 'app', sheetTime, appTime, stamped: Boolean(sheetEditAt) } });
      if (!sheetWins) {
        plan.rewrite.add(id);
        continue;
      }
    }

    const target = rawStatus ? parseStatus(rawStatus) : task.status;
    if (rawStatus && !target) {
      plan.events.push({ kind: 'invalid_status', taskId: id, rowNumber: row.rowNumber, detail: { value: rawStatus.slice(0, 60) } });
      plan.rewrite.add(id);
      continue;
    }
    const wanted = target!;

    if (statusChanged && !SHEET_SETTABLE.includes(wanted) && wanted !== task.status) {
      plan.events.push({ kind: 'invalid_status', taskId: id, rowNumber: row.rowNumber, detail: { value: rawStatus, reason: 'Only the admin can set this status' } });
      plan.rewrite.add(id);
      continue;
    }

    // A new submission: status set to Completed, or a new link on submitted / revision work.
    const wantsSubmit =
      (statusChanged && wanted === 'submitted') ||
      (linkChanged && (wanted === 'submitted' || task.status === 'submitted' || task.status === 'revision_requested'));

    if (wantsSubmit) {
      // no link at all is fine (marked Completed); text that isn't a link is a typo to fix
      if (invalid.length > 0) {
        plan.events.push({ kind: 'bad_link', taskId: id, rowNumber: row.rowNumber, detail: { invalid: invalid.slice(0, 5) } });
        // keep what they typed so they can fix it; the status goes back to the app's
        plan.readStates.set(id, read);
        plan.keepSheetLink.add(id);
        plan.rewrite.add(id);
        continue;
      }
      if (links.length > 5) {
        plan.events.push({ kind: 'bad_link', taskId: id, rowNumber: row.rowNumber, detail: { reason: 'More than 5 links' } });
        plan.readStates.set(id, read);
        plan.keepSheetLink.add(id);
        plan.rewrite.add(id);
        continue;
      }
      // re-marking finished work Completed, or re-saving the same links, isn't a new version
      const sameAsLatest = task.status === 'submitted' && (links.length === 0 || normLinks(task.latestLinks) === linkText);
      if (!sameAsLatest) {
        plan.actions.push({ type: 'submit', taskId: id, links, notes: notes || null, submittedAt: sheetEditAt, rowNumber: row.rowNumber });
        plan.readStates.set(id, read);
        plan.rewrite.add(id);
        continue;
      }
    }

    if (statusChanged && (wanted === 'assigned' || wanted === 'in_progress') && wanted !== task.status) {
      const ok =
        (wanted === 'in_progress' && (task.status === 'assigned' || task.status === 'revision_requested')) ||
        (wanted === 'assigned' && task.status === 'in_progress');
      if (!ok) {
        plan.events.push({ kind: 'invalid_status', taskId: id, rowNumber: row.rowNumber, detail: { value: rawStatus, from: task.status } });
        plan.rewrite.add(id);
        continue;
      }
      plan.actions.push({ type: 'progress', taskId: id, status: wanted, rowNumber: row.rowNumber });
    }

    if (notesChanged && normNotes(task.notes ?? '') !== notes) {
      plan.actions.push({ type: 'notes', taskId: id, notes: notes || null, rowNumber: row.rowNumber });
    }

    if (linkChanged && !wantsSubmit) {
      // a link typed on work that isn't being submitted yet: keep it in the sheet, nothing to do in the app
      plan.events.push({ kind: 'updated', taskId: id, rowNumber: row.rowNumber, detail: { note: 'Link saved in the sheet; set Status to Completed to send it for review' } });
      plan.keepSheetLink.add(id);
    }

    plan.readStates.set(id, read);
    plan.rewrite.add(id);
  }

  return plan;
}

// ---------------------------------------------------------------------------
// App → sheet
// ---------------------------------------------------------------------------

export function formatIst(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 330 * 60_000); // UTC+5:30
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} IST`;
}

/** Cell values A..N for a task (strings only; written RAW so nothing is evaluated as a formula). */
export function rowValues(t: TaskSnapshot): string[] {
  return [
    t.id,
    t.month.slice(0, 7),
    t.client,
    t.title,
    t.category,
    t.brief ?? '',
    t.references.join('\n'),
    t.dueDate,
    STATUS_LABEL[t.status],
    normLinks(t.latestLinks),
    t.notes ?? '',
    t.feedback ?? '',
    t.status === 'approved' && t.pointsAwarded !== null ? `${t.pointsAwarded} / ${t.maxPoints}` : `– / ${t.maxPoints}`,
    formatIst(t.updatedAt),
  ];
}

export interface CellWrite {
  range: string; // A1 notation including the tab
  values: string[][];
}

export interface AppToSheetPlan {
  writes: CellWrite[];
  written: { taskId: string; status: string; link: string; notes: string }[];
}

export function a1Tab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

/**
 * Rows to write: tasks changed in the app, tasks flagged for rewrite, and tasks the
 * sheet doesn't have yet (appended at the end, in due-date order).
 * In a row we keep the videographer's own link/notes text when the app has nothing newer,
 * so a half-typed link isn't wiped by an unrelated refresh.
 */
export function planAppToSheet(input: {
  tab: string;
  tasks: Map<string, TaskSnapshot>;
  rowOf: Map<string, number>;
  lastRow: number;
  toWrite: Set<string>;
  /** Values currently in the sheet for rows we read this run. */
  sheetValues?: Map<string, { link: string; notes: string }>;
  /** Rows whose link text stays as the videographer typed it. */
  keepSheetLink?: Set<string>;
}): AppToSheetPlan {
  const { tab, tasks, rowOf, toWrite, sheetValues, keepSheetLink } = input;
  let next = Math.max(input.lastRow, 1) + 1;
  const writes: CellWrite[] = [];
  const written: AppToSheetPlan['written'] = [];

  const missing = [...tasks.values()].filter((t) => !rowOf.has(t.id)).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.title.localeCompare(b.title));
  const ids = [...new Set([...[...toWrite].filter((id) => tasks.has(id) && rowOf.has(id)), ...missing.map((t) => t.id)])];

  for (const id of ids) {
    const t = tasks.get(id)!;
    const values = rowValues(t);
    const kept = sheetValues?.get(id);
    if (kept && keepSheetLink?.has(id)) values[COL.link] = kept.link;
    if (kept && !t.notes && kept.notes) values[COL.notes] = kept.notes;
    const row = rowOf.get(id) ?? next++;
    writes.push({ range: `${a1Tab(tab)}!A${row}:${LAST_WRITTEN_COL}${row}`, values: [values] });
    written.push({ taskId: id, status: values[COL.status]!, link: values[COL.link]!, notes: normNotes(values[COL.notes]!) });
  }
  return { writes, written };
}

export function headerWrite(tab: string): CellWrite {
  return { range: `${a1Tab(tab)}!A1:${LAST_COL}1`, values: [[...COLUMNS]] };
}

/** Parse a values.batchGet response for `Tab!A1:O` into data rows. */
export function toSheetRows(values: unknown[][] | undefined): { header: string[]; rows: SheetRow[] } {
  const v = (values ?? []).map((r) => (r ?? []).map((c) => (c === null || c === undefined ? '' : String(c))));
  return { header: v[0] ?? [], rows: v.slice(1).map((cells, i) => ({ rowNumber: i + 2, cells })) };
}

/** Spreadsheet ID from a pasted URL or a raw ID. */
export function spreadsheetIdFrom(input: string): string | null {
  const s = input.trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1]!;
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}
