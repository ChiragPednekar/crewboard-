import { useEffect, useMemo, useState } from 'react';
import { Copy, EyeOff, FilePlus2, ListPlus, Plus, Send, Target } from 'lucide-react';
import { toast } from 'sonner';

import { PlanStatusChip } from '@/components/Chips';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { BackLink } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/UserAvatar';
import { useCrewOptions } from '@/features/lookups/api';
import { type TaskListItem, usePlanTasks } from '@/features/tasks/api';
import { TaskFormDialog } from '@/features/tasks/TaskFormDialog';
import { TaskList } from '@/features/tasks/TaskList';
import { formatDateTime, formatMonth, shiftMonth } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import type { MonthlyPlan } from '@/lib/supabase';

import { useEnsurePlan, usePlan, usePlanMonths, usePublishPlan, useSavePlanNotes } from './api';
import { CopyPlanDialog } from './CopyPlanDialog';

interface PlanBuilderProps {
  videographerId: string;
  month: string;
  onMonthChange: (m: string) => void;
  onVideographerChange: (id: string) => void;
}

export function PlanBuilder({ videographerId, month, onMonthChange, onVideographerChange }: PlanBuilderProps) {
  const crew = useCrewOptions();
  const plan = usePlan(videographerId, month);
  const tasks = usePlanTasks(videographerId, month);
  const months = usePlanMonths(videographerId);
  const ensure = useEnsurePlan();
  const publish = usePublishPlan();
  const [taskDialog, setTaskDialog] = useState<{ task?: TaskListItem } | null>(null);
  const [copying, setCopying] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);

  const person = crew.data?.find((p) => p.id === videographerId);
  const firstName = person?.full_name.split(' ')[0] ?? 'They';
  const prevMonth = shiftMonth(month, -1);
  const prevHasTasks = (months.data ?? []).some((m) => m.month === prevMonth && m.tasks > 0);
  const anyOtherMonth = (months.data ?? []).some((m) => m.month !== month && m.tasks > 0);

  const totals = useMemo(() => {
    const live = (tasks.data ?? []).filter((t) => t.status !== 'cancelled');
    return {
      count: live.length,
      points: live.reduce((s, t) => s + t.max_points, 0),
      approved: live.filter((t) => t.status === 'approved').length,
      cancelled: (tasks.data ?? []).length - live.length,
    };
  }, [tasks.data]);

  const crewSwitcher = (
    <Select value={videographerId} onValueChange={onVideographerChange}>
      <SelectTrigger className="w-full sm:w-56" aria-label="Videographer">
        <SelectValue placeholder="Videographer" />
      </SelectTrigger>
      <SelectContent>
        {(crew.data ?? [])
          .filter((p) => p.is_active || p.id === videographerId)
          .map((p) => (
            <SelectItem key={p.id} value={p.id}>
              {p.full_name}
              {!p.is_active && ' (deactivated)'}
            </SelectItem>
          ))}
      </SelectContent>
    </Select>
  );

  const header = (
    <>
      <BackLink to={`/admin/plans?month=${month}`}>All plans</BackLink>
      <PageHeader
        leading={
          person && (
            <span aria-hidden>
              <UserAvatar name={person.full_name} src={person.avatar_url} className="h-12 w-12 text-base" />
            </span>
          )
        }
        eyebrow={formatMonth(month)}
        title={person ? `${person.full_name}’s plan` : 'Plan'}
        description={plan.data ? <PlanStatusLine plan={plan.data} name={firstName} /> : undefined}
      />
      <div className="-mt-2 mb-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        {crewSwitcher}
        <MonthPicker value={month} onChange={onMonthChange} className="self-start" />
      </div>
    </>
  );

  if (plan.isPending || crew.isPending) {
    return (
      <>
        {header}
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="mt-6 h-72 rounded-xl" />
      </>
    );
  }
  if (plan.isError) return <ErrorState error={plan.error} onRetry={() => void plan.refetch()} />;
  if (person && !person.is_active && !plan.data) {
    return (
      <>
        {header}
        <EmptyState icon={EyeOff} title={`${person.full_name} is deactivated`} description="Reactivate them from their profile to plan new work." />
      </>
    );
  }

  if (!plan.data) {
    return (
      <>
        {header}
        <EmptyState
          icon={FilePlus2}
          title={`No plan for ${formatMonth(month)} yet`}
          description={`Start a draft. ${firstName} won’t see anything until you publish it.`}
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              {anyOtherMonth && (
                <Button variant="secondary" onClick={() => setCopying(true)}>
                  <Copy /> {prevHasTasks ? `Copy ${formatMonth(prevMonth, 'MMMM')}’s plan` : 'Copy a previous plan'}
                </Button>
              )}
              <Button
                loading={ensure.isPending}
                onClick={() =>
                  ensure.mutate(
                    { videographerId, month },
                    {
                      onSuccess: () => setTaskDialog({}),
                      onError: (e) => toast.error(friendlyError(e)),
                    },
                  )
                }
              >
                <Plus /> Start from scratch
              </Button>
            </div>
          }
        />
        <CopyPlanDialog open={copying} onOpenChange={setCopying} videographerId={videographerId} name={firstName} month={month} />
      </>
    );
  }

  const p = plan.data;

  return (
    <>
      {header}

      {p.status === 'draft' && (
        <div className="mb-6 flex flex-col gap-3 rounded-xl border border-warning/30 bg-warning/8 p-4 sm:flex-row sm:items-center">
          <EyeOff className="hidden h-5 w-5 shrink-0 text-warning-text sm:block" aria-hidden />
          <div className="flex-1 text-sm">
            <p className="font-medium text-warning-text">Draft: only admins can see this plan.</p>
            <p className="text-muted-foreground">Publishing notifies {firstName} and shows the tasks in their app.</p>
          </div>
          <Button onClick={() => setConfirmPublish(true)} disabled={totals.count === 0} title={totals.count === 0 ? 'Add a task first' : undefined}>
            <Send /> Publish plan
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Tasks</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="tabular">{totals.count}</span> {totals.count === 1 ? 'task' : 'tasks'} · <span className="tabular">{totals.points}</span> pts available
                {totals.approved > 0 && <> · <span className="tabular">{totals.approved}</span> approved</>}
                {totals.cancelled > 0 && <> · <span className="tabular">{totals.cancelled}</span> cancelled</>}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setCopying(true)} disabled={!anyOtherMonth} title={anyOtherMonth ? undefined : 'No other months to copy from'}>
                <Copy /> <span className="hidden sm:inline">Copy from…</span>
                <span className="sm:hidden">Copy</span>
              </Button>
              <Button onClick={() => setTaskDialog({})}>
                <Plus /> Add task
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {tasks.isPending ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }, (_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : tasks.isError ? (
              <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
            ) : tasks.data.length === 0 ? (
              <EmptyState
                icon={ListPlus}
                title="No tasks yet"
                description="Add the shoots and edits planned for this month."
                className="py-10"
                action={
                  <Button onClick={() => setTaskDialog({})}>
                    <Plus /> Add the first task
                  </Button>
                }
              />
            ) : (
              <TaskList tasks={tasks.data} onEdit={(task) => setTaskDialog({ task })} />
            )}
          </CardContent>
        </Card>

        <PlanNotesCard plan={p} />
      </div>

      <TaskFormDialog
        open={taskDialog !== null}
        onOpenChange={(o) => !o && setTaskDialog(null)}
        month={month}
        videographerId={videographerId}
        planStatus={p.status}
        task={taskDialog?.task}
      />
      <CopyPlanDialog open={copying} onOpenChange={setCopying} videographerId={videographerId} name={firstName} month={month} />
      <ConfirmDialog
        open={confirmPublish}
        onOpenChange={setConfirmPublish}
        title={`Publish ${formatMonth(month)} for ${firstName}?`}
        description={`${firstName} gets a notification and can start on all ${totals.count} ${totals.count === 1 ? 'task' : 'tasks'} right away. Tasks you add afterwards are notified one by one.`}
        confirmLabel="Publish"
        loading={publish.isPending}
        onConfirm={() =>
          publish.mutate(p.id, {
            onSuccess: () => {
              toast.success(`Plan published, ${firstName} has been notified`);
              setConfirmPublish(false);
            },
            onError: (e) => toast.error(friendlyError(e)),
          })
        }
      />
    </>
  );
}

function PlanStatusLine({ plan, name }: { plan: MonthlyPlan; name: string }) {
  return (
    <span className="flex flex-wrap items-center gap-2">
      <PlanStatusChip status={plan.status} />
      <span>
        {plan.status === 'published' && plan.published_at
          ? `Visible to ${name} since ${formatDateTime(plan.published_at, 'd MMM, h:mm a')}`
          : `Hidden from ${name} until published`}
      </span>
    </span>
  );
}

function PlanNotesCard({ plan }: { plan: MonthlyPlan }) {
  const save = useSavePlanNotes();
  const [summary, setSummary] = useState(plan.summary ?? '');
  const [goals, setGoals] = useState(plan.goals ?? '');

  useEffect(() => {
    setSummary(plan.summary ?? '');
    setGoals(plan.goals ?? '');
  }, [plan.id, plan.summary, plan.goals]);

  const dirty = summary !== (plan.summary ?? '') || goals !== (plan.goals ?? '');

  return (
    <Card className="h-fit">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Target className="h-4 w-4 text-violet-text" aria-hidden /> Focus for the month
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              { id: plan.id, summary, goals },
              { onSuccess: () => toast.success('Plan notes saved'), onError: (err) => toast.error(friendlyError(err)) },
            );
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="plan-summary">Summary</Label>
            <Textarea id="plan-summary" rows={3} maxLength={4000} value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="What this month is about" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="plan-goals">Goals</Label>
            <Textarea id="plan-goals" rows={4} maxLength={4000} value={goals} onChange={(e) => setGoals(e.target.value)} placeholder={'One per line, e.g.\n• 4 surgery films for Harbourview\n• Try vertical-first edits'} />
          </div>
          <Button type="submit" variant="secondary" className="w-full" disabled={!dirty} loading={save.isPending}>
            Save notes
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
