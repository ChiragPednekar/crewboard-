import { useState } from 'react';
import { Award, Check, Crown, Flame, Heart, Medal, Sparkles, Star, Trophy, Vote } from 'lucide-react';
import { toast } from 'sonner';

import { CountUp } from '@/components/CountUp';
import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { WorkThumb } from '@/features/home/WorkThumb';
import { formatMonth } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

import { type Badges, badgeList, useBadges, useCastVote, useVoteCandidates, useYearlyLeaderboard } from './api';

const BADGE_ICON: Record<keyof Badges, typeof Award> = {
  top_performer: Crown,
  best_work: Sparkles,
  perfect_months: Medal,
  five_star: Star,
  on_time_streak: Flame,
};

/** Achievements for one videographer (earned ones lit, the rest dimmed as goals). */
export function BadgesCard({ videographerId, title = 'Badges' }: { videographerId: string; title?: string }) {
  const badges = useBadges(videographerId);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2">
          <Award className="h-4 w-4 text-gold-text" aria-hidden /> {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {badges.isPending ? (
          <Skeleton className="h-24" />
        ) : badges.isError ? (
          <p className="text-sm text-muted-foreground">Badges couldn’t load.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {badgeList(badges.data).map((b) => {
              const Icon = BADGE_ICON[b.key];
              const earned = b.value > 0;
              return (
                <li
                  key={b.key}
                  className={cn('rounded-xl border p-3 text-center', earned ? 'border-gold/40 bg-gold/10' : 'border-border bg-surface-2/40 opacity-60')}
                  title={`${b.value} ${b.detail}`}
                >
                  <Icon className={cn('mx-auto h-5 w-5', earned ? 'text-gold-text' : 'text-muted-foreground')} aria-hidden />
                  <p className="tabular mt-1 font-display text-xl font-semibold">{b.value}</p>
                  <p className="text-xs font-medium">{b.label}</p>
                  <p className="text-[11px] text-muted-foreground">{b.detail}</p>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Sum of published monthly scores across a calendar year. */
export function YearlyStandings({ year, meId }: { year: number; meId: string }) {
  const rows = useYearlyLeaderboard(year);
  if (rows.isPending) return <Skeleton className="h-48" />;
  if (rows.isError) return <p className="text-sm text-muted-foreground">Couldn’t load the yearly standings.</p>;
  if (rows.data.length === 0) {
    return <EmptyState icon={Trophy} title={`No published assessments in ${year} yet`} description="The yearly race starts once the first month is published." className="py-10" />;
  }
  const top = Number(rows.data[0]!.total_score) || 1;
  return (
    <ol className="space-y-2" aria-label={`${year} standings`}>
      {rows.data.map((r) => (
        <li key={r.videographer_id} className={cn('flex items-center gap-3 rounded-lg p-2', r.videographer_id === meId && 'bg-primary/5 ring-1 ring-primary/30')}>
          <span className={cn('tabular w-6 text-center font-display font-semibold', r.rank === 1 ? 'text-gold-text' : r.rank === 2 ? 'text-silver-text' : r.rank === 3 ? 'text-bronze-text' : 'text-muted-foreground')}>
            {r.rank}
          </span>
          <UserAvatar name={r.full_name} src={r.avatar_url} className="h-8 w-8 text-[11px]" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">
              {r.full_name}
              {r.videographer_id === meId && <span className="text-muted-foreground"> (you)</span>}
            </p>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-violet" style={{ width: `${Math.max(4, (Number(r.total_score) / top) * 100)}%` }} />
            </div>
          </div>
          <div className="text-right">
            <p className="tabular font-display font-semibold">{Number(r.total_score).toFixed(1)}</p>
            <p className="tabular text-[11px] text-muted-foreground">
              {r.months} {r.months === 1 ? 'month' : 'months'} · avg {Number(r.avg_score).toFixed(1)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** "Crew's choice": everyone can vote once a month for someone else's approved work. */
export function CrewsChoice({ month }: { month: string }) {
  const candidates = useVoteCandidates(month);
  const vote = useCastVote(month);
  const [open, setOpen] = useState(false);
  const list = candidates.data ?? [];
  const open_ = list[0]?.voting_open ?? false;
  const myVote = list.find((c) => c.my_vote);
  const leaders = [...list].filter((c) => c.votes > 0).sort((a, b) => b.votes - a.votes).slice(0, 3);
  const total = list.reduce((n, c) => n + c.votes, 0);

  if (candidates.isPending) return <Skeleton className="h-40 rounded-xl" />;
  if (list.length === 0) return null;

  return (
    <section aria-labelledby="crews-choice-heading">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="crews-choice-heading" className="flex items-center gap-2 font-display text-xl font-semibold">
            <Heart className="h-5 w-5 text-danger-text" aria-hidden /> Crew’s choice
          </h2>
          <p className="text-sm text-muted-foreground">
            {total} {total === 1 ? 'vote' : 'votes'} so far · {open_ ? 'one vote each, you can change it' : 'voting closed'}
          </p>
        </div>
        {open_ && (
          <Button variant={myVote ? 'secondary' : 'default'} onClick={() => setOpen(true)}>
            <Vote /> {myVote ? 'Change my vote' : 'Vote'}
          </Button>
        )}
      </div>
      {leaders.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">No votes yet. Which piece from {formatMonth(month, 'MMMM')} blew you away?</Card>
      ) : (
        <ol className="grid gap-3 sm:grid-cols-3">
          {leaders.map((c, i) => (
            <li key={c.task_id}>
              <Card className="overflow-hidden">
                <WorkThumb thumbnailPath={null} links={c.links} className="aspect-video" />
                <div className="flex items-center gap-3 p-3">
                  <span className={cn('tabular font-display text-lg font-semibold', i === 0 ? 'text-gold-text' : 'text-muted-foreground')}>#{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{c.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {c.videographer_name} · {c.client_name}
                    </p>
                  </div>
                  <span className="tabular inline-flex items-center gap-1 text-sm font-semibold text-danger-text">
                    <Heart className="h-3.5 w-3.5 fill-current" aria-hidden /> <CountUp value={c.votes} />
                  </span>
                </div>
              </Card>
            </li>
          ))}
        </ol>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Vote for {formatMonth(month, 'MMMM')}’s best work</DialogTitle>
            <DialogDescription>Pick the piece you’d most like to have made. You can’t vote for your own work.</DialogDescription>
          </DialogHeader>
          <ul className="grid max-h-[60vh] gap-3 overflow-y-auto sm:grid-cols-2">
            {list.map((c) => (
              <li key={c.task_id}>
                <button
                  type="button"
                  disabled={c.is_mine || vote.isPending}
                  onClick={() =>
                    vote.mutate(c.my_vote ? null : c.task_id, {
                      onSuccess: () => toast.success(c.my_vote ? 'Vote removed' : `Voted for ${c.title}`),
                      onError: (e) => toast.error(friendlyError(e)),
                    })
                  }
                  className={cn(
                    'w-full overflow-hidden rounded-xl border text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                    c.my_vote ? 'border-primary ring-2 ring-primary/40' : 'border-border hover:border-primary/50',
                  )}
                  aria-pressed={c.my_vote}
                >
                  <WorkThumb thumbnailPath={null} links={c.links} className="aspect-video" />
                  <div className="flex items-center gap-2 p-3">
                    <UserAvatar name={c.videographer_name} src={c.avatar_url} className="h-7 w-7 text-[10px]" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{c.title}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {c.is_mine ? 'Your work' : c.videographer_name} · {c.category}
                      </p>
                    </div>
                    {c.my_vote && <Check className="h-4 w-4 text-primary-text" aria-label="Your vote" />}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </section>
  );
}
