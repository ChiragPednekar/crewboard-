import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { AlarmClock, ArrowRight, Building, CalendarClock, CheckCircle2, Clapperboard, Hourglass, Phone, RotateCcw, Target } from 'lucide-react';
import { Link } from 'react-router';

import { ClientLogo } from '@/components/ClientLogo';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile } from '@/features/auth/AuthProvider';
import { useMonthParam } from '@/hooks/useSearchParamState';
import { dueLabel, formatMonth, isOverdue, monthKey } from '@/lib/dates';
import type { TaskStatus } from '@/lib/supabase';
import { cn } from '@/lib/utils';

import { type CrewTask, useMyClients, useMyMonth } from './api';
import { CrewTaskCard } from './CrewTaskCard';

const GROUPS: { key: string; title: string; statuses: TaskStatus[]; hint?: string }[] = [
  { key: 'changes', title: 'Needs changes', statuses: ['revision_requested'], hint: 'Your admin asked for a new version.' },
  { key: 'todo', title: 'To do', statuses: ['assigned', 'in_progress'] },
  { key: 'review', title: 'Waiting for review', statuses: ['submitted'] },
  { key: 'done', title: 'Approved', statuses: ['approved'] },
  { key: 'cancelled', title: 'Cancelled', statuses: ['cancelled'] },
];

export default function CrewDashboardPage() {
  const profile = useProfile();
  const [month, setMonth] = useMonthParam();
  const data = useMyMonth(month);
  const firstName = profile.full_name.split(' ')[0];
  const isCurrent = month === monthKey();

  const stats = useMemo(() => {
    const live = (data.data?.tasks ?? []).filter((t) => t.status !== 'cancelled');
    const open = live.filter((t) => ['assigned', 'in_progress', 'revision_requested'].includes(t.status));
    // the most pressing open task: revisions first, then the earliest due date
    const next = [...open].sort(
      (a, b) =>
        Number(b.status === 'revision_requested') - Number(a.status === 'revision_requested') || a.due_date.localeCompare(b.due_date),
    )[0];
    return {
      total: live.length,
      open: open.length,
      review: live.filter((t) => t.status === 'submitted').length,
      changes: live.filter((t) => t.status === 'revision_requested').length,
      approved: live.filter((t) => t.status === 'approved').length,
      overdue: live.filter((t) => isOverdue(t.due_date, t.status)).length,
      points: live.reduce((s, t) => s + (t.status === 'approved' ? (t.points_awarded ?? 0) : 0), 0),
      maxPoints: live.reduce((s, t) => s + t.max_points, 0),
      next,
    };
  }, [data.data]);

  return (
    <>
      <PageHeader
        eyebrow={isCurrent ? `Hi ${firstName}` : formatMonth(month)}
        title={isCurrent ? 'Your month' : `${formatMonth(month, 'MMMM')} plan`}
        description={isCurrent ? `Everything planned for you in ${formatMonth(month)}.` : undefined}
        actions={<MonthPicker value={month} onChange={setMonth} />}
      />

      {data.isPending ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-28 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : data.isError ? (
        <ErrorState error={data.error} onRetry={() => void data.refetch()} />
      ) : !data.data.plan ? (
        <EmptyState
          icon={Clapperboard}
          title={`Your ${formatMonth(month, 'MMMM')} plan isn’t out yet`}
          description="When your admin publishes it, your shoots appear here and you’ll get a notification."
          action={
            !isCurrent ? (
              <Button variant="secondary" onClick={() => setMonth(monthKey())}>
                Back to this month
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="min-w-0 space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile icon={CalendarClock} label="To do" value={stats.open} tone="violet" />
              <StatTile icon={Hourglass} label="Waiting for review" value={stats.review} tone="info" />
              <StatTile icon={RotateCcw} label="Needs changes" value={stats.changes} tone={stats.changes ? 'danger' : undefined} />
              <StatTile icon={CheckCircle2} label="Approved" value={`${stats.approved}/${stats.total}`} tone="success" />
            </div>

            {stats.next && <UpNext task={stats.next} />}

            {data.data.tasks.length === 0 ? (
              <EmptyState icon={Clapperboard} title="No tasks in this plan" description="Your admin hasn’t added any tasks yet." />
            ) : (
              GROUPS.map((g) => {
                const tasks = data.data.tasks.filter((t) => g.statuses.includes(t.status));
                if (tasks.length === 0) return null;
                return (
                  <section key={g.key} aria-labelledby={`group-${g.key}`}>
                    <div className="mb-3 flex items-baseline gap-2">
                      <h2 id={`group-${g.key}`} className="font-display text-base font-semibold">
                        {g.title}
                      </h2>
                      <span className="tabular text-sm text-muted-foreground">{tasks.length}</span>
                      {g.hint && <span className="text-xs text-muted-foreground">· {g.hint}</span>}
                    </div>
                    <ul className="space-y-2.5">
                      {tasks.map((t, i) => (
                        <motion.li key={t.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.03 }}>
                          <CrewTaskCard task={t} />
                        </motion.li>
                      ))}
                    </ul>
                  </section>
                );
              })
            )}
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Points this month</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="tabular font-display text-4xl font-semibold">
                  <span className="text-primary-text">{stats.points}</span>
                  <span className="text-lg text-muted-foreground"> / {stats.maxPoints}</span>
                </p>
                <Progress value={stats.maxPoints ? (stats.points / stats.maxPoints) * 100 : 0} className="mt-3" aria-label="Points earned" />
                <p className="mt-2 text-xs text-muted-foreground">
                  From approved work. Your monthly score also counts completion and on-time delivery.
                </p>
                {stats.overdue > 0 && (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-warning-text">
                    <AlarmClock className="h-4 w-4" aria-hidden /> {stats.overdue} overdue
                  </p>
                )}
              </CardContent>
            </Card>

            {(data.data.plan.summary || data.data.plan.goals) && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-4 w-4 text-violet-text" aria-hidden /> This month’s focus
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {data.data.plan.summary && <p className="whitespace-pre-line">{data.data.plan.summary}</p>}
                  {data.data.plan.goals && <p className="whitespace-pre-line text-muted-foreground">{data.data.plan.goals}</p>}
                </CardContent>
              </Card>
            )}

            <MyClientsCard />
          </aside>
        </div>
      )}
    </>
  );
}

function StatTile({ icon: Icon, label, value, tone }: { icon: typeof CalendarClock; label: string; value: number | string; tone?: 'violet' | 'info' | 'danger' | 'success' }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4 shadow-soft">
      <Icon
        className={cn(
          'h-4 w-4 text-muted-foreground',
          tone === 'violet' && 'text-violet-text',
          tone === 'info' && 'text-info-text',
          tone === 'danger' && 'text-danger-text',
          tone === 'success' && 'text-success-text',
        )}
        aria-hidden
      />
      <p className="tabular mt-3 font-display text-2xl font-semibold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function UpNext({ task }: { task: CrewTask }) {
  const overdue = isOverdue(task.due_date, task.status);
  const revision = task.status === 'revision_requested';
  return (
    <Link
      to={`/me/tasks/${task.id}`}
      className={cn(
        'studio-glow group flex flex-col gap-4 rounded-xl border p-5 transition-shadow hover:shadow-glow sm:flex-row sm:items-center',
        revision ? 'border-danger/40' : 'border-primary/30',
      )}
    >
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs font-medium uppercase tracking-[0.14em]', revision ? 'text-danger-text' : 'text-primary-text')}>
          {revision ? 'Changes requested' : 'Up next'}
        </p>
        <p className="mt-1 truncate font-display text-lg font-semibold">{task.title}</p>
        <p className={cn('mt-0.5 text-sm', overdue ? 'text-warning-text' : 'text-muted-foreground')}>
          {task.client?.name} · {dueLabel(task.due_date)}
        </p>
      </div>
      <span className={cn('inline-flex items-center gap-1.5 text-sm font-medium', revision ? 'text-danger-text' : 'text-primary-text')}>
        {revision ? 'See feedback' : task.status === 'assigned' ? 'Open brief' : 'Continue'}
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </span>
    </Link>
  );
}

function MyClientsCard() {
  const clients = useMyClients();
  if (!clients.data || clients.data.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Building className="h-4 w-4 text-violet-text" aria-hidden /> My clients
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3">
          {clients.data.map((c) => (
            <li key={c.id} className="flex items-center gap-3">
              <ClientLogo name={c.name} src={c.logo_url} className="h-9 w-9 rounded-md text-xs" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                {c.contact_name && <p className="truncate text-xs text-muted-foreground">{c.contact_name}</p>}
              </div>
              {c.contact_phone && (
                <Button asChild variant="ghost" size="icon-sm" aria-label={`Call ${c.contact_name ?? c.name}`}>
                  <a href={`tel:${c.contact_phone.replace(/[^0-9+]/g, '')}`}>
                    <Phone />
                  </a>
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
