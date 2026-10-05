import { useMemo } from 'react';
import { Award, Gift, Medal, MessageSquareQuote, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { BadgesCard } from '@/features/motivation/components';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useProfile } from '@/features/auth/AuthProvider';
import { type Assessment, useMyAssessments } from '@/features/assessments/api';
import { ScoreBreakdown } from '@/features/assessments/ScoreBreakdown';
import { useLeaderboard } from '@/features/leaderboard/api';
import { useMonthParam } from '@/hooks/useSearchParamState';
import { formatDateTime, formatMonth, toMonthKey } from '@/lib/dates';

import { useMyMonth } from './api';

export default function PointsPage() {
  const profile = useProfile();
  const [month, setMonth] = useMonthParam();
  const mine = useMyAssessments();
  const board = useLeaderboard(month);
  const work = useMyMonth(month);

  const published = (mine.data ?? []).filter((a) => a.status === 'published');
  const current = published.find((a) => toMonthKey(a.month) === month) ?? null;
  const me = board.data?.find((r) => r.videographer_id === profile.id);
  const provisional = board.data?.[0]?.is_provisional ?? true;

  const live = useMemo(() => {
    const tasks = (work.data?.tasks ?? []).filter((t) => t.status !== 'cancelled');
    return {
      points: tasks.reduce((s, t) => s + (t.status === 'approved' ? (t.points_awarded ?? 0) : 0), 0),
      max: tasks.reduce((s, t) => s + t.max_points, 0),
      approved: tasks.filter((t) => t.status === 'approved').length,
      total: tasks.length,
    };
  }, [work.data]);

  return (
    <>
      <PageHeader title="My points" description="Your monthly score, how it’s made, and how you’re trending." actions={<MonthPicker value={month} onChange={setMonth} />} />
      {profile && (
        <div className="mb-6">
          <BadgesCard videographerId={profile.id} title="Your badges" />
        </div>
      )}

      {mine.isError ? (
        <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
      ) : mine.isPending ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-6">
            {current ? (
              <PublishedCard a={current} rank={!provisional ? me?.rank : undefined} of={board.data?.length} />
            ) : (
              <Card className="studio-glow">
                <CardContent className="p-5 sm:p-6">
                  <p className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">Live this month · provisional</p>
                  <p className="tabular mt-1 font-display text-5xl font-semibold text-primary-text">
                    {live.points}
                    <span className="text-xl text-muted-foreground"> / {live.max} pts</span>
                  </p>
                  <Progress value={live.max ? (live.points / live.max) * 100 : 0} className="mt-4" aria-label="Points earned" />
                  <p className="mt-3 text-sm text-muted-foreground">
                    {live.approved} of {live.total} tasks approved.
                    {me && ` You’re #${me.rank} of ${board.data?.length} on points so far.`} Your score out of 100 appears here once your admin publishes the {formatMonth(month, 'MMMM')}{' '}
                    assessment.
                  </p>
                </CardContent>
              </Card>
            )}
            <TrendCard published={published} />
          </div>

          <aside className="space-y-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-4 w-4 text-violet-text" aria-hidden /> Past months
                </CardTitle>
              </CardHeader>
              <CardContent>
                {published.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No published assessments yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {[...published].reverse().map((a) => (
                      <li key={a.id}>
                        <Link to={`/me/points?month=${toMonthKey(a.month)}`} className="flex min-h-11 items-center justify-between py-2 text-sm hover:text-primary-text">
                          <span>{formatMonth(toMonthKey(a.month))}</span>
                          <span className="tabular font-display font-semibold">{Number(a.total_score).toFixed(2)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How scoring works</p>
                <p className="mt-2">
                  Points earned, tasks completed and on-time delivery (judged on your <em>first</em> submission) are calculated from your tasks. Your admin adds a 0–10
                  discretionary score and sometimes a bonus.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}

function PublishedCard({ a, rank, of }: { a: Assessment; rank?: number; of?: number }) {
  return (
    <>
      <Card className="studio-glow">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <ScoreBreakdown assessment={a} discretionary={a.discretionary_score === null ? null : Number(a.discretionary_score)} bonus={Number(a.bonus_points)} label={`${formatMonth(toMonthKey(a.month))} · final`} />
            </div>
            {rank && (
              <div className="shrink-0 rounded-xl border border-border bg-surface px-4 py-3 text-center">
                <Medal className={rank === 1 ? 'mx-auto h-5 w-5 text-gold-text' : rank === 2 ? 'mx-auto h-5 w-5 text-silver-text' : rank === 3 ? 'mx-auto h-5 w-5 text-bronze-text' : 'mx-auto h-5 w-5 text-muted-foreground'} aria-hidden />
                <p className="tabular mt-1 font-display text-2xl font-semibold">#{rank}</p>
                <p className="text-xs text-muted-foreground">of {of}</p>
              </div>
            )}
          </div>
          {a.published_at && <p className="mt-4 text-xs text-muted-foreground">Published {formatDateTime(a.published_at)}</p>}
        </CardContent>
      </Card>
      {(a.public_note || a.admin_remarks || Number(a.bonus_points) > 0) && (
        <Card>
          <CardContent className="space-y-4 p-5 sm:p-6">
            {a.public_note && (
              <div className="flex gap-3">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-text" aria-hidden />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Highlight (shown on the home page)</p>
                  <p className="mt-0.5 text-sm">{a.public_note}</p>
                </div>
              </div>
            )}
            {Number(a.bonus_points) > 0 && (
              <div className="flex gap-3">
                <Gift className="mt-0.5 h-4 w-4 shrink-0 text-success-text" aria-hidden />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Bonus +{Number(a.bonus_points)}</p>
                  <p className="mt-0.5 text-sm">{a.bonus_reason}</p>
                </div>
              </div>
            )}
            {a.admin_remarks && (
              <div className="flex gap-3">
                <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-violet-text" aria-hidden />
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Remarks from your admin (private)</p>
                  <p className="mt-0.5 whitespace-pre-line text-sm">{a.admin_remarks}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function TrendCard({ published }: { published: Assessment[] }) {
  const data = published.slice(-12).map((a) => ({ month: formatMonth(toMonthKey(a.month), 'MMM yy'), score: Number(a.total_score) }));
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-violet-text" aria-hidden /> Trend
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length < 2 ? (
          <EmptyState icon={TrendingUp} title="Not enough history yet" description="Your trend appears after two published months." className="py-8" />
        ) : (
          <>
            <div className="h-56" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 8, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <YAxis domain={[0, 100]} tickLine={false} axisLine={false} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }} />
                  <Tooltip
                    cursor={{ fill: 'hsl(var(--surface-2))' }}
                    contentStyle={{ background: 'hsl(var(--surface-2))', border: '1px solid hsl(var(--border))', borderRadius: 10, color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="score" radius={[6, 6, 0, 0]}>
                    {data.map((d, i) => (
                      <Cell key={d.month} fill={i === data.length - 1 ? 'hsl(var(--primary))' : 'hsl(var(--violet))'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <table className="sr-only">
              <caption>Monthly scores</caption>
              <tbody>
                {data.map((d) => (
                  <tr key={d.month}>
                    <th>{d.month}</th>
                    <td>{d.score}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
