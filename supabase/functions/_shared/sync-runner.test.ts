import { beforeEach, describe, expect, it } from 'vitest';

import { COL, COLUMNS, type RowState, type SyncEvent, type TaskSnapshot } from './sync-core';
import { provisionSheet, type SheetConfig, type SheetInfo, type SheetsApi, type SyncDb, syncSheet } from './sync-runner';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeSheets implements SheetsApi {
  grid: string[][] = [];
  requests: unknown[] = [];
  tabs: SheetInfo[] = [{ sheetId: 0, title: 'Sheet1', protectedRanges: [] }];

  async getSheets() {
    return this.tabs;
  }
  async readTab() {
    return this.grid.map((r) => [...r]);
  }
  async writeValues(_id: string, writes: { range: string; values: string[][] }[]) {
    for (const w of writes) {
      const m = w.range.match(/!A(\d+):[A-Z]+\d+$/)!;
      const r = Number(m[1]) - 1;
      while (this.grid.length <= r) this.grid.push([]);
      const row = this.grid[r]!;
      w.values[0]!.forEach((v, i) => (row[i] = v));
    }
  }
  async batchUpdate(_id: string, requests: unknown[]) {
    this.requests.push(...requests);
    const add = requests.find((r) => (r as { addSheet?: unknown }).addSheet) as { addSheet: { properties: { title: string } } } | undefined;
    if (add) {
      this.tabs.push({ sheetId: 42, title: add.addSheet.properties.title, protectedRanges: [] });
      return { replies: [{ addSheet: { properties: { sheetId: 42 } } }] };
    }
    return { replies: [] };
  }
  /** The videographer typing into a cell (row is 1-based, as in the sheet). */
  edit(row: number, col: number, value: string, stamp = '2026-10-09T12:00:00Z') {
    const r = this.grid[row - 1]!;
    r[col] = value;
    r[COL.editedAt] = stamp;
  }
  rowFor(taskId: string) {
    return this.grid.findIndex((r) => r[0] === taskId) + 1;
  }
}

class FakeDb implements SyncDb {
  tasks = new Map<string, TaskSnapshot>();
  states = new Map<string, RowState>();
  pending = new Set<string>();
  events: SyncEvent[] = [];
  failNext: string | null = null;
  clock = Date.parse('2026-10-09T13:00:00Z');

  tick() {
    this.clock += 60_000;
    return new Date(this.clock).toISOString();
  }
  /** Change made in the app (review, edit…): the outbox trigger would enqueue it. */
  appChange(id: string, patch: Partial<TaskSnapshot>) {
    const t = this.tasks.get(id)!;
    const at = this.tick();
    this.tasks.set(id, { ...t, ...patch, updatedAt: at, statusChangedAt: patch.status ? at : t.statusChangedAt });
    this.pending.add(id);
  }

  async loadSnapshots() {
    return [...this.tasks.values()];
  }
  async loadRowStates() {
    return [...this.states.values()];
  }
  async loadPending(ids: string[]) {
    return new Set(ids.filter((id) => this.pending.has(id)));
  }
  async apply(a: Parameters<SyncDb['apply']>[0]) {
    if (this.failNext) {
      const msg = this.failNext;
      this.failNext = null;
      throw new Error(msg);
    }
    const t = this.tasks.get(a.taskId)!;
    if (a.type === 'submit') this.appChange(a.taskId, { status: 'submitted', latestLinks: a.links, notes: a.notes ?? t.notes });
    if (a.type === 'progress') this.appChange(a.taskId, { status: a.status });
    if (a.type === 'notes') this.appChange(a.taskId, { notes: a.notes });
  }
  async saveRowStates(_c: string, states: RowState[]) {
    for (const s of states) this.states.set(s.taskId, s);
  }
  async markOutboxProcessed(ids: string[]) {
    for (const id of ids) this.pending.delete(id);
  }
  async recordEvents(_c: string, events: SyncEvent[]) {
    this.events.push(...events);
  }
}

function task(id: string, over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id, month: '2026-10-01', client: 'Kesar Foods', title: `Task ${id}`, category: 'Reel', brief: null, references: [],
    dueDate: '2026-10-15', status: 'assigned', statusChangedAt: '2026-10-01T00:00:00Z', maxPoints: 10, pointsAwarded: null,
    notes: null, latestLinks: [], feedback: null, updatedAt: '2026-10-01T00:00:00Z', ...over,
  };
}

const config: SheetConfig = { id: 'cfg', videographerId: 'v1', spreadsheetId: 'sheet', tabName: 'Tasks' };
let sheets: FakeSheets;
let db: FakeDb;
const run = () => syncSheet({ sheets, db, config, now: () => new Date(db.tick()) });

beforeEach(() => {
  sheets = new FakeSheets();
  db = new FakeDb();
  sheets.grid = [[...COLUMNS]];
  db.tasks.set('b', task('b', { dueDate: '2026-10-20' }));
  db.tasks.set('a', task('a', { dueDate: '2026-10-05' }));
});

describe('syncSheet end to end (fakes)', () => {
  it('fills an empty sheet, then settles: a second run changes nothing', async () => {
    const first = await run();
    expect(first.rowsWritten).toBe(2);
    expect(sheets.grid.map((r) => r[0])).toEqual(['Task ID', 'a', 'b']);
    const second = await run();
    expect(second).toMatchObject({ actions: 0, rowsWritten: 0, errors: 0 });
  });

  it('videographer submits from the sheet → app gets a submission, row reflects it, then settles', async () => {
    await run();
    const r = sheets.rowFor('a');
    sheets.edit(r, COL.status, 'Submitted');
    sheets.edit(r, COL.link, 'https://youtu.be/final');
    const s = await run();
    expect(s.actions).toBe(1);
    expect(db.tasks.get('a')).toMatchObject({ status: 'submitted', latestLinks: ['https://youtu.be/final'] });
    expect(sheets.grid[r - 1]![COL.status]).toBe('Submitted');
    expect(db.pending.has('a')).toBe(false);
    expect(await run()).toMatchObject({ actions: 0, rowsWritten: 0 });
  });

  it('admin approves in the app → the row shows Approved and points on the next run', async () => {
    await run();
    db.appChange('b', { status: 'approved', pointsAwarded: 9, latestLinks: ['https://vimeo.com/1'], feedback: 'Approved: lovely' });
    const s = await run();
    expect(s.rowsWritten).toBe(1);
    const row = sheets.grid[sheets.rowFor('b') - 1]!;
    expect(row[COL.status]).toBe('Approved');
    expect(row[COL.points]).toBe('9 / 10');
    expect(row[COL.feedback]).toBe('Approved: lovely');
  });

  it('a deleted row is put back', async () => {
    await run();
    sheets.grid.splice(sheets.rowFor('a') - 1, 1);
    const s = await run();
    expect(s.rowsWritten).toBe(1);
    expect(sheets.rowFor('a')).toBeGreaterThan(0);
  });

  it('when the app rejects an action (e.g. month locked) the row is restored and the error is logged', async () => {
    await run();
    const r = sheets.rowFor('a');
    sheets.edit(r, COL.status, 'Submitted');
    sheets.edit(r, COL.link, 'https://youtu.be/x');
    db.failNext = 'The October 2026 assessment is locked';
    const s = await run();
    expect(s.errors).toBe(1);
    expect(db.events.some((e) => e.kind === 'error' && String(e.detail.message).includes('locked'))).toBe(true);
    expect(sheets.grid[r - 1]![COL.status]).toBe('Assigned');
  });

  it('ignores rows typed by hand without an ID and logs them', async () => {
    await run();
    sheets.grid.push(['', '', '', 'My own row']);
    const s = await run();
    expect(s.events.missing_id).toBe(1);
    expect(sheets.grid.at(-1)![3]).toBe('My own row'); // untouched
  });
});

describe('provisionSheet', () => {
  it('creates the tab and sets header, dropdown, protection and hidden stamp column', async () => {
    await provisionSheet(sheets, { ...config, tabName: 'Priya' }, ['robot@proj.iam.gserviceaccount.com']);
    expect(sheets.tabs.map((t) => t.title)).toContain('Priya');
    expect(sheets.grid[0]).toEqual([...COLUMNS]);
    const kinds = sheets.requests.map((r) => Object.keys(r as object)[0]);
    expect(kinds).toEqual(expect.arrayContaining(['addSheet', 'setDataValidation', 'addProtectedRange', 'updateSheetProperties']));
    const prot = sheets.requests.find((r) => (r as { addProtectedRange?: unknown }).addProtectedRange) as {
      addProtectedRange: { protectedRange: { editors: { users: string[] }; unprotectedRanges: { startColumnIndex: number; endColumnIndex: number }[] } };
    };
    expect(prot.addProtectedRange.protectedRange.editors.users).toEqual(['robot@proj.iam.gserviceaccount.com']);
    // only Status/Link/Notes (I–K) and the stamp column (O) stay editable
    expect(prot.addProtectedRange.protectedRange.unprotectedRanges.map((u) => [u.startColumnIndex, u.endColumnIndex])).toEqual([[8, 11], [14, 15]]);
  });

  it('re-provisioning replaces our old protection instead of stacking another', async () => {
    sheets.tabs.push({ sheetId: 7, title: 'Tasks', protectedRanges: [{ id: 99, description: 'CrewBoard' }, { id: 5, description: 'owner’s own' }] });
    await provisionSheet(sheets, config, ['robot@x']);
    const deleted = sheets.requests.filter((r) => (r as { deleteProtectedRange?: unknown }).deleteProtectedRange);
    expect(deleted).toEqual([{ deleteProtectedRange: { protectedRangeId: 99 } }]);
  });
});
