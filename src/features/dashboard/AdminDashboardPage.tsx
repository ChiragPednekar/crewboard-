import type { ReactNode } from 'react';
import { Activity, AlarmClock, ArrowRight, Award, CalendarRange, CheckCircle2, ClipboardCheck, Clock, Send, Trophy } from 'lucide-react';
import { Link } from 'react-router';

import { PlanStatusChip } from '@/components/Chips';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { ActivityFeed } from '@/features/activity/ActivityFeed';
import { useMonthAssessments } from '@/features/assessments/api';
import { useTeamStats } from '@/features/leaderboard/api';
import { useCrewOptions } from '@/features/lookups/api';
import { useReviewQueue } from '@/features/review/api';
import { emptySummary, useCrewMonth } from '@/features/videographers/api';
import { useMonthParam } from '@/hooks/useSearchParamState';
import { formatMonth, monthKey, shiftMonth } from '@/lib/dates';
import { cn } from '@/lib/utils';

export default function AdminDashboardPage() {
  const [month, setMonth] = useMonthParam();
  const crew = useCrewOptions();
  const stats = useCrewMonth(month);
  const team = useTeamStats(month);
  const queue = useReviewQueue();
  const prevMonth = shiftMonth(month, -1);
  const prevAssessments = useMonthAssessments(prevMonth);
  const prevStats = useCrewMonth(prevMonth);

  const people = (crew.data ?? []).filter((p) => p.is_active || stats.data?.has(p.id));
  const rows = people.map((p) => ({ person: p, s: stats.data?.get(p.id) ?? emptySummary() }));
  const live = rows.filter((r) => r.s.planStatus === 'published');
  const sum = (f: (s: ReturnType<typeof emptySummary>) => number) => live.reduce((n, r) => n + f(r.s), 0);
  const totals = {
    tasks: sum((s) => s.total),
    approved: sum((s) => s.approved),
    overdue: sum((s) => s.overdue),
    points: sum((s) => s.points),
    maxPoints: sum((s) => s.maxPoints),
  };
  const drafts = rows.filter((r) => r.s.planStatus === 'draft').length;
  const noPlan = rows.filter((r) => r.person.is_active && !r.s.planStatus).length;
  const prevToAssess = [...(prevStats.data?.entries() ?? [])].filter(([, s]) => s.planStatus === 'published').length;
  const prevPublished = (prevAssessments.data ?? []).filter((a) => a.status === 'published').length;
  const isCurrent = month === monthKey();
  const loading = crew.isPending || stats.isPending;

  const attention: { key: string; icon: typeof Send; tone: string; text: ReactNode; to: string; cta: string }[] = [];
  if ((queue.data?.length ?? 0) > 0)
    attention.push({ key: 'review', icon: ClipboardCheck, tone: 'text-info-text', text: <><b>{queue.data!.length}</b> submissions waiting for review</>, to: '/admin/review', cta: 'Review' });
  if (totals.overdue > 0)
    attention.push({ key: 'overdue', icon: AlarmClock, tone: 'text-warning-text', text: <><b>{totals.overdue}</b> tasks overdue in {formatMonth(month, 'MMMM')}</>, to: `/admin/videographers?month=${month}`, cta: 'See crew' });
  if (drafts > 0)
    attention.push({ key: 'drafts', icon: Send, tone: 'text-warning-text', text: <><b>{drafts}</b> {drafts === 1 ? 'plan is' : 'plans are'} still a draft — the crew can’t see them</>, to: `/admin/plans?month=${month}`, cta: 'Publish' });
  if (noPlan > 0)
    attention.push({ key: 'noplan', icon: CalendarRange, tone: 'text-muted-foreground', text: <><b>{noPlan}</b> without a plan for {formatMonth(month, 'MMMM')}</>, to: `/admin/plans?month=${month}`, cta: 'Plan' });
  if (isCurrent && prevToAssess > prevPublished)
    attention.push({
      key: 'assess',
      icon: Award,
      tone: 'text-primary-text',
      text: <>{formatMonth(prevMonth)} assessments: <b>{prevPublished}</b> of {prevToAssess} published</>,
      to: `/admin/assessments?month=${prevMonth}`,
      cta: 'Assess',
    });

  return (
    <>
      <PageHeader title="Dashboard" description={`${formatMonth(month)} at a glance.`} actions={<MonthPicker value={month} onChange={setMonth} />} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi icon={CalendarRange} label="Tasks planned" value={loading ? null : totals.tasks} hint="in published plans" />
        <Kpi icon={CheckCircle2} label="Approved" value={loading ? null : totals.approved} hint={totals.tasks ? `${Math.round((totals.approved / totals.tasks) * 100)}% done` : undefined} tone="text-success-text" />
        <Kpi icon={ClipboardCheck} label="To review" value={queue.isPending ? null : (queue.data?.length ?? 0)} hint="all months" tone="text-info-text" to="/admin/review" />
        <Kpi icon={Clock} label="On time" value={team.isPending ? null : `${Math.round(Number(team.data?.on_time_pct ?? 0) * 100)}%`} hint="first submissions" tone="text-violet-text" />
        <Kpi icon={Trophy} label="Points awarded" value={loading ? null : totals.points} hint={`of ${totals.maxPoints} possible`} tone="text-primary-text" className="col-span-2 lg:col-span-1" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          {attention.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Needs your attention</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {attention.map((a) => (
                    <li key={a.key} className="flex items-center gap-3 py-3">
                      <a.icon className={cn('h-4 w-4 shrink-0', a.tone)} aria-hidden />
                      <p className="flex-1 text-sm [&_b]:tabular [&_b]:font-semibold">{a.text}</p>
                      <Button asChild variant="ghost" size="sm">
                        <Link to={a.to}>
                          {a.cta} <ArrowRight />
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle>Crew progress</CardTitle>
              <Button asChild variant="ghost" size="sm">
                <Link to={`/admin/videographers?month=${month}`}>
                  All crew <ArrowRight />
                </Link>
              </Button>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-48" />
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No videographers yet.</p>
              ) : (
                <ul className="space-y-1">
                  {rows.map(({ person: p, s }) => {
                    const pct = s.total ? Math.round((s.approved / s.total) * 100) : 0;
                    return (
                      <li key={p.id}>
                        <Link to={`/admin/videographers/${p.id}?month=${month}`} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 rounded-lg px-2 py-2.5 hover:bg-surface-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto]">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <UserAvatar name={p.full_name} src={p.avatar_url} className="h-8 w-8 text-xs" />
                            <span className="truncate text-sm font-medium">{p.full_name}</span>
                          </span>
                          <span className="col-span-2 row-start-2 flex items-center gap-3 sm:col-span-1 sm:row-start-auto">
                            {s.planStatus === 'published' ? (
                              <>
                                <Progress value={pct} className="h-1.5 flex-1" aria-label={`${p.full_name}: ${pct}% approved`} />
                                <span className="tabular w-14 text-right text-xs text-muted-foreground">
                                  {s.approved}/{s.total}
                                </span>
                              </>
                            ) : (
                              <PlanStatusChip status={s.planStatus} />
                            )}
                          </span>
                          <span className="tabular flex items-center gap-3 text-xs">
                            {s.overdue > 0 && <span className="text-warning-text">{s.overdue} overdue</span>}
                            <span>
                              <span className="font-semibold text-primary-text">{s.points}</span>
                              <span className="text-muted-foreground"> pts</span>
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-violet-text" aria-hidden /> Recent activity
            </CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/activity">
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <ActivityFeed limit={10} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  tone,
  to,
  className,
}: {
  icon: typeof Clock;
  label: string;
  value: number | string | null;
  hint?: string;
  tone?: string;
  to?: string;
  className?: string;
}) {
  const body = (
    <>
      <Icon className={cn('h-4 w-4 text-muted-foreground', tone)} aria-hidden />
      {value === null ? <Skeleton className="mt-3 h-8 w-16" /> : <p className="tabular mt-3 font-display text-3xl font-semibold">{value}</p>}
      <p className="text-sm">{label}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const cls = cn('rounded-xl border border-border bg-surface p-4 shadow-soft', to && 'transition-[border-color] hover:border-primary/40', className);
  return to ? (
    <Link to={to} className={cls}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
