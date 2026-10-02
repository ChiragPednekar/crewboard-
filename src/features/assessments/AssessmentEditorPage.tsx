import { useEffect, useMemo, useState } from 'react';
import { Award, Download, Lock, LockOpen, RefreshCw, Send } from 'lucide-react';
import { useParams } from 'react-router';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { StatusChip } from '@/components/StatusChip';
import { BackLink } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/UserAvatar';
import { usePlanTasks } from '@/features/tasks/api';
import { useVideographer } from '@/features/videographers/api';
import { formatDate, formatDateTime, formatMonth, submittedOnTime, timeAgo } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { downloadBlob } from '@/lib/export';
import { computeScore } from '@/lib/scoring';
import { cn } from '@/lib/utils';

import {
  type Assessment,
  type AssessmentEdits,
  assessmentState,
  metricsOf,
  useAssessment,
  useComputeAssessment,
  usePublishAssessment,
  useSaveAssessment,
  useUnlockAssessment,
  useUnlockHistory,
  weightsOf,
} from './api';
import { AssessmentStateChip } from './AssessmentStateChip';
import { ScoreBreakdown } from './ScoreBreakdown';
import { type PlannedTask, summariseByCategory } from './planned';

export default function AssessmentEditorPage() {
  const { videographerId = '', month = '' } = useParams();
  const person = useVideographer(videographerId);
  const assessment = useAssessment(videographerId, month);
  const tasks = usePlanTasks(videographerId, month);
  const compute = useComputeAssessment();

  const planned: PlannedTask[] = useMemo(
    () =>
      (tasks.data ?? []).map((t) => ({
        title: t.title,
        client: t.client?.name ?? '',
        category: t.category?.name ?? 'Other',
        due_date: t.due_date,
        status: t.status,
        max_points: t.max_points,
        points_awarded: t.points_awarded,
        first_submitted_at: t.first_submitted_at,
      })),
    [tasks.data],
  );

  const name = person.data?.full_name ?? 'Videographer';
  const header = (
    <>
      <BackLink to={`/admin/assessments?month=${month}`}>Assessments · {/^\d{4}-\d{2}$/.test(month) ? formatMonth(month) : ''}</BackLink>
      <PageHeader
        leading={
          person.data && (
            <span aria-hidden>
              <UserAvatar name={name} src={person.data.avatar_url} className="h-12 w-12 text-base" />
            </span>
          )
        }
        eyebrow={/^\d{4}-\d{2}$/.test(month) ? formatMonth(month) : ''}
        title={`${name}’s assessment`}
        description={<AssessmentStateChip state={assessmentState(assessment.data)} />}
      />
    </>
  );

  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return <ErrorState error="That month isn’t valid." />;
  if (assessment.isPending || person.isPending) {
    return (
      <>
        {header}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </>
    );
  }
  if (assessment.isError) return <ErrorState error={assessment.error} onRetry={() => void assessment.refetch()} />;

  if (!assessment.data) {
    const live = planned.filter((t) => t.status !== 'cancelled').length;
    return (
      <>
        {header}
        <EmptyState
          icon={Award}
          title="Not assessed yet"
          description={
            live > 0
              ? `We’ll fill in ${name.split(' ')[0]}’s numbers from ${live} tasks. You add the discretionary score and remarks, then publish.`
              : `There are no tasks in ${formatMonth(month)} to assess. You can still start one if needed.`
          }
          action={
            <Button
              loading={compute.isPending}
              onClick={() =>
                compute.mutate(
                  { vid: videographerId, month },
                  { onSuccess: () => toast.success('Draft created from this month’s tasks'), onError: (e) => toast.error(friendlyError(e)) },
                )
              }
            >
              <Award /> Start assessment
            </Button>
          }
        />
      </>
    );
  }

  return (
    <>
      {header}
      <Editor key={assessment.data.id} assessment={assessment.data} name={name} planned={planned} tasksLoading={tasks.isPending} />
    </>
  );
}

function editsOf(a: Assessment): AssessmentEdits {
  return {
    discretionary_score: a.discretionary_score === null ? null : Number(a.discretionary_score),
    bonus_points: Number(a.bonus_points),
    bonus_reason: a.bonus_reason ?? '',
    admin_remarks: a.admin_remarks ?? '',
    public_note: a.public_note ?? '',
  };
}

function Editor({ assessment: a, name, planned, tasksLoading }: { assessment: Assessment; name: string; planned: PlannedTask[]; tasksLoading: boolean }) {
  const firstName = name.split(' ')[0] ?? name;
  const state = assessmentState(a);
  const locked = state === 'published';
  const save = useSaveAssessment();
  const publish = usePublishAssessment();
  const unlock = useUnlockAssessment();
  const compute = useComputeAssessment();
  const unlocks = useUnlockHistory(a.id);
  const [edits, setEdits] = useState<AssessmentEdits>(() => editsOf(a));
  const [dialog, setDialog] = useState<'publish' | 'unlock' | null>(null);
  const [unlockReason, setUnlockReason] = useState('');
  const [pdfBusy, setPdfBusy] = useState(false);

  // pick up server changes (refresh, publish) without clobbering unsaved typing
  const serverEdits = editsOf(a);
  const serverKey = JSON.stringify(serverEdits);
  useEffect(() => setEdits(JSON.parse(serverKey) as AssessmentEdits), [serverKey]);

  const dirty = JSON.stringify(edits) !== serverKey;
  const weights = weightsOf(a);
  const preview = computeScore({ metrics: metricsOf(a), weights, discretionary: edits.discretionary_score, bonus: edits.bonus_points });

  const errors = {
    discretionary:
      edits.discretionary_score !== null && !(edits.discretionary_score >= 0 && edits.discretionary_score <= 10) ? 'Use 0–10' : null,
    bonus: !(edits.bonus_points >= 0 && edits.bonus_points <= 100) ? 'Use 0–100' : null,
    bonusReason: edits.bonus_points > 0 && !edits.bonus_reason.trim() ? 'Say what the bonus is for' : null,
    note: edits.public_note.length > 280 ? 'Keep it under 280 characters' : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const canPublish = !invalid && edits.discretionary_score !== null;


  async function downloadPdf() {
    setPdfBusy(true);
    try {
      const { renderAssessmentPdf } = await import('./AssessmentPdf');
      const blob = await renderAssessmentPdf({ assessment: a, name, tasks: planned });
      downloadBlob(blob, `${name.replace(/\s+/g, '-')}-${a.month.slice(0, 7)}-assessment.pdf`);
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setPdfBusy(false);
    }
  }

  const set = <K extends keyof AssessmentEdits>(k: K, v: AssessmentEdits[K]) => setEdits((e) => ({ ...e, [k]: v }));

  return (
    <>
      <div className="mb-6 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => void downloadPdf()} loading={pdfBusy} disabled={tasksLoading}>
          {!pdfBusy && <Download />} PDF
        </Button>
        {!locked && (
          <Button
            variant="ghost"
            loading={compute.isPending}
            onClick={() =>
              compute.mutate(
                { vid: a.videographer_id, month: a.month.slice(0, 7) },
                { onSuccess: () => toast.success('Numbers refreshed from the latest task data'), onError: (e) => toast.error(friendlyError(e)) },
              )
            }
          >
            {!compute.isPending && <RefreshCw />} Refresh numbers
          </Button>
        )}
        <span className="self-center text-xs text-muted-foreground">Numbers from {timeAgo(a.computed_at)}</span>
        <div className="ml-auto flex gap-2">
          {locked ? (
            <Button variant="secondary" onClick={() => setDialog('unlock')}>
              <LockOpen /> Unlock to edit
            </Button>
          ) : (
            <Button onClick={() => setDialog('publish')} disabled={!canPublish} title={edits.discretionary_score === null ? 'Add the discretionary score first' : undefined}>
              <Send /> {a.status === 'published' ? 'Republish & lock' : 'Publish & lock'}
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card className="studio-glow">
            <CardContent className="p-5 sm:p-6">
              <ScoreBreakdown assessment={a} discretionary={edits.discretionary_score} bonus={edits.bonus_points} label={dirty ? 'Preview' : 'Score'} />
              <p className="mt-4 text-xs text-muted-foreground">
                Weights {a.status === 'published' ? 'were fixed when this was published' : 'follow Settings until publishing'}: points {weights.points}, completion {weights.completion},
                punctuality {weights.punctuality}, discretionary {weights.discretionary}.
              </p>
            </CardContent>
          </Card>

          <PlannedVsCompleted tasks={planned} loading={tasksLoading} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                {locked && <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />} Your assessment
              </CardTitle>
              {locked && <p className="text-sm text-muted-foreground">Published and locked. Unlock (with a reason) to change it.</p>}
            </CardHeader>
            <CardContent>
              <form
                className="space-y-5"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (invalid) return;
                  save.mutate({ id: a.id, edits }, { onSuccess: () => toast.success('Draft saved'), onError: (err) => toast.error(friendlyError(err)) });
                }}
              >
                <fieldset disabled={locked} className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <Label htmlFor="disc">Discretionary score</Label>
                      <span className="text-xs text-muted-foreground">0–10 · worth {weights.discretionary} pts</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="range"
                        min={0}
                        max={10}
                        step={0.5}
                        value={edits.discretionary_score ?? 0}
                        onChange={(e) => set('discretionary_score', e.target.valueAsNumber)}
                        className="h-2 flex-1 cursor-pointer accent-[hsl(var(--primary))]"
                        aria-label="Discretionary score slider"
                      />
                      <Input
                        id="disc"
                        type="number"
                        min={0}
                        max={10}
                        step={0.5}
                        inputMode="decimal"
                        value={edits.discretionary_score ?? ''}
                        placeholder="–"
                        onChange={(e) => set('discretionary_score', e.target.value === '' ? null : e.target.valueAsNumber)}
                        aria-invalid={Boolean(errors.discretionary) || undefined}
                        className="tabular w-20 text-right"
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">Attitude, client feedback, initiative — what the numbers miss.</p>
                    {errors.discretionary && <p className="text-sm text-danger-text">{errors.discretionary}</p>}
                  </div>

                  <div className="grid grid-cols-[6rem_1fr] gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="bonus">Bonus</Label>
                      <Input
                        id="bonus"
                        type="number"
                        min={0}
                        max={100}
                        step={0.5}
                        inputMode="decimal"
                        value={Number.isNaN(edits.bonus_points) ? '' : edits.bonus_points}
                        onChange={(e) => set('bonus_points', e.target.value === '' ? 0 : e.target.valueAsNumber)}
                        aria-invalid={Boolean(errors.bonus) || undefined}
                        className="tabular"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bonus-reason">Reason</Label>
                      <Input
                        id="bonus-reason"
                        maxLength={500}
                        value={edits.bonus_reason}
                        disabled={locked || edits.bonus_points === 0}
                        onChange={(e) => set('bonus_reason', e.target.value)}
                        aria-invalid={Boolean(errors.bonusReason) || undefined}
                        placeholder={edits.bonus_points > 0 ? 'e.g. covered an emergency shoot' : 'Only with a bonus'}
                      />
                    </div>
                  </div>
                  {(errors.bonus || errors.bonusReason) && <p className="-mt-3 text-sm text-danger-text">{errors.bonus ?? errors.bonusReason}</p>}

                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between">
                      <Label htmlFor="note">Public highlight</Label>
                      <span className={cn('tabular text-xs', edits.public_note.length > 280 ? 'text-danger-text' : 'text-muted-foreground')}>
                        {edits.public_note.length}/280
                      </span>
                    </div>
                    <Textarea id="note" rows={2} value={edits.public_note} onChange={(e) => set('public_note', e.target.value)} placeholder="Shown to everyone on the home page if they’re top performer" />
                    {errors.note && <p className="text-sm text-danger-text">{errors.note}</p>}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="remarks">Private remarks</Label>
                    <Textarea id="remarks" rows={4} maxLength={4000} value={edits.admin_remarks} onChange={(e) => set('admin_remarks', e.target.value)} placeholder="What went well, what to improve" />
                    <p className="text-xs text-muted-foreground">Only admins and {firstName} see these, once published.</p>
                  </div>
                </fieldset>

                {!locked && (
                  <Button type="submit" variant="secondary" className="w-full" disabled={!dirty || invalid} loading={save.isPending}>
                    Save draft
                  </Button>
                )}
              </form>
            </CardContent>
          </Card>

          {a.published_at && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  Published <span className="text-muted-foreground">{formatDateTime(a.published_at)}</span>
                </p>
                {(unlocks.data ?? []).map((u) => (
                  <div key={u.id}>
                    <p>
                      Unlocked by {u.by?.full_name ?? 'an admin'} <span className="text-muted-foreground">{formatDateTime(u.unlocked_at)}</span>
                    </p>
                    <p className="text-muted-foreground">“{u.reason}”</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={dialog === 'publish'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`${a.status === 'published' ? 'Republish' : 'Publish'} ${firstName}’s ${formatMonth(a.month.slice(0, 7))} assessment?`}
        description={
          <div className="space-y-2">
            <p>
              Score <strong className="tabular text-foreground">{preview.totalScore.toFixed(2)}</strong> (numbers are refreshed one last time). {firstName} is notified and
              can see the score and your remarks.
            </p>
            <p>It’s then locked: tasks in this month can’t be reviewed, re-scored or changed until you unlock it.</p>
          </div>
        }
        confirmLabel={a.status === 'published' ? 'Republish' : 'Publish'}
        loading={publish.isPending}
        onConfirm={() =>
          publish.mutate(
            { id: a.id, edits },
            {
              onSuccess: () => {
                toast.success('Published and locked', { description: `${firstName} has been notified.` });
                setDialog(null);
              },
              onError: (e) => toast.error(friendlyError(e)),
            },
          )
        }
      />
      <ConfirmDialog
        open={dialog === 'unlock'}
        onOpenChange={(o) => {
          if (!o) {
            setDialog(null);
            setUnlockReason('');
          }
        }}
        title="Unlock this assessment?"
        description={`${firstName} keeps seeing the published score until you republish. The reason is kept in the history.`}
        confirmLabel="Unlock"
        confirmDisabled={unlockReason.trim().length < 5}
        loading={unlock.isPending}
        onConfirm={() =>
          unlock.mutate(
            { id: a.id, reason: unlockReason },
            {
              onSuccess: () => {
                toast.success('Unlocked — you can edit and republish');
                setDialog(null);
                setUnlockReason('');
              },
              onError: (e) => toast.error(friendlyError(e)),
            },
          )
        }
      >
        <div className="space-y-2">
          <Label htmlFor="unlock-reason">Reason (at least 5 characters)</Label>
          <Textarea id="unlock-reason" rows={2} value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} maxLength={1000} />
        </div>
      </ConfirmDialog>
    </>
  );
}

function PlannedVsCompleted({ tasks, loading }: { tasks: PlannedTask[]; loading: boolean }) {
  const summary = summariseByCategory(tasks);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Planned vs completed</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <Skeleton className="h-40" />
        ) : tasks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No tasks were planned this month.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Category</th>
                    <th className="py-2 pr-3 text-right font-medium">Planned</th>
                    <th className="py-2 pr-3 text-right font-medium">Completed</th>
                    <th className="py-2 text-right font-medium">Points</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {summary.map((c) => (
                    <tr key={c.category} className={cn('border-b border-border/60', c.category === 'Total' && 'font-semibold')}>
                      <td className="py-2 pr-3">{c.category}</td>
                      <td className="py-2 pr-3 text-right">{c.planned}</td>
                      <td className="py-2 pr-3 text-right">{c.completed}</td>
                      <td className="py-2 text-right">
                        {c.points}
                        <span className="text-muted-foreground"> / {c.maxPoints}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {tasks.map((t, i) => {
                const onTime = t.first_submitted_at ? submittedOnTime(t.first_submitted_at, t.due_date) : null;
                return (
                  <li key={i} className={cn('flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3', t.status === 'cancelled' && 'text-muted-foreground line-through decoration-1')}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.category} · due {formatDate(t.due_date, 'd MMM')}
                        {onTime !== null && <span className={onTime ? 'text-success-text' : 'text-warning-text'}> · {onTime ? 'on time' : 'late'}</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusChip status={t.status} />
                      <span className="tabular w-16 text-right text-sm">
                        {t.status === 'approved' ? `${t.points_awarded}/${t.max_points}` : t.status === 'cancelled' ? '–' : `0/${t.max_points}`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

