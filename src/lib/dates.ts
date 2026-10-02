import { TZDate } from '@date-fns/tz';
import { addDays, addMonths, differenceInCalendarDays, endOfMonth, format, formatDistanceToNowStrict, parseISO } from 'date-fns';

/** All dates are stored in UTC and displayed in India time. */
export const APP_TZ = 'Asia/Kolkata';

/** "Now" as a wall-clock date in India. */
export function nowInIndia(): TZDate {
  return new TZDate(Date.now(), APP_TZ);
}

/** Today in India as YYYY-MM-DD. */
export function todayKey(): string {
  return format(nowInIndia(), 'yyyy-MM-dd');
}

/** Month key YYYY-MM for a date (default: current month in India). */
export function monthKey(date: Date = nowInIndia()): string {
  return format(date, 'yyyy-MM');
}

/** "2026-10" → "2026-10-01" (the DB's month representation). */
export function monthKeyToDate(key: string): string {
  return `${key}-01`;
}

/** "2026-10-01" | "2026-10" → "2026-10". */
export function toMonthKey(value: string): string {
  return value.slice(0, 7);
}

export function shiftMonth(key: string, delta: number): string {
  return format(addMonths(parseISO(`${key}-01`), delta), 'yyyy-MM');
}

/** "2026-10" → "October 2026" */
export function formatMonth(key: string, pattern = 'MMMM yyyy'): string {
  return format(parseISO(`${toMonthKey(key)}-01`), pattern);
}

/** Format a timestamptz (ISO string) in India time. */
export function formatDateTime(iso: string, pattern = 'd MMM yyyy, h:mm a'): string {
  return format(new TZDate(new Date(iso).getTime(), APP_TZ), pattern);
}

/** Format a calendar date (YYYY-MM-DD, no time zone). */
export function formatDate(day: string, pattern = 'd MMM yyyy'): string {
  return format(parseISO(day), pattern);
}

export function timeAgo(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

const CLOSED = new Set(['submitted', 'approved', 'cancelled']);

/** Overdue = due date before today (India) and the work hasn't been handed in. */
export function isOverdue(dueDate: string, status: string, today: string = todayKey()): boolean {
  return !CLOSED.has(status) && dueDate < today;
}

/** Human label for a due date relative to today. */
export function dueLabel(dueDate: string, today: string = todayKey()): string {
  const days = differenceInCalendarDays(parseISO(dueDate), parseISO(today));
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  if (days > 1) return `Due in ${days} days`;
  if (days === -1) return 'Overdue by 1 day';
  return `Overdue by ${Math.abs(days)} days`;
}

/** First and last calendar day of a month key, as YYYY-MM-DD. */
export function monthBounds(key: string): { first: string; last: string } {
  const first = parseISO(`${toMonthKey(key)}-01`);
  return { first: format(first, 'yyyy-MM-dd'), last: format(endOfMonth(first), 'yyyy-MM-dd') };
}

/** Is a YYYY-MM-DD day inside the month key? */
export function isInMonth(day: string, key: string): boolean {
  return day.slice(0, 7) === toMonthKey(key);
}

/** A sensible default due date for a new task in a month: today if inside it, else the 15th. */
export function defaultDueDate(key: string, today: string = todayKey()): string {
  if (isInMonth(today, key)) return today;
  return `${toMonthKey(key)}-15`;
}

/** Shift a YYYY-MM-DD day by n calendar days. */
export function shiftDay(day: string, n: number): string {
  return format(addDays(parseISO(day), n), 'yyyy-MM-dd');
}

/** Was a submission (timestamptz) made by the end of its due date in India? Mirrors `submissions.is_on_time`. */
export function submittedOnTime(submittedAtIso: string, dueDate: string): boolean {
  return formatDateTime(submittedAtIso, 'yyyy-MM-dd') <= dueDate;
}
