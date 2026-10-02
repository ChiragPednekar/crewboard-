// Orchestrates one sheet's sync and provisioning around the pure planner in sync-core.
// Talks to the database and Google only through the two interfaces below, so the
// whole loop is tested with in-memory fakes (sync-runner.test.ts).

import {
  type AppAction,
  a1Tab,
  type CellWrite,
  COLUMNS,
  headerWrite,
  LAST_COL,
  planAppToSheet,
  planSheetToApp,
  type RowState,
  STATUS_OPTIONS,
  type SyncEvent,
  type TaskSnapshot,
  toSheetRows,
} from './sync-core.ts';

export interface SheetInfo {
  sheetId: number;
  title: string;
  protectedRanges: { id: number; description: string }[];
}

export interface SheetsApi {
  getSheets(spreadsheetId: string): Promise<SheetInfo[]>;
  readTab(spreadsheetId: string, range: string): Promise<unknown[][]>;
  writeValues(spreadsheetId: string, writes: CellWrite[]): Promise<void>;
  batchUpdate(spreadsheetId: string, requests: unknown[]): Promise<{ replies?: unknown[] }>;
}

export interface SheetConfig {
  id: string;
  videographerId: string;
  spreadsheetId: string;
  tabName: string;
}

export interface SyncDb {
  loadSnapshots(videographerId: string): Promise<TaskSnapshot[]>;
  loadRowStates(configId: string): Promise<RowState[]>;
  /** Tasks with an unprocessed outbox entry (changed in the app since our last write). */
  loadPending(taskIds: string[]): Promise<Set<string>>;
  apply(action: AppAction): Promise<void>;
  saveRowStates(configId: string, states: (RowState & { lastReadAt: string })[]): Promise<void>;
  markOutboxProcessed(taskIds: string[], cutoffIso: string): Promise<void>;
  recordEvents(configId: string, events: SyncEvent[]): Promise<void>;
}

export interface ConfigStats {
  rowsRead: number;
  actions: number;
  rowsWritten: number;
  errors: number;
  events: Record<string, number>;
}

const MARK = 'CrewBoard';

/** Create the tab if needed, write the header, dropdown, protection, frozen header and hidden stamp column. */
export async function provisionSheet(sheets: SheetsApi, config: SheetConfig, editors: string[]): Promise<void> {
  let info = (await sheets.getSheets(config.spreadsheetId)).find((s) => s.title === config.tabName);
  if (!info) {
    const res = await sheets.batchUpdate(config.spreadsheetId, [
      { addSheet: { properties: { title: config.tabName, gridProperties: { rowCount: 1000, columnCount: COLUMNS.length, frozenRowCount: 1 } } } },
    ]);
    const reply = res.replies?.[0] as { addSheet?: { properties?: { sheetId?: number } } } | undefined;
    const sheetId = reply?.addSheet?.properties?.sheetId;
    if (sheetId === undefined) throw new Error('Google did not return the new tab’s id');
    info = { sheetId, title: config.tabName, protectedRanges: [] };
  }
  const sid = info.sheetId;

  await sheets.writeValues(config.spreadsheetId, [headerWrite(config.tabName)]);

  const col = (start: number, end: number, fromRow = 1) => ({ sheetId: sid, startRowIndex: fromRow, startColumnIndex: start, endColumnIndex: end });
  await sheets.batchUpdate(config.spreadsheetId, [
    // remove our old protection (re-provision) before adding the current one
    ...info.protectedRanges.filter((p) => p.description === MARK).map((p) => ({ deleteProtectedRange: { protectedRangeId: p.id } })),
    { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
    {
      repeatCell: {
        range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true }, backgroundColor: { red: 0.96, green: 0.92, blue: 0.84 } } },
        fields: 'userEnteredFormat(textFormat,backgroundColor)',
      },
    },
    {
      setDataValidation: {
        range: { ...col(8, 9), endRowIndex: 1000 },
        rule: { condition: { type: 'ONE_OF_LIST', values: STATUS_OPTIONS.map((v) => ({ userEnteredValue: v })) }, strict: true, showCustomUi: true },
      },
    },
    // editable cells get a soft highlight so it’s obvious where to type
    {
      repeatCell: {
        range: { ...col(8, 11), endRowIndex: 1000 },
        cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 0.98, blue: 0.9 } } },
        fields: 'userEnteredFormat.backgroundColor',
      },
    },
    ...[
      [3, 260], [5, 320], [6, 260], [9, 260], [10, 220], [11, 260],
    ].map(([i, px]) => ({
      updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: i, endIndex: i! + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' },
    })),
    // column O holds the Apps Script edit stamp: hidden, but left editable so the script (running as the editor) can write it
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: 14, endIndex: 15 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
    {
      addProtectedRange: {
        protectedRange: {
          range: { sheetId: sid },
          description: MARK,
          warningOnly: false,
          editors: { users: editors },
          unprotectedRanges: [col(8, 11), col(14, 15)],
        },
      },
    },
  ]);
}

/** Two-way sync of one tab. Throws on Google errors (the caller records them per config). */
export async function syncSheet(input: { sheets: SheetsApi; db: SyncDb; config: SheetConfig; now?: () => Date }): Promise<ConfigStats> {
  const { sheets, db, config } = input;
  const now = input.now ?? (() => new Date());
  const stats: ConfigStats = { rowsRead: 0, actions: 0, rowsWritten: 0, errors: 0, events: {} };
  const events: SyncEvent[] = [];

  // 1. read
  const values = await sheets.readTab(config.spreadsheetId, `${a1Tab(config.tabName)}!A1:${LAST_COL}`);
  const { rows } = toSheetRows(values);
  stats.rowsRead = rows.filter((r) => r.cells.some((c) => c.trim() !== '')).length;

  let tasks = new Map((await db.loadSnapshots(config.videographerId)).map((t) => [t.id, t]));
  const states = new Map((await db.loadRowStates(config.id)).map((s) => [s.taskId, s]));
  const pending = await db.loadPending([...tasks.keys()]);

  // 2. sheet → app
  const plan = planSheetToApp({ rows, tasks, states, pendingApp: pending, now: now() });
  events.push(...plan.events);
  for (const action of plan.actions) {
    try {
      await db.apply(action);
      stats.actions += 1;
      events.push({
        kind: action.type === 'submit' ? 'submission_created' : 'updated',
        taskId: action.taskId,
        rowNumber: action.rowNumber,
        detail: action.type === 'submit' ? { links: action.links.length } : action.type === 'progress' ? { status: action.status } : { notes: true },
      });
    } catch (e) {
      stats.errors += 1;
      plan.rewrite.add(action.taskId);
      plan.readStates.delete(action.taskId);
      events.push({ kind: 'error', taskId: action.taskId, rowNumber: action.rowNumber, detail: { action: action.type, message: (e as Error).message?.slice(0, 300) } });
    }
  }

  // 3. app → sheet (from fresh data, so this run’s own changes are included)
  const cutoff = now().toISOString();
  if (plan.actions.length > 0) tasks = new Map((await db.loadSnapshots(config.videographerId)).map((t) => [t.id, t]));
  const toWrite = new Set([...plan.rewrite, ...(await db.loadPending([...tasks.keys()]))]);
  const out = planAppToSheet({
    tab: config.tabName,
    tasks,
    rowOf: plan.rowOf,
    lastRow: plan.lastRow,
    toWrite,
    sheetValues: new Map([...plan.readStates].map(([id, r]) => [id, { link: r.link, notes: r.notes }])),
    keepSheetLink: plan.keepSheetLink,
  });
  await sheets.writeValues(config.spreadsheetId, out.writes);
  stats.rowsWritten = out.writes.length;

  // 4. remember what each row now holds
  const at = now().toISOString();
  const nextStates = new Map<string, RowState & { lastReadAt: string }>();
  for (const [id, r] of plan.readStates) {
    const prev = states.get(id);
    nextStates.set(id, {
      taskId: id, lastStatus: r.status, lastLink: r.link, lastNotes: r.notes,
      lastSheetEditAt: r.sheetEditAt ?? prev?.lastSheetEditAt ?? null, lastWrittenAt: prev?.lastWrittenAt ?? null, lastReadAt: at,
    });
  }
  for (const w of out.written) {
    const prev = nextStates.get(w.taskId) ?? states.get(w.taskId);
    nextStates.set(w.taskId, {
      taskId: w.taskId, lastStatus: w.status, lastLink: w.link, lastNotes: w.notes,
      lastSheetEditAt: prev?.lastSheetEditAt ?? null, lastWrittenAt: at, lastReadAt: at,
    });
  }
  if (nextStates.size) await db.saveRowStates(config.id, [...nextStates.values()]);
  const writtenIds = out.written.map((w) => w.taskId);
  if (writtenIds.length) {
    await db.markOutboxProcessed(writtenIds, cutoff);
    events.push({ kind: 'written', detail: { rows: writtenIds.length } });
  }

  await db.recordEvents(config.id, events);
  for (const e of events) stats.events[e.kind] = (stats.events[e.kind] ?? 0) + 1;
  return stats;
}
