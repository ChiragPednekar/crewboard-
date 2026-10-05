import { addDays, endOfMonth, format, parseISO, startOfMonth, startOfWeek } from 'date-fns';

import type { TaskStatus } from '@/lib/supabase';

export interface CalendarTask {
  id: string;
  title: string;
  status: TaskStatus;
  due_date: string;
  shoot_date: string | null;
  videographer: { id: string; full_name: string; avatar_url: string | null } | null;
  client: { name: string } | null;
}

export interface CalendarLeave {
  id: string;
  kind: string;
  start_date: string;
  end_date: string;
  videographer: { id: string; full_name: string } | null;
}

export type CalendarEvent =
  | { kind: 'shoot'; day: string; task: CalendarTask; clash: boolean }
  | { kind: 'due'; day: string; task: CalendarTask }
  | { kind: 'leave'; day: string; leave: CalendarLeave };

/** Monday-first weeks covering the month, as YYYY-MM-DD strings. */
export function monthGrid(monthKey: string): { day: string; inMonth: boolean }[][] {
  const first = startOfMonth(parseISO(`${monthKey}-01`));
  const last = endOfMonth(first);
  let cursor = startOfWeek(first, { weekStartsOn: 1 });
  const weeks: { day: string; inMonth: boolean }[][] = [];
  while (cursor <= last) {
    const week: { day: string; inMonth: boolean }[] = [];
    for (let i = 0; i < 7; i++) {
      week.push({ day: format(cursor, 'yyyy-MM-dd'), inMonth: format(cursor, 'yyyy-MM') === monthKey });
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/**
 * A shoot clashes when the same person has another shoot that day, or is on approved leave.
 * Returns the set of task ids that clash.
 */
export function findClashes(tasks: CalendarTask[], leave: CalendarLeave[]): Set<string> {
  const clashes = new Set<string>();
  const byPersonDay = new Map<string, string[]>();
  for (const t of tasks) {
    if (!t.shoot_date || !t.videographer || t.status === 'cancelled') continue;
    const key = `${t.videographer.id}|${t.shoot_date}`;
    byPersonDay.set(key, [...(byPersonDay.get(key) ?? []), t.id]);
    const onLeave = leave.some(
      (l) => l.videographer?.id === t.videographer!.id && l.start_date <= t.shoot_date! && t.shoot_date! <= l.end_date,
    );
    if (onLeave) clashes.add(t.id);
  }
  for (const ids of byPersonDay.values()) if (ids.length > 1) ids.forEach((id) => clashes.add(id));
  return clashes;
}

/** Events per day for the grid: shoots, due dates (when different from the shoot) and leave. */
export function eventsByDay(tasks: CalendarTask[], leave: CalendarLeave[], days: string[]): Map<string, CalendarEvent[]> {
  const clashes = findClashes(tasks, leave);
  const map = new Map<string, CalendarEvent[]>(days.map((d) => [d, []]));
  for (const t of tasks) {
    if (t.status === 'cancelled') continue;
    if (t.shoot_date && map.has(t.shoot_date)) map.get(t.shoot_date)!.push({ kind: 'shoot', day: t.shoot_date, task: t, clash: clashes.has(t.id) });
    if (t.due_date !== t.shoot_date && map.has(t.due_date)) map.get(t.due_date)!.push({ kind: 'due', day: t.due_date, task: t });
  }
  for (const l of leave) {
    for (const d of days) if (l.start_date <= d && d <= l.end_date) map.get(d)!.push({ kind: 'leave', day: d, leave: l });
  }
  const order = { leave: 0, shoot: 1, due: 2 } as const;
  for (const list of map.values()) list.sort((a, b) => order[a.kind] - order[b.kind]);
  return map;
}
