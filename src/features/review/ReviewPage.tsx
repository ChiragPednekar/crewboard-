import { useEffect, useState } from 'react';
import { CheckCircle2, FileQuestion, FileSpreadsheet, Hourglass, RotateCcw, Send } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { StarRating } from '@/components/StarRating';
import { StatusChip } from '@/components/StatusChip';
import { BackLink, Segmented } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { UserAvatar } from '@/components/UserAvatar';
import { VideoEmbed } from '@/components/VideoEmbed';
import { type TaskDetail, useTask, useTaskSubmissions, useThumbnailUrl } from '@/features/tasks/api';
import { ReferencesCard } from '@/features/tasks/ReferencesCard';
import { formatDate, formatDateTime } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

import { useReviewQueue, useReviewTask } from './api';

type Submissions = NonNullable<ReturnType<typeof useTaskSubmissions>['data']>;

export default function ReviewPage() {
  const { taskId = '' } = useParams();
  const task = useTask(taskId);
  const history = useTaskSubmissions(taskId);
  const [version, setVersion] = useState<number | null>(null);

  useEffect(() => setVersion(null), [taskId]);

  if (task.isPending || history.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-12 w-2/3" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Skeleton className="aspect-video rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </div>
    );
  }
  if (task.isError) return <ErrorState error={task.error} onRetry={() => void task.refetch()} />;
  if (history.isError) return <ErrorState error={history.error} onRetry={() => void history.refetch()} />;
  if (!task.data) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Task not found"
        action={
          <Button asChild variant="secondary">
            <Link to="/admin/review">Back to the queue</Link>
          </Button>
        }
      />
    );
  }

  const t = task.data;
  const { submissions, reviews } = history.data;
  const shown = submissions.find((s) => s.version === version) ?? submissions[0];

  return (
    <>
      <BackLink to="/admin/review">Review queue</BackLink>
      <PageHeader
        eyebrow={[t.client?.name, t.category?.name].filter(Boolean).join(' · ')}
        title={t.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={t.status} />
            {t.videographer && (
              <Link to={`/admin/videographers/${t.videographer.id}`} className="inline-flex items-center gap-1.5 hover:text-primary-text">
                <UserAvatar name={t.videographer.full_name} src={t.videographer.avatar_url} className="h-5 w-5 text-[9px]" />
                {t.videographer.full_name}
              </Link>
            )}
            <span>· due {formatDate(t.due_date, 'd MMM')}</span>
            <Link to={`/admin/tasks/${t.id}`} className="underline-offset-2 hover:text-primary-text hover:underline">
              · task details
            </Link>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="flex-col gap-3 space-y-0 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle>Deliverable</CardTitle>
              {submissions.length > 1 && (
                <Segmented
                  label="Version"
                  value={String(shown?.version ?? '')}
                  onChange={(v) => setVersion(Number(v))}
                  options={submissions.map((s) => ({ value: String(s.version), label: `v${s.version}` }))}
                />
              )}
            </CardHeader>
            <CardContent>
              {!shown ? (
                <p className="text-sm text-muted-foreground">Nothing has been submitted for this task yet.</p>
              ) : (
                <SubmissionView submission={shown} title={t.title} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Brief</CardTitle>
            </CardHeader>
            <CardContent>
              {t.brief ? <p className="whitespace-pre-line text-sm leading-relaxed">{t.brief}</p> : <p className="text-sm text-muted-foreground">No brief.</p>}
            </CardContent>
          </Card>
          <ReferencesCard taskId={t.id} editable={false} />
        </div>

        <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <ReviewPanel task={t} submissions={submissions} />
          {reviews.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle>Earlier reviews</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {reviews.map((r) => {
                    const v = submissions.find((s) => s.id === r.submission_id)?.version;
                    return (
                      <li key={r.id} className="text-sm">
                        <p className={cn('font-medium', r.decision === 'approved' ? 'text-success-text' : 'text-danger-text')}>
                          {r.decision === 'approved' ? `Approved · ${r.points_awarded} pts · ${r.quality_rating}★` : 'Changes requested'}
                          {v && <span className="font-normal text-muted-foreground"> on v{v}</span>}
                        </p>
                        {r.feedback && <p className="mt-0.5 whitespace-pre-line text-muted-foreground">{r.feedback}</p>}
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {r.reviewer?.full_name ?? 'Admin'} · {formatDateTime(r.reviewed_at, 'd MMM, h:mm a')}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function SubmissionView({ submission: s, title }: { submission: Submissions['submissions'][number]; title: string }) {
  const thumb = useThumbnailUrl(s.thumbnail_path);
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>
          Version {s.version} · {formatDateTime(s.submitted_at)}
        </span>
        {s.version === 1 && <span className={cn('font-medium', s.is_on_time ? 'text-success-text' : 'text-warning-text')}>{s.is_on_time ? 'On time' : 'Late'}</span>}
        {s.source === 'sheet' && (
          <span className="inline-flex items-center gap-1">
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> via Sheet
          </span>
        )}
      </p>
      {s.links.map((l, i) => (
        <VideoEmbed key={`${s.id}-${l}`} url={l} title={`${title}, link ${i + 1}`} />
      ))}
      {s.notes && (
        <blockquote className="border-l-2 border-primary/50 pl-3 text-sm text-muted-foreground">
          <span className="whitespace-pre-line">{s.notes}</span>
        </blockquote>
      )}
      {thumb.data && (
        <div>
          <p className="mb-1.5 text-xs text-muted-foreground">Thumbnail</p>
          <img src={thumb.data} alt="Submitted thumbnail" className="aspect-video w-56 rounded-md border border-border object-cover" />
        </div>
      )}
    </div>
  );
}

function ReviewPanel({ task: t, submissions }: { task: TaskDetail; submissions: Submissions['submissions'] }) {
  const navigate = useNavigate();
  const queue = useReviewQueue();
  const review = useReviewTask();
  const reviewable = t.status === 'submitted' || t.status === 'approved';
  const [decision, setDecision] = useState<'approved' | 'revision_requested'>('approved');
  const [points, setPoints] = useState<number>(t.points_awarded ?? t.max_points);
  const [rating, setRating] = useState<number | null>(t.quality_rating ?? null);
  const [feedback, setFeedback] = useState('');
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setDecision('approved');
    setPoints(t.points_awarded ?? t.max_points);
    setRating(t.quality_rating ?? null);
    setFeedback('');
    setTouched(false);
  }, [t.id, t.points_awarded, t.max_points, t.quality_rating]);

  if (!reviewable) {
    const msg =
      t.status === 'revision_requested'
        ? { icon: RotateCcw, title: 'Waiting for a new version', body: 'You asked for changes. This comes back to the queue when they resubmit.' }
        : t.status === 'cancelled'
          ? { icon: FileQuestion, title: 'Cancelled', body: 'Cancelled tasks aren’t reviewed.' }
          : { icon: Hourglass, title: 'Nothing to review yet', body: 'The videographer hasn’t submitted this task.' };
    const Icon = msg.icon;
    return (
      <Card className="p-5">
        <Icon className="h-5 w-5 text-muted-foreground" aria-hidden />
        <p className="mt-3 font-display font-semibold">{msg.title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{msg.body}</p>
      </Card>
    );
  }

  const pointsValid = Number.isInteger(points) && points >= 0 && points <= t.max_points;
  const errors = {
    points: decision === 'approved' && !pointsValid ? `Enter 0–${t.max_points}` : null,
    rating: decision === 'approved' && !rating ? 'Pick a rating' : null,
    feedback: decision === 'revision_requested' && !feedback.trim() ? 'Tell them what needs to change' : null,
  };
  const hasErrors = Object.values(errors).some(Boolean);

  function goNext() {
    const next = (queue.data ?? []).find((q) => q.id !== t.id);
    if (next) navigate(`/admin/review/${next.id}`);
    else {
      toast.success('Queue cleared — nothing else to review');
      navigate('/admin/review');
    }
  }

  function submit() {
    setTouched(true);
    if (hasErrors) return;
    review.mutate(
      decision === 'approved'
        ? { taskId: t.id, decision, points, rating: rating!, feedback }
        : { taskId: t.id, decision, feedback },
      {
        onSuccess: () => {
          toast.success(decision === 'approved' ? `Approved · ${points}/${t.max_points} pts` : 'Sent back with your feedback', {
            description: `${t.videographer?.full_name.split(' ')[0] ?? 'They'} has been notified.`,
          });
          goNext();
        },
        onError: (e) => toast.error(friendlyError(e)),
      },
    );
  }

  const latest = submissions[0];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{t.status === 'approved' ? 'Change the review' : 'Your review'}</CardTitle>
        {latest && (
          <p className="text-sm text-muted-foreground">
            Reviewing version {latest.version}
            {t.status === 'approved' && ` · currently ${t.points_awarded}/${t.max_points} pts`}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          noValidate
        >
          <Segmented
            fill
            label="Decision"
            value={decision}
            onChange={setDecision}
            options={[
              { value: 'approved', label: t.status === 'approved' ? 'Re-score' : 'Approve' },
              { value: 'revision_requested', label: 'Changes' },
            ]}
          />

          {decision === 'approved' && (
            <>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <Label htmlFor="review-points">Points</Label>
                  <span className="text-xs text-muted-foreground">out of {t.max_points}</span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={t.max_points}
                    step={1}
                    value={pointsValid ? points : 0}
                    onChange={(e) => setPoints(e.target.valueAsNumber)}
                    className="h-2 flex-1 cursor-pointer accent-[hsl(var(--primary))]"
                    aria-label="Points slider"
                  />
                  <Input
                    id="review-points"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={t.max_points}
                    step={1}
                    value={Number.isNaN(points) ? '' : points}
                    onChange={(e) => setPoints(e.target.value === '' ? Number.NaN : e.target.valueAsNumber)}
                    aria-invalid={(touched && Boolean(errors.points)) || undefined}
                    className="tabular w-20 text-right"
                  />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[1, 0.9, 0.75, 0.5].map((f) => {
                    const v = Math.round(t.max_points * f);
                    return (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setPoints(v)}
                        className={cn(
                          'tabular h-8 rounded-md border border-border px-2.5 text-xs transition-colors hover:bg-surface-2',
                          points === v && 'border-primary/60 bg-primary/10 text-primary-text',
                        )}
                      >
                        {v} {f === 1 && '(full)'}
                      </button>
                    );
                  })}
                </div>
                {touched && errors.points && <p className="text-sm text-danger-text">{errors.points}</p>}
              </div>
              <div className="space-y-2">
                <Label asChild>
                  <span>Quality</span>
                </Label>
                <StarRating value={rating} onChange={setRating} invalid={touched && Boolean(errors.rating)} />
                {touched && errors.rating && <p className="text-sm text-danger-text">{errors.rating}</p>}
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="review-feedback">{decision === 'approved' ? 'Feedback (optional)' : 'What needs to change'}</Label>
            <Textarea
              id="review-feedback"
              rows={decision === 'approved' ? 3 : 5}
              maxLength={4000}
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              aria-invalid={(touched && Boolean(errors.feedback)) || undefined}
              placeholder={decision === 'approved' ? 'What worked well' : 'Be specific: timestamps, what to fix, what to keep'}
            />
            {touched && errors.feedback && <p className="text-sm text-danger-text">{errors.feedback}</p>}
          </div>

          <Button type="submit" className="w-full" variant={decision === 'approved' ? 'default' : 'destructive'} loading={review.isPending}>
            {!review.isPending && (decision === 'approved' ? <CheckCircle2 /> : <Send />)}
            {decision === 'approved' ? `Approve · ${pointsValid ? points : '–'}/${t.max_points} pts` : 'Send back for changes'}
          </Button>
          <p className="text-center text-xs text-muted-foreground">You’ll move to the next item in the queue.</p>
        </form>
      </CardContent>
    </Card>
  );
}
