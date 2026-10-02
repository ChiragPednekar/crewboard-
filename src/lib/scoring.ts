/**
 * Monthly assessment scoring — TypeScript mirror of the SQL functions
 * `public.safe_ratio` and `public.calc_assessment_score`.
 *
 * The database is authoritative (it stores the published score); this copy powers
 * the live preview in the assessment editor. Both are tested against
 * supabase/tests/fixtures/scoring-cases.json so they cannot drift apart.
 *
 * Arithmetic is done in integers to match Postgres numeric rounding exactly:
 *   ratios   → ten-thousandths (4dp, half-up, capped at 1)
 *   weights  → hundredths
 *   score    → Σ weight × ratio, rounded half-up to 2dp
 */

export interface ScoringWeights {
  points: number;
  completion: number;
  punctuality: number;
  discretionary: number;
}

export interface MonthMetrics {
  assigned: number;
  approved: number;
  submitted: number;
  onTime: number;
  pointsAwarded: number;
  maxPoints: number;
}

export interface ScoreBreakdown {
  pointsPct: number;
  completionPct: number;
  punctualityPct: number;
  baseScore: number;
  totalScore: number;
}

export const DEFAULT_WEIGHTS: ScoringWeights = { points: 60, completion: 20, punctuality: 10, discretionary: 10 };

/** Ratio in ten-thousandths (0..10000), half-up, 0 when the denominator is 0. */
function ratioUnits(numerator: number, denominator: number): number {
  if (!(denominator > 0)) return 0;
  return Math.min(10_000, Math.round((numerator * 10_000) / denominator));
}

/** Ratio 0..1 rounded to 4dp — same as `public.safe_ratio`. */
export function safeRatio(numerator: number, denominator: number): number {
  return ratioUnits(numerator, denominator) / 10_000;
}

export function weightsSum(w: ScoringWeights): number {
  return Math.round((w.points + w.completion + w.punctuality + w.discretionary) * 100) / 100;
}

export function computeScore(input: {
  metrics: MonthMetrics;
  weights: ScoringWeights;
  /** 0–10; treated as 0 until the admin enters it */
  discretionary: number | null;
  bonus?: number;
}): ScoreBreakdown {
  const { metrics: m, weights: w } = input;
  const pp = ratioUnits(m.pointsAwarded, m.maxPoints);
  const cp = ratioUnits(m.approved, m.assigned);
  const tp = ratioUnits(m.onTime, m.submitted);
  const dp = Math.round((input.discretionary ?? 0) * 1000); // (disc / 10) in ten-thousandths

  const units =
    Math.round(w.points * 100) * pp +
    Math.round(w.completion * 100) * cp +
    Math.round(w.punctuality * 100) * tp +
    Math.round(w.discretionary * 100) * dp; // units of 1e-6 points

  const baseCents = Math.round(units / 10_000);
  const bonusCents = Math.round((input.bonus ?? 0) * 100);

  return {
    pointsPct: pp / 10_000,
    completionPct: cp / 10_000,
    punctualityPct: tp / 10_000,
    baseScore: baseCents / 100,
    totalScore: (baseCents + bonusCents) / 100,
  };
}
