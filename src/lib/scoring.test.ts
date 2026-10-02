import { describe, expect, it } from 'vitest';

import cases from '../../supabase/tests/fixtures/scoring-cases.json';
import { computeScore, safeRatio, weightsSum } from './scoring';

describe('computeScore (shared fixtures with SQL)', () => {
  it.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const result = computeScore({
      metrics: c.metrics,
      weights: c.weights,
      discretionary: c.discretionary,
      bonus: c.bonus,
    });
    expect(result).toEqual(c.expected);
  });
});

describe('safeRatio', () => {
  it('is 0 when the denominator is 0', () => {
    expect(safeRatio(5, 0)).toBe(0);
  });
  it('rounds half up at 4 decimals', () => {
    expect(safeRatio(1, 32)).toBe(0.0313);
    expect(safeRatio(2, 3)).toBe(0.6667);
  });
  it('caps at 1', () => {
    expect(safeRatio(7, 5)).toBe(1);
  });
});

describe('computeScore edge cases', () => {
  const metrics = { assigned: 2, approved: 1, submitted: 2, onTime: 1, pointsAwarded: 10, maxPoints: 20 };
  const weights = { points: 60, completion: 20, punctuality: 10, discretionary: 10 };

  it('treats a missing discretionary score as 0 (draft preview)', () => {
    expect(computeScore({ metrics, weights, discretionary: null }).baseScore).toBe(45);
  });
  it('adds bonus on top of the weighted score', () => {
    const { baseScore, totalScore } = computeScore({ metrics, weights, discretionary: 10, bonus: 2.5 });
    expect(baseScore).toBe(55);
    expect(totalScore).toBe(57.5);
  });
  it('weightsSum handles decimals', () => {
    expect(weightsSum({ points: 33.33, completion: 33.33, punctuality: 33.34, discretionary: 0 })).toBe(100);
  });
});
