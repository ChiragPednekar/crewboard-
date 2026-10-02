import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { friendlyError } from '@/lib/errors';
import { weightsSum } from '@/lib/scoring';
import { cn } from '@/lib/utils';

import { useAppSettings, useUpdateAppSettings } from './api';

const FIELDS = [
  { key: 'points', column: 'weight_points', label: 'Points earned', hint: 'Points awarded ÷ points available' },
  { key: 'completion', column: 'weight_completion', label: 'Completion', hint: 'Tasks approved ÷ tasks assigned' },
  { key: 'punctuality', column: 'weight_punctuality', label: 'Punctuality', hint: 'First submissions on time ÷ submitted' },
  { key: 'discretionary', column: 'weight_discretionary', label: 'Discretionary', hint: 'Your 0–10 score' },
] as const;

type Weights = Record<(typeof FIELDS)[number]['key'], number>;

export function ScoringTab() {
  const settings = useAppSettings();
  const update = useUpdateAppSettings();
  const [w, setW] = useState<Weights>({ points: 60, completion: 20, punctuality: 10, discretionary: 10 });

  useEffect(() => {
    if (settings.data)
      setW({
        points: Number(settings.data.weight_points),
        completion: Number(settings.data.weight_completion),
        punctuality: Number(settings.data.weight_punctuality),
        discretionary: Number(settings.data.weight_discretionary),
      });
  }, [settings.data]);

  const sum = weightsSum(w);
  const valid = sum === 100 && Object.values(w).every((v) => Number.isFinite(v) && v >= 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Scoring weights</CardTitle>
        <p className="text-sm text-muted-foreground">
          How much each part counts towards the monthly score out of 100. Draft assessments follow these immediately; published ones keep the weights they were published with.
        </p>
      </CardHeader>
      <CardContent>
        {settings.isPending ? (
          <Skeleton className="h-48" />
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!valid) return;
              update.mutate(
                { weight_points: w.points, weight_completion: w.completion, weight_punctuality: w.punctuality, weight_discretionary: w.discretionary },
                { onSuccess: () => toast.success('Weights saved'), onError: (err) => toast.error(friendlyError(err)) },
              );
            }}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <div key={f.key} className="space-y-1.5">
                  <Label htmlFor={`w-${f.key}`}>{f.label}</Label>
                  <Input
                    id={`w-${f.key}`}
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={Number.isNaN(w[f.key]) ? '' : w[f.key]}
                    onChange={(e) => setW((x) => ({ ...x, [f.key]: e.target.valueAsNumber }))}
                    className="tabular"
                  />
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className={cn('text-sm', sum === 100 ? 'text-success-text' : 'text-danger-text')} aria-live="polite">
                Total <span className="tabular font-semibold">{Number.isFinite(sum) ? sum : '–'}</span> / 100{sum !== 100 && ' — must add up to exactly 100'}
              </p>
              <Button type="submit" disabled={!valid} loading={update.isPending}>
                Save weights
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
