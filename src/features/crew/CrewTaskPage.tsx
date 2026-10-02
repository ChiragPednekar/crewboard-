import { useState } from 'react';
import { Ban, CheckCircle2, FileQuestion, FileSpreadsheet, Hourglass, Mail, MapPin, Phone, Play, RotateCcw, Send, Star, StickyNote, UserRound } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { PriorityChip } from '@/components/Chips';
import { ClientLogo } from '@/components/ClientLogo';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { PageHeader } from '@/components/PageHeader';
import { StatusChip } from '@/components/StatusChip';
import { BackLink, DetailRow } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useTaskSubmissions } from '@/features/tasks/api';
import { ReferencesCard } from '@/features/tasks/ReferencesCard';
import { dueLabel, formatDate, formatDateTime, isOverdue, toMonthKey } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { cn } from '@/lib/utils';

import { type CrewTaskDetail, useMyTask, useStartTask, useThumbnailUrl } from './api';
import { SubmitDialog } from './SubmitDialog';

export default function CrewTaskPage() {
  const { id = '' } = useParams();
  const task = useMyTask(id);
  const history = useTaskSubmissions(id);
  const [submitting, setSubmitting] = useState(false);

  if (task.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-14 w-3/4" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (task.isError) return <ErrorState error={task.error} onRetry={() => void task.refetch()} />;
  if (!task.data) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Task not found"
        description="It may have been removed, or it isn’t assigned to you."
        action={
          <Button asChild variant="secondary">
            <Link to="/me">Back to my tasks</Link>
          </Button>
        }
      />
    );
  }

  const t = task.data;
  const subs = history.data?.submissions ?? [];
  const reviews = history.data?.reviews ?? [];
  const latestReview = reviews[0];
  const overdue = isOverdue(t.due_date, t.status);

  return (
    <>
      <BackLink to={`/me?month=${toMonthKey(t.month)}`}>My tasks</BackLink>
      <PageHeader
        eyebrow={[t.client?.name, t.category?.name].filter(Boolean).join(' · ')}
        title={<span className={cn(t.status === 'cancelled' && 'text-muted-foreground line-through decoration-1')}>{t.title}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={t.status} overdue={overdue} />
            <PriorityChip priority={t.priority} />
            <span className={cn(overdue && 'text-warning-text')}>
              {['submitted', 'approved', 'cancelled'].includes(t.status) ? `Due ${formatDate(t.due_date, 'EEE d MMM')}` : dueLabel(t.due_date)}
            </span>
            <span className="tabular">· {t.max_points} pts</span>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-6">
          <NextStep task={t} feedback={latestReview} submissionsCount={subs.length} onSubmit={() => setSubmitting(true)} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Brief</CardTitle>
            </CardHeader>
            <CardContent>
              {t.brief ? (
                <p className="whitespace-pre-line text-sm leading-relaxed">{t.brief}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No written brief. Check the references, or ask your admin.</p>
              )}
            </CardContent>
          </Card>

          <ReferencesCard taskId={t.id} editable={false} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Your versions</CardTitle>
            </CardHeader>
            <CardContent>
              {history.isPending ? (
                <Skeleton className="h-24 rounded-lg" />
              ) : subs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
              ) : (
                <ol className="space-y-4">
                  {subs.map((s) => {
                    const review = reviews.find((r) => r.submission_id === s.id);
                    return (
                      <li key={s.id} className="rounded-lg border border-border p-3 sm:p-4">
                        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          <span className="font-medium">Version {s.version}</span>
                          <span className="text-muted-foreground">{formatDateTime(s.submitted_at)}</span>
                          {s.version === 1 && (
                            <span className={cn('text-xs font-medium', s.is_on_time ? 'text-success-text' : 'text-warning-text')}>
                              {s.is_on_time ? 'On time' : 'Late'}
                            </span>
                          )}
                          {s.source === 'sheet' && (
                            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> from your Sheet
                            </span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {s.links.map((l) => (
                            <LinkPreviewCard key={l} url={l} />
                          ))}
                        </div>
                        {s.thumbnail_path && <Thumb path={s.thumbnail_path} />}
                        {s.notes && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">“{s.notes}”</p>}
                        {review && (
                          <div
                            className={cn(
                              'mt-3 rounded-md px-3 py-2 text-sm',
                              review.decision === 'approved' ? 'bg-success/10 text-success-text' : 'bg-danger/10 text-danger-text',
                            )}
                          >
                            <p className="font-medium">
                              {review.decision === 'approved' ? `Approved · ${review.points_awarded} pts · ${review.quality_rating}★` : 'Changes requested'}
                              <span className="font-normal"> · {formatDateTime(review.reviewed_at, 'd MMM')}</span>
                            </p>
                            {review.feedback && <p className="mt-1 whitespace-pre-line text-foreground/90">{review.feedback}</p>}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-6">{t.client && <ClientCard client={t.client} />}</aside>
      </div>

      <SubmitDialog
        open={submitting}
        onOpenChange={setSubmitting}
        task={t}
        isResubmission={subs.length > 0}
        previousLinks={t.status === 'revision_requested' ? undefined : subs[0]?.links}
      />
    </>
  );
}

type Review = NonNullable<ReturnType<typeof useTaskSubmissions>['data']>['reviews'][number];

/** The one thing to do now, with the matching button. */
function NextStep({ task: t, feedback, submissionsCount, onSubmit }: { task: CrewTaskDetail; feedback?: Review; submissionsCount: number; onSubmit: () => void }) {
  const start = useStartTask();

  if (t.status === 'cancelled') {
    return (
      <Banner tone="muted" icon={Ban} title="This task was cancelled">
        It no longer counts towards your points or score. Nothing to do here.
      </Banner>
    );
  }
  if (t.status === 'approved') {
    return (
      <Banner tone="success" icon={CheckCircle2} title={`Approved · ${t.points_awarded} of ${t.max_points} points`}>
        {t.quality_rating && (
          <span className="mb-1 flex items-center gap-0.5 text-gold-text" role="img" aria-label={`${t.quality_rating} out of 5 stars`}>
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={cn('h-4 w-4', i < (t.quality_rating ?? 0) ? 'fill-current' : 'opacity-30')} aria-hidden />
            ))}
          </span>
        )}
        {feedback?.feedback ? <span className="whitespace-pre-line">{feedback.feedback}</span> : 'Great work.'}
      </Banner>
    );
  }
  if (t.status === 'revision_requested') {
    return (
      <Banner
        tone="danger"
        icon={RotateCcw}
        title="Changes requested"
        action={
          <Button onClick={onSubmit}>
            <Send /> Submit new version
          </Button>
        }
      >
        <span className="whitespace-pre-line text-foreground/90">{feedback?.feedback ?? 'Your admin asked for a new version.'}</span>
      </Banner>
    );
  }
  if (t.status === 'submitted') {
    return (
      <Banner
        tone="info"
        icon={Hourglass}
        title="Waiting for review"
        action={
          <Button variant="secondary" onClick={onSubmit}>
            Replace with a new version
          </Button>
        }
      >
        Version {submissionsCount} was sent {t.last_submitted_at ? formatDateTime(t.last_submitted_at, 'd MMM, h:mm a') : ''}. You’ll get a notification when it’s reviewed.
      </Banner>
    );
  }
  // assigned / in_progress
  return (
    <Banner
      tone="primary"
      icon={t.status === 'assigned' ? Play : Send}
      title={t.status === 'assigned' ? 'Ready when you are' : 'In progress'}
      action={
        <div className="flex flex-col gap-2 sm:flex-row">
          {t.status === 'assigned' && (
            <Button
              variant="secondary"
              loading={start.isPending}
              onClick={() =>
                start.mutate(t.id, {
                  onSuccess: () => toast.success('Marked as in progress'),
                  onError: (e) => toast.error(friendlyError(e)),
                })
              }
            >
              {!start.isPending && <Play />} Start
            </Button>
          )}
          <Button onClick={onSubmit}>
            <Send /> Submit work
          </Button>
        </div>
      }
    >
      {t.status === 'assigned'
        ? 'Read the brief and references below. Tap Start so your admin knows you’re on it.'
        : 'When it’s done, submit your deliverable links for review.'}{' '}
      Due {formatDate(t.due_date, 'EEEE d MMM')}, by midnight.
    </Banner>
  );
}

function Banner({
  tone,
  icon: Icon,
  title,
  action,
  children,
}: {
  tone: 'primary' | 'info' | 'danger' | 'success' | 'muted';
  icon: typeof Send;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label="Next step"
      className={cn(
        'flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:p-5',
        tone === 'primary' && 'studio-glow border-primary/30',
        tone === 'info' && 'border-info/30 bg-info/5',
        tone === 'danger' && 'border-danger/35 bg-danger/5',
        tone === 'success' && 'border-success/30 bg-success/5',
        tone === 'muted' && 'border-border bg-surface-2/40',
      )}
    >
      <div className="flex min-w-0 flex-1 gap-3">
        <Icon
          className={cn(
            'mt-0.5 h-5 w-5 shrink-0',
            tone === 'primary' && 'text-primary-text',
            tone === 'info' && 'text-info-text',
            tone === 'danger' && 'text-danger-text',
            tone === 'success' && 'text-success-text',
            tone === 'muted' && 'text-muted-foreground',
          )}
          aria-hidden
        />
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold">{title}</h2>
          <div className="mt-1 text-sm text-muted-foreground">{children}</div>
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </section>
  );
}

function Thumb({ path }: { path: string }) {
  const url = useThumbnailUrl(path);
  if (!url.data) return null;
  return <img src={url.data} alt="Submitted thumbnail" className="mt-3 aspect-video w-48 rounded-md border border-border object-cover" />;
}

function ClientCard({ client: c }: { client: NonNullable<CrewTaskDetail['client']> }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0 pb-2">
        <ClientLogo name={c.name} src={c.logo_url} />
        <CardTitle>{c.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="divide-y divide-border">
          {(c.address || c.city) && (
            <DetailRow icon={MapPin} label="Address">
              <a
                className="hover:text-primary-text hover:underline"
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([c.name, c.address, c.city].filter(Boolean).join(', '))}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {[c.address, c.city].filter(Boolean).join(', ')}
              </a>
            </DetailRow>
          )}
          {c.contact_name && (
            <DetailRow icon={UserRound} label="Contact">
              {c.contact_name}
            </DetailRow>
          )}
          {c.contact_phone && (
            <DetailRow icon={Phone} label="Phone">
              <a className="tabular hover:text-primary-text hover:underline" href={`tel:${c.contact_phone.replace(/[^0-9+]/g, '')}`}>
                {c.contact_phone}
              </a>
            </DetailRow>
          )}
          {c.contact_email && (
            <DetailRow icon={Mail} label="Email">
              <a className="hover:text-primary-text hover:underline" href={`mailto:${c.contact_email}`}>
                {c.contact_email}
              </a>
            </DetailRow>
          )}
          {c.notes && (
            <DetailRow icon={StickyNote} label="Notes">
              <span className="whitespace-pre-line">{c.notes}</span>
            </DetailRow>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}
