import { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, ExternalLink, Heart, Medal, Plus, Sparkles, Star, X } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/UserAvatar';
import { type FeaturePick, useFeatureCandidates, useFeaturedWork, useSetFeaturedWork } from '@/features/leaderboard/api';
import { useMonthParam } from '@/hooks/useSearchParamState';
import { useVoteCandidates } from '@/features/motivation/api';
import { formatMonth } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

import { WorkThumb } from './WorkThumb';

const MAX_PICKS = 5; // Best Work + 4 runners-up

type Candidate = NonNullable<ReturnType<typeof useFeatureCandidates>['data']>[number];

export default function FeaturedPickerPage() {
  const [month, setMonth] = useMonthParam();
  const candidates = useFeatureCandidates(month);
  const current = useFeaturedWork(month);
  const save = useSetFeaturedWork();
  const [picks, setPicks] = useState<FeaturePick[]>([]);

  const savedKey = JSON.stringify((current.data ?? []).map((f) => ({ task_id: f.task_id, rank: f.rank, reason: f.reason ?? '' })));
  useEffect(() => setPicks(JSON.parse(savedKey) as FeaturePick[]), [savedKey, month]);

  const ranked = picks.map((p, i) => ({ ...p, rank: i + 1 }));
  const dirty = JSON.stringify(ranked) !== savedKey;
  const byId = useMemo(() => new Map((candidates.data ?? []).map((c) => [c.id, c])), [candidates.data]);
  const picked = new Set(picks.map((p) => p.task_id));

  function add(id: string, asBest: boolean) {
    if (asBest && picks.length >= MAX_PICKS) {
      const dropped = byId.get(picks[picks.length - 1]!.task_id)?.title;
      toast(`Removed “${dropped ?? 'the last runner-up'}” to make room`);
    }
    setPicks((ps) => {
      if (ps.some((p) => p.task_id === id)) return ps;
      const next = { task_id: id, rank: 0, reason: '' };
      return asBest ? [next, ...ps].slice(0, MAX_PICKS) : [...ps, next].slice(0, MAX_PICKS);
    });
  }
  function move(i: number, d: -1 | 1) {
    setPicks((ps) => {
      const j = i + d;
      if (j < 0 || j >= ps.length) return ps;
      const next = [...ps];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Featured work"
        description="Pick the Best Work of the month and a few runners-up. They’re shown to the whole crew on the home page."
        actions={
          <>
            <MonthPicker value={month} onChange={setMonth} />
            <Button asChild variant="secondary">
              <Link to={`/?month=${month}`}>
                <ExternalLink /> View on home
              </Link>
            </Button>
          </>
        }
      />
      <CrewVotesHint month={month} />

      {candidates.isError ? (
        <ErrorState error={candidates.error} onRetry={() => void candidates.refetch()} />
      ) : candidates.isPending || current.isPending ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      ) : candidates.data.length === 0 ? (
        <EmptyState icon={Sparkles} title={`No approved work in ${formatMonth(month)}`} description="Only approved tasks can be featured. Review submissions first." />
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <Card className="h-fit xl:sticky xl:top-24">
            <CardHeader className="pb-3">
              <CardTitle>Your picks</CardTitle>
              <p className="text-sm text-muted-foreground">The first is Best Work. Reorder with the arrows. Up to {MAX_PICKS}.</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {ranked.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">Nothing picked yet. Choose from the approved work.</p>
              ) : (
                <ol className="space-y-3">
                  {ranked.map((p, i) => {
                    const c = byId.get(p.task_id);
                    return (
                      <li key={p.task_id} className={cn('rounded-lg border p-3', i === 0 ? 'border-gold/40 bg-gold/5' : 'border-border')}>
                        <div className="flex items-start gap-3">
                          <WorkThumb thumbnailPath={c?.submissions[0]?.thumbnail_path ?? null} links={c?.submissions[0]?.links ?? null} className="aspect-video w-24 shrink-0 rounded-md" />
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-xs font-medium', i === 0 ? 'text-gold-text' : 'text-muted-foreground')}>
                              {i === 0 ? (
                                <span className="inline-flex items-center gap-1">
                                  <Sparkles className="h-3 w-3" aria-hidden /> Best work
                                </span>
                              ) : (
                                `Runner-up ${i}`
                              )}
                            </p>
                            <p className="truncate text-sm font-medium">{c?.title ?? 'Task no longer approved'}</p>
                            <p className="truncate text-xs text-muted-foreground">{c?.videographer?.full_name}</p>
                          </div>
                          <div className="flex shrink-0 flex-col">
                            <Button variant="ghost" size="icon-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${c?.title} up`}>
                              <ArrowUp />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => move(i, 1)} disabled={i === ranked.length - 1} aria-label={`Move ${c?.title} down`}>
                              <ArrowDown />
                            </Button>
                          </div>
                          <Button variant="ghost" size="icon-sm" onClick={() => setPicks((ps) => ps.filter((x) => x.task_id !== p.task_id))} aria-label={`Remove ${c?.title}`}>
                            <X />
                          </Button>
                        </div>
                        <Textarea
                          rows={2}
                          maxLength={600}
                          value={p.reason}
                          onChange={(e) => setPicks((ps) => ps.map((x) => (x.task_id === p.task_id ? { ...x, reason: e.target.value } : x)))}
                          placeholder={i === 0 ? 'Why it’s the best work this month (shown on the home page)' : 'Why it stood out (optional)'}
                          aria-label={`Reason for ${c?.title}`}
                          className="mt-3"
                        />
                      </li>
                    );
                  })}
                </ol>
              )}
              <Button
                className="w-full"
                disabled={!dirty}
                loading={save.isPending}
                onClick={() =>
                  save.mutate(
                    { month, picks: ranked },
                    {
                      onSuccess: () =>
                        toast.success(ranked.length ? 'Featured work saved' : 'Featured work cleared', {
                          description: ranked.length ? 'The winner is notified the first time their work is picked as Best Work.' : undefined,
                        }),
                      onError: (e) => toast.error(friendlyError(e)),
                    },
                  )
                }
              >
                Save picks
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Approved work · {formatMonth(month)}</CardTitle>
              <p className="text-sm text-muted-foreground">Highest rated first.</p>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {candidates.data.map((c) => (
                  <CandidateRow key={c.id} c={c} picked={picked.has(c.id)} full={picks.length >= MAX_PICKS} onAdd={add} />
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}

function CandidateRow({ c, picked, full, onAdd }: { c: Candidate; picked: boolean; full: boolean; onAdd: (id: string, asBest: boolean) => void }) {
  const sub = c.submissions[0];
  return (
    <li className={cn('flex flex-col gap-3 rounded-lg border border-border p-3 sm:flex-row sm:items-start', picked && 'border-primary/40 bg-primary/5')}>
      <WorkThumb thumbnailPath={sub?.thumbnail_path ?? null} links={sub?.links ?? null} className="aspect-video w-full shrink-0 rounded-md sm:w-36" />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-snug">
          {sub?.links[0] ? (
            <a href={sub.links[0]} target="_blank" rel="noopener noreferrer" className="hover:text-primary-text hover:underline">
              {c.title}
              <span className="sr-only"> (opens the deliverable in a new tab)</span>
            </a>
          ) : (
            c.title
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {c.videographer && (
            <span className="inline-flex items-center gap-1">
              <UserAvatar name={c.videographer.full_name} src={c.videographer.avatar_url} className="h-4 w-4 text-[8px]" />
              {c.videographer.full_name}
            </span>
          )}
          <span>· {c.client?.name}</span>
          <span>· {c.category?.name}</span>
        </p>
        <p className="mt-1 flex items-center gap-2 text-xs">
          {c.quality_rating && (
            <span className="inline-flex items-center gap-0.5 text-gold-text" role="img" aria-label={`${c.quality_rating} out of 5 stars`}>
              {Array.from({ length: c.quality_rating }, (_, i) => (
                <Star key={i} className="h-3 w-3 fill-current" aria-hidden />
              ))}
            </span>
          )}
          <span className="tabular text-muted-foreground">
            {c.points_awarded}/{c.max_points} pts
          </span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" disabled={picked} onClick={() => onAdd(c.id, true)}>
            <Medal /> Best work
          </Button>
          <Button size="sm" variant="ghost" disabled={picked || full} onClick={() => onAdd(c.id, false)}>
            <Plus /> Runner-up
          </Button>
          {picked && <span className="self-center text-xs text-muted-foreground">Picked</span>}
        </div>
      </div>
    </li>
  );
}

/** The crew's own votes, as a steer for the admin's pick. */
function CrewVotesHint({ month }: { month: string }) {
  const votes = useVoteCandidates(month);
  const top = (votes.data ?? []).filter((c) => c.votes > 0).sort((a, b) => b.votes - a.votes).slice(0, 5);
  if (top.length === 0) return null;
  return (
    <div className="mb-6 rounded-xl border border-border bg-surface p-4">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Heart className="h-4 w-4 text-danger-text" aria-hidden /> Crew’s choice so far
      </p>
      <ol className="flex flex-wrap gap-2">
        {top.map((c, i) => (
          <li key={c.task_id} className="rounded-full bg-surface-2 px-3 py-1 text-sm">
            <span className="text-muted-foreground">#{i + 1}</span> {c.title} · {c.videographer_name.split(' ')[0]}{' '}
            <span className="tabular font-semibold text-danger-text">{c.votes}♥</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
