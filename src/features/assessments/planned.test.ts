import { describe, expect, it } from 'vitest';

import { type PlannedTask, summariseByCategory } from './planned';

const task = (category: string, status: PlannedTask['status'], max: number, pts: number | null = null): PlannedTask => ({
  title: 't',
  client: 'c',
  category,
  due_date: '2026-10-10',
  status,
  max_points: max,
  points_awarded: pts,
  first_submitted_at: null,
});

describe('summariseByCategory', () => {
  it('counts approved as completed, skips cancelled, adds a total row', () => {
    const rows = summariseByCategory([
      task('Reel', 'approved', 10, 9),
      task('Reel', 'submitted', 10),
      task('Reel', 'cancelled', 10),
      task('Surgery video', 'approved', 25, 22),
    ]);
    expect(rows).toEqual([
      { category: 'Reel', planned: 2, completed: 1, points: 9, maxPoints: 20 },
      { category: 'Surgery video', planned: 1, completed: 1, points: 22, maxPoints: 25 },
      { category: 'Total', planned: 3, completed: 2, points: 31, maxPoints: 45 },
    ]);
  });

  it('has no total row for a single category, and nothing for no tasks', () => {
    expect(summariseByCategory([task('Reel', 'assigned', 10)])).toHaveLength(1);
    expect(summariseByCategory([])).toEqual([]);
  });
});
