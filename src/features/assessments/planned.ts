import type { TaskStatus } from '@/lib/supabase';

/** A task as it counts in an assessment (names resolved). */
export interface PlannedTask {
  title: string;
  client: string;
  category: string;
  due_date: string;
  status: TaskStatus;
  max_points: number;
  points_awarded: number | null;
  first_submitted_at: string | null;
}

export const STATUS_TEXT: Record<TaskStatus, string> = {
  assigned: 'Not started',
  in_progress: 'In progress',
  submitted: 'Awaiting review',
  revision_requested: 'Revision requested',
  approved: 'Approved',
  cancelled: 'Cancelled',
};

export interface CategorySummary {
  category: string;
  planned: number;
  completed: number;
  points: number;
  maxPoints: number;
}

/**
 * Planned vs completed per category. Cancelled tasks are left out, as in scoring;
 * "completed" means approved.
 */
export function summariseByCategory(tasks: PlannedTask[]): CategorySummary[] {
  const map = new Map<string, CategorySummary>();
  for (const t of tasks) {
    if (t.status === 'cancelled') continue;
    const c = map.get(t.category) ?? { category: t.category, planned: 0, completed: 0, points: 0, maxPoints: 0 };
    c.planned += 1;
    c.maxPoints += t.max_points;
    if (t.status === 'approved') {
      c.completed += 1;
      c.points += t.points_awarded ?? 0;
    }
    map.set(t.category, c);
  }
  const rows = [...map.values()].sort((a, b) => b.planned - a.planned || a.category.localeCompare(b.category));
  if (rows.length > 1) {
    rows.push(
      rows.reduce<CategorySummary>(
        (acc, r) => ({
          category: 'Total',
          planned: acc.planned + r.planned,
          completed: acc.completed + r.completed,
          points: acc.points + r.points,
          maxPoints: acc.maxPoints + r.maxPoints,
        }),
        { category: 'Total', planned: 0, completed: 0, points: 0, maxPoints: 0 },
      ),
    );
  }
  return rows;
}
