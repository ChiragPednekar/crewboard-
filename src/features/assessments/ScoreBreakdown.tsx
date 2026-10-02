import { motion } from 'framer-motion';

import { computeScore } from '@/lib/scoring';

import { type Assessment, metricsOf, weightsOf } from './api';

/** Total score plus the four weighted components as bars. Used by the editor (live) and "My points". */
export function ScoreBreakdown({
  assessment: a,
  discretionary,
  bonus,
  label = 'Score',
}: {
  assessment: Assessment;
  discretionary: number | null;
  bonus: number;
  label?: string;
}) {
  const weights = weightsOf(a);
  const score = computeScore({ metrics: metricsOf(a), weights, discretionary, bonus });
  const parts = [
    { label: 'Points earned', ratio: score.pointsPct, weight: weights.points, detail: `${a.points_awarded_sum} of ${a.max_points_sum} pts` },
    { label: 'Completion', ratio: score.completionPct, weight: weights.completion, detail: `${a.approved_count} of ${a.assigned_count} approved` },
    { label: 'Punctuality', ratio: score.punctualityPct, weight: weights.punctuality, detail: `${a.on_time_count} of ${a.submitted_count} on time` },
    { label: 'Discretionary', ratio: (discretionary ?? 0) / 10, weight: weights.discretionary, detail: discretionary === null ? 'not set yet' : `${discretionary} / 10` },
  ];

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="tabular mt-1 font-display text-5xl font-semibold text-primary-text">{score.totalScore.toFixed(2)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        out of 100{bonus > 0 && ` · base ${score.baseScore.toFixed(2)} + ${bonus} bonus`}
      </p>
      <ul className="mt-6 space-y-4">
        {parts.map((p) => (
          <li key={p.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                <span className="font-medium">{p.label}</span> <span className="text-muted-foreground">· {p.detail}</span>
              </span>
              <span className="tabular shrink-0">
                <span className="font-semibold">{(p.weight * p.ratio).toFixed(2)}</span>
                <span className="text-muted-foreground"> / {p.weight}</span>
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
              <motion.div
                className="h-full rounded-full bg-violet"
                initial={{ width: 0 }}
                animate={{ width: `${Math.round(p.ratio * 100)}%` }}
                transition={{ type: 'spring', stiffness: 120, damping: 20 }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
