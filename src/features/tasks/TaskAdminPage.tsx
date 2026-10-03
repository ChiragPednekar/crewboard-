import { useState } from 'react';
import {
  Ban,
  Building,
  CalendarClock,
  ClipboardCheck,
  Clock,
  Ellipsis,
  FileQuestion,
  FileSpreadsheet,
  History,
  Pencil,
  RotateCcw,
  Shapes,
  Star,
  Trash2,
  Trophy,
  UserRound,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router';

import { PlanStatusChip, PriorityChip } from '@/components/Chips';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { PageHeader } from '@/components/PageHeader';
import { StatusChip } from '@/components/StatusChip';
import { BackLink, DetailRow } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { ActivityFeed } from '@/features/activity/ActivityFeed';
import { dueLabel, formatDate, formatDateTime, formatMonth, isOverdue, toMonthKey } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { type TaskDetail, useTask, useTaskSubmissions } from './api';
import { ReferencesCard } from './ReferencesCard';
import { canDeleteTask, useTaskActions } from './TaskActions';
import { TaskFormDialog } from './TaskFormDialog';

export default function TaskAdminPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const task = useTask(id);
  const [editing, setEditing] = useState(false);
  const planUrl = task.data ? `/admin/plans?month=${toMonthKey(task.data.month)}&vid=${task.data.videographer_id}` : '/admin/plans';
  const actions = useTaskActions({ onDeleted: () => navigate(planUrl, { replace: true }) });

  if (task.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-14 w-2/3" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Skeleton className="h-80 rounded-xl lg:col-span-2" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }
  if (task.isError) return <ErrorState error={task.error} onRetry={() => void task.refetch()} />;
  if (!task.data) {
    return (
      <EmptyState
        icon={FileQuestion}
        title="Task not found"
        description="It may have been deleted."
        action={
          <Button asChild variant="secondary">
            <Link to="/admin/plans">Back to plans</Link>
          </Button>
        }
      />
    );
  }

  const t = task.data;
  const month = toMonthKey(t.month);
  const cancelled = t.status === 'cancelled';
  const overdue = isOverdue(t.due_date, t.status);
  const firstName = t.videographer?.full_name.split(' ')[0] ?? 'the videographer';

  return (
    <>
      <BackLink to={planUrl}>
        {t.videographer?.full_name ?? 'Plan'} · {formatMonth(month)}
      </BackLink>
      <PageHeader
        eyebrow={[t.client?.name, t.category?.name].filter(Boolean).join(' · ')}
        title={<span className={cn(cancelled && 'text-muted-foreground line-through decoration-1')}>{t.title}</span>}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={t.status} overdue={overdue} />
            <PriorityChip priority={t.priority} />
            {t.plan?.status === 'draft' && <PlanStatusChip status="draft" />}
          </span>
        }
        actions={
          <>
            {(t.status === 'submitted' || t.status === 'approved') && (
              <Button asChild>
                <Link to={`/admin/review/${t.id}`}>
                  <ClipboardCheck /> {t.status === 'submitted' ? 'Review' : 'Re-review'}
                </Link>
              </Button>
            )}
            {!cancelled && (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {cancelled ? (
                  <DropdownMenuItem onSelect={() => actions.restore(t)}>
                    <RotateCcw /> Restore task
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => actions.askCancel(t)}>
                    <Ban /> Cancel task
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={!canDeleteTask(t)}
                  onSelect={() => actions.askDelete(t)}
                  className="text-danger-text focus:text-danger-text"
                >
                  <Trash2 /> {canDeleteTask(t) ? 'Delete task' : 'Delete (has submissions)'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Brief</CardTitle>
            </CardHeader>
            <CardContent>
              {t.brief ? (
                <p className="whitespace-pre-line text-sm leading-relaxed">{t.brief}</p>
              ) : (
                <p className="text-sm text-muted-foreground">No brief yet. {!cancelled && 'Use Edit to add what needs to be shot and delivered.'}</p>
              )}
            </CardContent>
          </Card>

          <ReferencesCard taskId={t.id} editable={!cancelled} />
          <SubmissionsCard task={t} firstName={firstName} />
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="divide-y divide-border">
                <DetailRow icon={UserRound} label="Videographer">
                  {t.videographer ? (
                    <Link to={`/admin/videographers/${t.videographer.id}`} className="inline-flex items-center gap-2 hover:text-primary-text">
                      <UserAvatar name={t.videographer.full_name} src={t.videographer.avatar_url} className="h-6 w-6 text-[10px]" />
                      {t.videographer.full_name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </DetailRow>
                <DetailRow icon={Building} label="Client">
                  {t.client ? (
                    <Link to={`/admin/clients/${t.client.id}`} className="hover:text-primary-text hover:underline">
                      {t.client.name}
                    </Link>
                  ) : (
                    '—'
                  )}
                </DetailRow>
                <DetailRow icon={Shapes} label="Category">
                  {t.category?.name ?? '—'}
                </DetailRow>
                <DetailRow icon={CalendarClock} label="Due">
                  {formatDate(t.due_date, 'EEEE, d MMMM')}
                  {!['approved', 'cancelled', 'submitted'].includes(t.status) && (
                    <span className={cn('block text-xs', overdue ? 'text-warning-text' : 'text-muted-foreground')}>{dueLabel(t.due_date)}</span>
                  )}
                </DetailRow>
                <DetailRow icon={Trophy} label="Points">
                  <span className="tabular">
                    {t.status === 'approved' ? (
                      <>
                        <span className="font-semibold text-primary-text">{t.points_awarded}</span> of {t.max_points}
                        {t.quality_rating && (
                          <span className="ml-2 inline-flex items-center gap-0.5 text-gold-text">
                            <Star className="h-3.5 w-3.5 fill-current" aria-hidden /> {t.quality_rating}
                            <span className="sr-only">out of 5</span>
                          </span>
                        )}
                      </>
                    ) : (
                      `Up to ${t.max_points}`
                    )}
                  </span>
                </DetailRow>
                <DetailRow icon={t.status_changed_via === 'sheet' ? FileSpreadsheet : Clock} label="Last status change">
                  {formatDateTime(t.status_changed_at)}
                  {t.status_changed_via === 'sheet' && <span className="block text-xs text-muted-foreground">from the Google Sheet</span>}
                </DetailRow>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2">
                <History className="h-4 w-4 text-violet-text" aria-hidden /> History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ActivityFeed entityId={t.id} limit={30} />
            </CardContent>
          </Card>
        </div>
      </div>

      <TaskFormDialog open={editing} onOpenChange={setEditing} month={month} videographerId={t.videographer_id} task={t} />
      {actions.dialogs}
    </>
  );
}

function SubmissionsCard({ task, firstName }: { task: TaskDetail; firstName: string }) {
  const data = useTaskSubmissions(task.id);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Submissions</CardTitle>
      </CardHeader>
      <CardContent>
        {data.isPending ? (
          <Skeleton className="h-24 rounded-lg" />
        ) : data.isError ? (
          <p className="text-sm text-danger-text">Couldn’t load submissions.</p>
        ) : data.data.submissions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {task.plan?.status === 'draft' ? `${firstName} can’t see this task until the plan is published.` : `Nothing submitted yet. ${firstName}’s deliverables will appear here.`}
          </p>
        ) : (
          <ol className="space-y-4">
            {data.data.submissions.map((s) => {
              const review = data.data.reviews.find((r) => r.submission_id === s.id);
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
                        <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> via Sheet
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {s.links.map((l) => (
                      <LinkPreviewCard key={l} url={l} />
                    ))}
                    {s.links.length === 0 && <p className="text-sm text-muted-foreground">Marked Completed in the sheet, without a link.</p>}
                  </div>
                  {s.notes && <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">“{s.notes}”</p>}
                  {review && (
                    <div
                      className={cn(
                        'mt-3 rounded-md px-3 py-2 text-sm',
                        review.decision === 'approved' ? 'bg-success/10 text-success-text' : 'bg-danger/10 text-danger-text',
                      )}
                    >
                      <p className="font-medium">
                        {review.decision === 'approved' ? `Approved · ${review.points_awarded} pts · ${review.quality_rating}★` : 'Revision requested'}
                        <span className="font-normal"> · {review.reviewer?.full_name ?? 'Admin'}, {formatDateTime(review.reviewed_at, 'd MMM')}</span>
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
  );
}
