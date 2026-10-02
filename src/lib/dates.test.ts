import { describe, expect, it } from 'vitest';

import { defaultDueDate, dueLabel, isInMonth, isOverdue, monthBounds, shiftDay, shiftMonth, submittedOnTime } from './dates';

describe('submittedOnTime (India calendar day)', () => {
  it('counts anything before midnight IST on the due date as on time', () => {
    // 23:59 IST on 10 Oct = 18:29 UTC
    expect(submittedOnTime('2026-10-10T18:29:00Z', '2026-10-10')).toBe(true);
  });
  it('is late from 00:00 IST the next day, even though it is still the 10th in UTC', () => {
    // 00:01 IST on 11 Oct = 18:31 UTC on 10 Oct
    expect(submittedOnTime('2026-10-10T18:31:00Z', '2026-10-10')).toBe(false);
  });
});

describe('month helpers', () => {
  it('monthBounds handles short months and leap years', () => {
    expect(monthBounds('2026-02')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(monthBounds('2028-02')).toEqual({ first: '2028-02-01', last: '2028-02-29' });
  });
  it('shiftMonth crosses years', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
  it('isInMonth and defaultDueDate', () => {
    expect(isInMonth('2026-10-31', '2026-10')).toBe(true);
    expect(isInMonth('2026-11-01', '2026-10')).toBe(false);
    expect(defaultDueDate('2026-10', '2026-10-07')).toBe('2026-10-07');
    expect(defaultDueDate('2026-11', '2026-10-07')).toBe('2026-11-15');
  });
  it('shiftDay', () => {
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('due labels', () => {
  it('describes due dates relative to today', () => {
    expect(dueLabel('2026-10-07', '2026-10-07')).toBe('Due today');
    expect(dueLabel('2026-10-08', '2026-10-07')).toBe('Due tomorrow');
    expect(dueLabel('2026-10-05', '2026-10-07')).toBe('Overdue by 2 days');
  });
  it('only open work can be overdue', () => {
    expect(isOverdue('2026-10-05', 'in_progress', '2026-10-07')).toBe(true);
    expect(isOverdue('2026-10-05', 'submitted', '2026-10-07')).toBe(false);
    expect(isOverdue('2026-10-07', 'assigned', '2026-10-07')).toBe(false);
  });
});
