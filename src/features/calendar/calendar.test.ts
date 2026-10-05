import { describe, expect, it } from 'vitest';

import { type CalendarLeave, type CalendarTask, eventsByDay, findClashes, monthGrid } from './calendar';

const person = (id: string) => ({ id, full_name: id, avatar_url: null });
const task = (id: string, vid: string, shoot: string | null, due: string, status: CalendarTask['status'] = 'assigned'): CalendarTask => ({
  id,
  title: id,
  status,
  due_date: due,
  shoot_date: shoot,
  videographer: person(vid),
  client: { name: 'C' },
});

describe('monthGrid', () => {
  it('starts on Monday and covers the whole month', () => {
    const weeks = monthGrid('2026-10'); // 1 Oct 2026 is a Thursday
    expect(weeks[0]![0]!.day).toBe('2026-09-28');
    expect(weeks[0]![3]).toEqual({ day: '2026-10-01', inMonth: true });
    const all = weeks.flat();
    expect(all.filter((d) => d.inMonth)).toHaveLength(31);
    expect(all.length % 7).toBe(0);
  });
});

describe('findClashes', () => {
  it('flags two shoots for one person on the same day', () => {
    const clashes = findClashes([task('a', 'v1', '2026-10-05', '2026-10-10'), task('b', 'v1', '2026-10-05', '2026-10-12'), task('c', 'v2', '2026-10-05', '2026-10-12')], []);
    expect([...clashes].sort()).toEqual(['a', 'b']);
  });
  it('flags a shoot during approved leave', () => {
    const leave: CalendarLeave[] = [{ id: 'l', kind: 'leave', start_date: '2026-10-04', end_date: '2026-10-06', videographer: person('v2') }];
    expect([...findClashes([task('c', 'v2', '2026-10-05', '2026-10-12')], leave)]).toEqual(['c']);
  });
  it('ignores cancelled tasks', () => {
    expect(findClashes([task('a', 'v1', '2026-10-05', '2026-10-10'), task('b', 'v1', '2026-10-05', '2026-10-12', 'cancelled')], []).size).toBe(0);
  });
});

describe('eventsByDay', () => {
  it('places shoots, due dates and leave on their days', () => {
    const days = ['2026-10-05', '2026-10-06', '2026-10-10'];
    const leave: CalendarLeave[] = [{ id: 'l', kind: 'sick', start_date: '2026-10-06', end_date: '2026-10-06', videographer: person('v2') }];
    const map = eventsByDay([task('a', 'v1', '2026-10-05', '2026-10-10')], leave, days);
    expect(map.get('2026-10-05')!.map((e) => e.kind)).toEqual(['shoot']);
    expect(map.get('2026-10-06')!.map((e) => e.kind)).toEqual(['leave']);
    expect(map.get('2026-10-10')!.map((e) => e.kind)).toEqual(['due']);
  });
  it('shows one event when the shoot and due date are the same day', () => {
    const map = eventsByDay([task('a', 'v1', '2026-10-05', '2026-10-05')], [], ['2026-10-05']);
    expect(map.get('2026-10-05')).toHaveLength(1);
  });
});
