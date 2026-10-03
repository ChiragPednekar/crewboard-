import { describe, expect, it } from 'vitest';

import {
  COL,
  formatIst,
  parseLinks,
  parseStatus,
  planAppToSheet,
  planSheetToApp,
  type RowState,
  rowValues,
  type SheetRow,
  spreadsheetIdFrom,
  STATUS_LABEL,
  type TaskSnapshot,
  toSheetRows,
} from './sync-core';

const NOW = new Date('2026-10-10T10:00:00Z');

function task(over: Partial<TaskSnapshot> = {}): TaskSnapshot {
  return {
    id: 't1',
    month: '2026-10-01',
    client: 'Kesar Foods',
    title: 'Diwali reel',
    category: 'Reel',
    brief: 'Brief',
    references: ['Ref: https://youtu.be/x'],
    dueDate: '2026-10-12',
    status: 'assigned',
    statusChangedAt: '2026-10-01T05:00:00+00:00',
    maxPoints: 10,
    pointsAwarded: null,
    notes: null,
    latestLinks: [],
    feedback: null,
    updatedAt: '2026-10-01T05:00:00+00:00',
    ...over,
  };
}

/** A sheet row as we would have written it, with optional edits to the editable cells. */
function row(t: TaskSnapshot, edits: { status?: string; link?: string; notes?: string; stamp?: string; id?: string } = {}, rowNumber = 2): SheetRow {
  const cells = rowValues(t);
  if (edits.status !== undefined) cells[COL.status] = edits.status;
  if (edits.link !== undefined) cells[COL.link] = edits.link;
  if (edits.notes !== undefined) cells[COL.notes] = edits.notes;
  if (edits.id !== undefined) cells[COL.id] = edits.id;
  cells[COL.editedAt] = edits.stamp ?? '';
  return { rowNumber, cells };
}

/** Row state matching what we last wrote for a task. */
function written(t: TaskSnapshot): RowState {
  const v = rowValues(t);
  return { taskId: t.id, lastStatus: v[COL.status]!, lastLink: v[COL.link]!, lastNotes: v[COL.notes]!, lastSheetEditAt: null, lastWrittenAt: '2026-10-05T00:00:00Z' };
}

function plan(t: TaskSnapshot, r: SheetRow, opts: { pending?: boolean; state?: RowState | null } = {}) {
  const state = opts.state === undefined ? written(t) : opts.state;
  return planSheetToApp({
    rows: [r],
    tasks: new Map([[t.id, t]]),
    states: new Map(state ? [[t.id, state]] : []),
    pendingApp: new Set(opts.pending ? [t.id] : []),
    now: NOW,
  });
}

describe('parsing helpers', () => {
  it('reads status labels loosely', () => {
    expect(parseStatus('In Progress')).toBe('in_progress');
    expect(parseStatus('in-progress')).toBe('in_progress');
    expect(parseStatus(' SUBMITTED ')).toBe('submitted');
    expect(parseStatus('Revision Requested')).toBe('revision_requested');
    expect(parseStatus('done')).toBe('submitted');
    expect(parseStatus('maybe')).toBeNull();
  });

  it('splits links on whitespace, commas and semicolons and drops duplicates', () => {
    expect(parseLinks('https://youtu.be/a, https://vimeo.com/1\nhttps://youtu.be/a')).toEqual({
      links: ['https://youtu.be/a', 'https://vimeo.com/1'],
      invalid: [],
    });
    expect(parseLinks('drive folder https://drive.google.com/x').invalid).toEqual(['drive', 'folder']);
  });

  it('extracts spreadsheet ids from URLs', () => {
    expect(spreadsheetIdFrom('https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/edit#gid=0')).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
    expect(spreadsheetIdFrom('1AbCdEfGhIjKlMnOpQrStUvWxYz')).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
    expect(spreadsheetIdFrom('not a sheet')).toBeNull();
  });

  it('formats IST timestamps', () => {
    expect(formatIst('2026-10-01T18:31:00Z')).toBe('2026-10-02 00:01 IST');
  });

  it('turns batchGet values into numbered rows', () => {
    const { header, rows } = toSheetRows([['Task ID'], ['a'], [], ['b', null as unknown as string]]);
    expect(header).toEqual(['Task ID']);
    expect(rows.map((r) => [r.rowNumber, r.cells[0] ?? ''])).toEqual([[2, 'a'], [3, ''], [4, 'b']]);
  });
});

describe('planSheetToApp', () => {
  it('does nothing when the row matches what we last wrote', () => {
    const t = task();
    const p = plan(t, row(t));
    expect(p.actions).toEqual([]);
    expect(p.events).toEqual([]);
    expect(p.rewrite.size).toBe(0);
    expect(p.rowOf.get('t1')).toBe(2);
  });

  it('treats a never-synced row like the app’s own values', () => {
    const t = task({ status: 'in_progress' });
    expect(plan(t, row(t), { state: null }).actions).toEqual([]);
  });

  it('In Progress starts the task', () => {
    const t = task();
    expect(plan(t, row(t, { status: 'In Progress' })).actions).toEqual([{ type: 'progress', taskId: 't1', status: 'in_progress', rowNumber: 2 }]);
  });

  it('Submitted with a valid link creates a submission, using the Apps Script edit time', () => {
    const t = task({ status: 'in_progress' });
    const p = plan(t, row(t, { status: 'Submitted', link: 'https://youtu.be/abc', notes: 'final cut', stamp: '2026-10-09T12:00:00Z' }));
    expect(p.actions).toEqual([
      { type: 'submit', taskId: 't1', links: ['https://youtu.be/abc'], notes: 'final cut', submittedAt: '2026-10-09T12:00:00.000Z', rowNumber: 2 },
    ]);
    expect(p.rewrite.has('t1')).toBe(true);
  });

  it('caps a future edit stamp to now', () => {
    const t = task({ status: 'in_progress' });
    const p = plan(t, row(t, { status: 'Submitted', link: 'https://youtu.be/abc', stamp: '2099-01-01T00:00:00Z' }));
    expect(p.actions[0]).toMatchObject({ submittedAt: NOW.toISOString() });
  });

  it('Submitted without a link is a bad_link and keeps the app status', () => {
    const t = task({ status: 'in_progress' });
    const p = plan(t, row(t, { status: 'Submitted' }));
    expect(p.actions).toEqual([]);
    expect(p.events[0]).toMatchObject({ kind: 'bad_link', taskId: 't1', detail: { reason: 'Submitted without a deliverable link' } });
    expect(p.rewrite.has('t1')).toBe(true);
  });

  it('a malformed link is a bad_link, and the typed text is kept in the sheet', () => {
    const t = task({ status: 'in_progress' });
    const p = plan(t, row(t, { status: 'Submitted', link: 'see drive' }));
    expect(p.events[0]).toMatchObject({ kind: 'bad_link', detail: { invalid: ['see', 'drive'] } });
    expect(p.keepSheetLink.has('t1')).toBe(true);
    const out = planAppToSheet({ tab: 'Tasks', tasks: new Map([[t.id, t]]), rowOf: p.rowOf, lastRow: p.lastRow, toWrite: p.rewrite, sheetValues: p.readStates, keepSheetLink: p.keepSheetLink });
    expect(out.writes[0]!.values[0]![COL.link]).toBe('see drive');
    expect(out.writes[0]!.values[0]![COL.status]).toBe('In Progress');
  });

  it('a new link on a revision request is a resubmission even if the status cell is unchanged', () => {
    const t = task({ status: 'revision_requested', latestLinks: ['https://youtu.be/v1'] });
    const p = plan(t, row(t, { link: 'https://youtu.be/v2' }));
    expect(p.actions).toEqual([expect.objectContaining({ type: 'submit', links: ['https://youtu.be/v2'] })]);
  });

  it('replacing the link while waiting for review creates a new version', () => {
    const t = task({ status: 'submitted', latestLinks: ['https://youtu.be/v1'] });
    expect(plan(t, row(t, { link: 'https://youtu.be/v2' })).actions[0]).toMatchObject({ type: 'submit', links: ['https://youtu.be/v2'] });
  });

  it('does not create a duplicate submission for the same links', () => {
    const t = task({ status: 'submitted', latestLinks: ['https://youtu.be/v1'] });
    // only whitespace differs
    const p = plan(t, row(t, { link: '  https://youtu.be/v1  ' }));
    expect(p.actions).toEqual([]);
  });

  it('a link typed on unstarted work is kept but not submitted', () => {
    const t = task();
    const p = plan(t, row(t, { link: 'https://youtu.be/draft' }));
    expect(p.actions).toEqual([]);
    expect(p.events[0]).toMatchObject({ kind: 'updated' });
    expect(p.keepSheetLink.has('t1')).toBe(true);
  });

  it('notes-only edits update the notes', () => {
    const t = task({ status: 'in_progress' });
    expect(plan(t, row(t, { notes: 'Shoot moved to Friday' })).actions).toEqual([{ type: 'notes', taskId: 't1', notes: 'Shoot moved to Friday', rowNumber: 2 }]);
  });

  it('the videographer cannot approve or request revisions from the sheet', () => {
    const t = task({ status: 'submitted', latestLinks: ['https://youtu.be/v1'] });
    const p = plan(t, row(t, { status: 'Approved' }));
    expect(p.actions).toEqual([]);
    expect(p.events[0]).toMatchObject({ kind: 'invalid_status', detail: { value: 'Approved' } });
    expect(p.rewrite.has('t1')).toBe(true);
  });

  it('unknown status text is rejected', () => {
    const t = task();
    expect(plan(t, row(t, { status: 'Kinda done' })).events[0]).toMatchObject({ kind: 'invalid_status' });
  });

  it('cannot move submitted work back to In Progress', () => {
    const t = task({ status: 'submitted', latestLinks: ['https://youtu.be/v1'] });
    expect(plan(t, row(t, { status: 'In Progress' })).events[0]).toMatchObject({ kind: 'invalid_status', detail: { from: 'submitted' } });
  });

  it('approved work is closed: sheet edits are reverted', () => {
    const t = task({ status: 'approved', pointsAwarded: 9, latestLinks: ['https://youtu.be/v1'] });
    const p = plan(t, row(t, { status: 'Submitted', link: 'https://youtu.be/v2' }));
    expect(p.actions).toEqual([]);
    expect(p.events[0]).toMatchObject({ kind: 'conflict_approved' });
    expect(p.rewrite.has('t1')).toBe(true);
  });

  describe('last write wins when both sides changed', () => {
    const t = task({ status: 'in_progress', statusChangedAt: '2026-10-09T09:00:00+00:00', updatedAt: '2026-10-09T09:00:00+00:00', notes: 'app' });

    it('sheet edited later → the sheet wins', () => {
      const p = plan(t, row(t, { notes: 'sheet', stamp: '2026-10-09T09:30:00Z' }), { pending: true });
      expect(p.events[0]).toMatchObject({ kind: 'conflict_lww', detail: { winner: 'sheet', stamped: true } });
      expect(p.actions).toEqual([expect.objectContaining({ type: 'notes', notes: 'sheet' })]);
    });

    it('app changed later → the app wins and the row is rewritten', () => {
      const p = plan(t, row(t, { notes: 'sheet', stamp: '2026-10-09T08:00:00Z' }), { pending: true });
      expect(p.events[0]).toMatchObject({ kind: 'conflict_lww', detail: { winner: 'app' } });
      expect(p.actions).toEqual([]);
      expect(p.rewrite.has('t1')).toBe(true);
    });

    it('without the Apps Script stamp the sheet edit counts as “now” (detected at sync time)', () => {
      const p = plan(t, row(t, { notes: 'sheet' }), { pending: true });
      expect(p.events[0]).toMatchObject({ kind: 'conflict_lww', detail: { winner: 'sheet', stamped: false } });
    });

    it('compares instants, not strings (+00:00 vs Z)', () => {
      const t2 = task({ status: 'in_progress', updatedAt: '2026-10-09T09:00:00.500+00:00', statusChangedAt: '2026-10-09T09:00:00+00:00' });
      const p = plan(t2, row(t2, { notes: 'x', stamp: '2026-10-09T09:00:00.100Z' }), { pending: true });
      expect(p.events[0]).toMatchObject({ detail: { winner: 'app' } });
    });
  });

  it('flags rows without an ID, unknown IDs and duplicates, and ignores empty rows', () => {
    const t = task();
    const p = planSheetToApp({
      rows: [
        row(t, {}, 2),
        { rowNumber: 3, cells: ['', '', '', 'Typed a new task myself'] },
        { rowNumber: 4, cells: [] },
        row(t, { id: 'someone-elses-task' }, 5),
        row(t, {}, 6),
      ],
      tasks: new Map([[t.id, t]]),
      states: new Map([[t.id, written(t)]]),
      pendingApp: new Set(),
      now: NOW,
    });
    expect(p.events.map((e) => [e.kind, e.rowNumber])).toEqual([
      ['missing_id', 3],
      ['unknown_id', 5],
      ['unknown_id', 6],
    ]);
    expect(p.rowOf.get('t1')).toBe(2);
    expect(p.lastRow).toBe(6);
  });
});

describe('planAppToSheet', () => {
  it('updates existing rows in place and appends missing tasks after the last row, by due date', () => {
    const a = task({ id: 'a', dueDate: '2026-10-20', title: 'A' });
    const b = task({ id: 'b', dueDate: '2026-10-05', title: 'B' });
    const c = task({ id: 'c', dueDate: '2026-10-10', title: 'C' });
    const out = planAppToSheet({
      tab: "Priya's tasks",
      tasks: new Map([a, b, c].map((t) => [t.id, t])),
      rowOf: new Map([['a', 4]]),
      lastRow: 7,
      toWrite: new Set(['a']),
    });
    expect(out.writes.map((w) => w.range)).toEqual(["'Priya''s tasks'!A4:N4", "'Priya''s tasks'!A8:N8", "'Priya''s tasks'!A9:N9"]);
    expect(out.writes.map((w) => w.values[0]![COL.title])).toEqual(['A', 'B', 'C']);
  });

  it('writes nothing when nothing changed and every task has a row', () => {
    const a = task({ id: 'a' });
    expect(planAppToSheet({ tab: 'T', tasks: new Map([['a', a]]), rowOf: new Map([['a', 2]]), lastRow: 2, toWrite: new Set() }).writes).toEqual([]);
  });

  it('row values show points only once approved, and status labels match the dropdown', () => {
    const v = rowValues(task({ status: 'approved', pointsAwarded: 8, latestLinks: ['https://a.b/1', 'https://a.b/2'] }));
    expect(v[COL.points]).toBe('8 / 10');
    expect(v[COL.status]).toBe(STATUS_LABEL.approved);
    expect(v[COL.link]).toBe('https://a.b/1\nhttps://a.b/2');
    expect(rowValues(task())[COL.points]).toBe('– / 10');
  });

  it('round trip: after we write a row, reading it back is “no change”', () => {
    const t = task({ status: 'revision_requested', latestLinks: ['https://youtu.be/v1'], notes: 'line 1\nline 2', feedback: 'Fix audio' });
    const out = planAppToSheet({ tab: 'T', tasks: new Map([[t.id, t]]), rowOf: new Map(), lastRow: 1, toWrite: new Set() });
    const w = out.written[0]!;
    const state: RowState = { taskId: t.id, lastStatus: w.status, lastLink: w.link, lastNotes: w.notes, lastSheetEditAt: null, lastWrittenAt: NOW.toISOString() };
    const back = plan(t, { rowNumber: 2, cells: [...out.writes[0]!.values[0]!, ''] }, { state });
    expect(back.actions).toEqual([]);
    expect(back.events).toEqual([]);
  });
});
