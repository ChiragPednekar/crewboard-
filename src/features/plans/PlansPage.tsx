import { useState } from 'react';
import { ArrowRight, CalendarRange, Send, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { PlanStatusChip } from '@/components/Chips';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { useCrewOptions } from '@/features/lookups/api';
import { TaskFormDialog } from '@/features/tasks/TaskFormDialog';
import { emptySummary, useCrewMonth } from '@/features/videographers/api';
import { useMonthParam } from '@/hooks/useSearchParamState';

import { PlanBuilder } from './PlanBuilder';

/** /admin/plans?month=YYYY-MM[&vid=…] — month overview, or one videographer's builder. */
export default function PlansPage() {
  const [params, setParams] = useSearchParams();
  const [month, setMonth] = useMonthParam();
  const vid = params.get('vid');

  if (vid) {
    return (
      <PlanBuilder
        videographerId={vid}
        month={month}
        onMonthChange={setMonth}
        onVideographerChange={(id) =>
          setParams((prev) => {
            const next = new URLSearchParams(prev);
            next.set('vid', id);
            return next;
          })
        }
      />
    );
  }
  return <PlansOverview month={month} onMonthChange={setMonth} />;
}

function PlansOverview({ month, onMonthChange }: { month: string; onMonthChange: (m: string) => void }) {
  const crew = useCrewOptions();
  const stats = useCrewMonth(month);
  const [assigning, setAssigning] = useState(false);

  // Active people, plus anyone deactivated who still has work in this month.
  const people = (crew.data ?? []).filter((p) => p.is_active || stats.data?.has(p.id));
  const summaries = people.map((p) => ({ person: p, s: stats.data?.get(p.id) ?? emptySummary() }));
  const drafts = summaries.filter(({ s }) => s.planStatus === 'draft').length;
  const missing = summaries.filter(({ person, s }) => person.is_active && !s.planStatus).length;

  return (
    <>
      <PageHeader
        title="Monthly plans"
        description="Plan each videographer’s month, then publish it so they can start."
        actions={
          <>
            <MonthPicker value={month} onChange={onMonthChange} />
            <Button variant="secondary" onClick={() => setAssigning(true)}>
              <Users /> Task for several people
            </Button>
          </>
        }
      />

      {!stats.isPending && people.length > 0 && (drafts > 0 || missing > 0) && (
        <p className="mb-5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground" aria-live="polite">
          {missing > 0 && (
            <span>
              <span className="tabular font-medium text-foreground">{missing}</span> without a plan
            </span>
          )}
          {drafts > 0 && (
            <span className="inline-flex items-center gap-1">
              <Send className="h-3.5 w-3.5 text-warning-text" aria-hidden />
              <span className="tabular font-medium text-foreground">{drafts}</span> {drafts === 1 ? 'draft' : 'drafts'} waiting to be published
            </span>
          )}
        </p>
      )}

      {crew.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : crew.isError ? (
        <ErrorState error={crew.error} onRetry={() => void crew.refetch()} />
      ) : people.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="No videographers to plan for"
          description="Add your crew first, then plan their month here."
          action={
            <Button asChild>
              <Link to="/admin/videographers">Go to videographers</Link>
            </Button>
          }
        />
      ) : (
        <ul className="space-y-3">
          {summaries.map(({ person: p, s }) => (
            <li key={p.id}>
              <Card className="group relative flex flex-col gap-4 p-4 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-lift sm:flex-row sm:items-center sm:p-5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <UserAvatar name={p.full_name} src={p.avatar_url} className="h-11 w-11" />
                  <div className="min-w-0">
                    <h2 className="truncate font-medium">
                      <Link
                        to={`/admin/plans?month=${month}&vid=${p.id}`}
                        className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none"
                      >
                        {p.full_name}
                      </Link>
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      {stats.isPending ? <Skeleton className="h-6 w-24 rounded-full" /> : <PlanStatusChip status={s.planStatus} />}
                      {!p.is_active && <span className="text-xs">Deactivated</span>}
                    </div>
                  </div>
                </div>
                <dl className="grid grid-cols-3 gap-4 text-sm sm:w-80">
                  <Stat label="Tasks" value={s.total} />
                  <Stat label="Approved" value={s.approved} />
                  <Stat label="Points" value={`${s.points}/${s.maxPoints}`} />
                </dl>
                <span className="hidden items-center gap-1 text-sm font-medium text-primary-text sm:flex" aria-hidden>
                  {s.planStatus ? 'Open' : 'Start'} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <TaskFormDialog open={assigning} onOpenChange={setAssigning} month={month} />
    </>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular font-display text-base font-semibold">{value}</dd>
    </div>
  );
}
