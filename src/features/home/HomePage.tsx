import { useCallback, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Building, CheckCircle2, Clock, Quote, Radio, Sparkles, Trophy, Users } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';

import { CountUp } from '@/components/CountUp';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth, useProfile } from '@/features/auth/AuthProvider';
import { useFeaturedWork, useIsMonthFinal, useLeaderboard, useTeamStats, useTopPerformer } from '@/features/leaderboard/api';
import { formatMonth, monthKey, shiftMonth } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { BestWork } from './BestWork';
import { CrewsChoice, YearlyStandings } from '@/features/motivation/components';
import { Segmented } from '@/components/Toolbar';
import { Podium, StandingsChart } from './Standings';

/**
 * Month shown on the home page: `?month=` if given, otherwise last month when its results
 * are final (every assessment published), otherwise this month's live standings.
 */
function useHomeMonth(): { month: string | null; setMonth: (m: string) => void } {
  const [params, setParams] = useSearchParams();
  const raw = params.get('month');
  const explicit = raw && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : null;
  const current = monthKey();
  const prev = shiftMonth(current, -1);
  const prevFinal = useIsMonthFinal(prev);
  const month = explicit ?? (prevFinal.isPending ? null : prevFinal.data ? prev : current);
  const setMonth = useCallback(
    (m: string) =>
      setParams(
        (p) => {
          const next = new URLSearchParams(p);
          next.set('month', m);
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { month, setMonth };
}

export default function HomePage() {
  const { month, setMonth } = useHomeMonth();
  if (!month) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }
  return <HomeForMonth month={month} setMonth={setMonth} />;
}

function HomeForMonth({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const [range, setRange] = useState<'month' | 'year'>('month');
  const profile = useProfile();
  const { isAdmin } = useAuth();
  const board = useLeaderboard(month);
  const top = useTopPerformer(month);
  const featured = useFeaturedWork(month);
  const stats = useTeamStats(month);

  const rows = board.data ?? [];
  const provisional = rows[0]?.is_provisional ?? true;
  const current = monthKey();
  const isCurrent = month === current;

  return (
    <>
      <PageHeader
        eyebrow={
          provisional ? (
            <span className="inline-flex items-center gap-1.5">
              <Radio className="h-3.5 w-3.5 animate-pulse" aria-hidden /> Live standings · provisional
            </span>
          ) : (
            'Final results'
          )
        }
        title={`${formatMonth(month)} leaderboard`}
        description={
          provisional
            ? 'Ranked by points from approved work so far. Final scores arrive when assessments are published.'
            : 'Scores out of 100 from published assessments: points, completion, punctuality and the admin’s review.'
        }
        actions={
          <>
            {!isCurrent && (
              <Button variant="ghost" onClick={() => setMonth(current)}>
                <Radio /> This month
              </Button>
            )}
            <MonthPicker value={month} onChange={setMonth} />
          </>
        }
      />

      {board.isError ? (
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      ) : board.isPending ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-72 rounded-xl" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Trophy}
          title={`No results for ${formatMonth(month)} yet`}
          description={isCurrent ? 'Standings appear once plans are published and work starts getting approved.' : 'Nothing was planned or published for this month.'}
          action={
            !isCurrent ? (
              <Button variant="secondary" onClick={() => setMonth(current)}>
                See this month
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <TopPerformerCard data={top.data ?? null} loading={top.isPending} month={month} provisional={provisional} meId={profile.id} />
            <Card>
              <CardContent className="flex h-full flex-col justify-end p-5 pt-10 sm:p-6 sm:pt-12">
                <Podium rows={rows} provisional={provisional} meId={profile.id} />
              </CardContent>
            </Card>
          </div>

          <TeamStatsRow stats={stats.data ?? null} loading={stats.isPending} />

          <section aria-labelledby="best-work-heading">
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 id="best-work-heading" className="flex items-center gap-2 font-display text-xl font-semibold">
                <Sparkles className="h-5 w-5 text-gold-text" aria-hidden /> Best work
              </h2>
              {isAdmin && (
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/admin/featured?month=${month}`}>
                    {featured.data?.length ? 'Change picks' : 'Pick best work'} <ArrowRight />
                  </Link>
                </Button>
              )}
            </div>
            {featured.isPending ? (
              <Skeleton className="aspect-[21/9] rounded-xl" />
            ) : featured.data && featured.data.length > 0 ? (
              <BestWork items={featured.data} month={month} />
            ) : (
              <EmptyState
                icon={Sparkles}
                title="No best work picked yet"
                description={isAdmin ? 'Choose the standout pieces of the month to showcase them here.' : `Your admin picks the standout work of ${formatMonth(month, 'MMMM')}.`}
                className="py-10"
              />
            )}
          </section>

          <CrewsChoice month={month} />

          <Card>
            <CardHeader className="flex-row flex-wrap items-center justify-between gap-3 space-y-0 pb-2">
              <CardTitle>{range === 'month' ? 'Full standings' : `${month.slice(0, 4)} so far`}</CardTitle>
              <Segmented
                label="Standings period"
                value={range}
                onChange={setRange}
                options={[
                  { value: 'month', label: 'Month' },
                  { value: 'year', label: 'Year' },
                ]}
              />
            </CardHeader>
            <CardContent>
              {range === 'month' ? (
                <StandingsChart rows={rows} provisional={provisional} meId={profile.id} />
              ) : (
                <YearlyStandings year={Number(month.slice(0, 4))} meId={profile.id} />
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function TopPerformerCard({
  data,
  loading,
  month,
  provisional,
  meId,
}: {
  data: ReturnType<typeof useTopPerformer>['data'] | null;
  loading: boolean;
  month: string;
  provisional: boolean;
  meId: string;
}) {
  if (loading) return <Skeleton className="h-72 rounded-xl" />;
  if (!data) {
    return (
      <Card className="grid place-items-center p-8 text-center">
        <div>
          <Trophy className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-3 font-display font-semibold">No leader yet</p>
          <p className="mt-1 text-sm text-muted-foreground">The first approved work of the month takes the lead.</p>
        </div>
      </Card>
    );
  }
  const me = data.videographer_id === meId;
  return (
    <motion.section
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className="relative overflow-hidden rounded-xl border border-gold/30 bg-surface p-6 shadow-lift sm:p-8"
      aria-labelledby="top-performer"
    >
      <div
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gold/15 blur-3xl"
        aria-hidden
      />
      <div className="pointer-events-none absolute -bottom-28 -left-16 h-64 w-64 rounded-full bg-violet/15 blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center lg:flex-col lg:items-start xl:flex-row xl:items-center">
        <UserAvatar name={data.full_name} src={data.avatar_url} ring="gold" className="h-20 w-20 text-2xl sm:h-24 sm:w-24 sm:text-3xl" />
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-gold-text">
            <Trophy className="h-3.5 w-3.5" aria-hidden /> {provisional ? 'Leading so far' : `Top performer · ${formatMonth(month)}`}
          </p>
          <h2 id="top-performer" className="mt-1 break-words font-display text-3xl font-semibold sm:text-4xl">
            {data.full_name}
            {me && <span className="ml-2 align-middle text-base font-medium text-primary-text">that’s you!</span>}
          </h2>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3 text-muted-foreground">
            <span className="tabular font-display text-4xl font-semibold text-primary-text">
              <CountUp value={Number(data.total_score)} decimals={provisional ? 0 : 2} />
            </span>
            <span>{provisional ? 'points' : 'out of 100'}</span>
            <span className="text-sm">
              · {data.tasks_completed}/{data.tasks_assigned} tasks done
            </span>
          </p>
        </div>
      </div>
      {data.public_note && (
        <blockquote className="relative mt-6 flex gap-3 rounded-lg bg-surface-2/60 p-4 text-sm leading-relaxed">
          <Quote className="h-4 w-4 shrink-0 text-gold-text" aria-hidden />
          <span>{data.public_note}</span>
        </blockquote>
      )}
    </motion.section>
  );
}

function TeamStatsRow({ stats, loading }: { stats: ReturnType<typeof useTeamStats>['data'] | null; loading: boolean }) {
  const items = [
    { icon: CheckCircle2, label: 'Videos delivered', value: stats?.videos_delivered ?? 0, tone: 'text-success-text' },
    { icon: Building, label: 'Clients served', value: stats?.clients_served ?? 0, tone: 'text-violet-text' },
    { icon: Clock, label: 'On time', value: Math.round(Number(stats?.on_time_pct ?? 0) * 100), suffix: '%', tone: 'text-info-text' },
    { icon: Users, label: 'Crew on the board', value: stats?.crew_count ?? 0, tone: 'text-primary-text' },
  ];
  return (
    <section aria-label="Team stats" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map((s) => (
        <div key={s.label} className="rounded-xl border border-border bg-surface p-4 shadow-soft">
          <s.icon className={cn('h-4 w-4', s.tone)} aria-hidden />
          {loading ? (
            <Skeleton className="mt-3 h-8 w-16" />
          ) : (
            <p className="tabular mt-3 font-display text-3xl font-semibold">
              <CountUp value={s.value} />
              {s.suffix}
            </p>
          )}
          <p className="text-sm text-muted-foreground">{s.label}</p>
        </div>
      ))}
    </section>
  );
}
