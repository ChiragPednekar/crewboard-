import { useState } from 'react';
import {
  Activity,
  Award,
  Building,
  CalendarRange,
  Clock,
  Ellipsis,
  FileSpreadsheet,
  LayoutDashboard,
  ListChecks,
  Mail,
  MailPlus,
  MapPin,
  Pencil,
  Phone,
  Send,
  UserCheck,
  UserRound,
  UserX,
} from 'lucide-react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { AccountChip, PlanStatusChip } from '@/components/Chips';
import { ClientLogo } from '@/components/ClientLogo';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { MonthPicker } from '@/components/MonthPicker';
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
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UserAvatar } from '@/components/UserAvatar';
import { ActivityFeed } from '@/features/activity/ActivityFeed';
import { assessmentState, usePersonAssessments } from '@/features/assessments/api';
import { AssessmentStateChip } from '@/features/assessments/AssessmentStateChip';
import { useSheetConfigs } from '@/features/settings/api';
import { SyncEventList } from '@/features/settings/syncEvents';
import { usePlan } from '@/features/plans/api';
import { usePlanTasks } from '@/features/tasks/api';
import { TaskList } from '@/features/tasks/TaskList';
import { useEnumParam, useMonthParam } from '@/hooks/useSearchParamState';
import { formatDateTime, formatMonth, timeAgo, toMonthKey } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { sheetUrl } from '@/lib/sheets';
import { cn } from '@/lib/utils';

import {
  accountState,
  emptySummary,
  useAccounts,
  useCrewMonth,
  useResendInvite,
  useSetVideographerActive,
  useVideographer,
  useVideographerSubmissions,
  type Videographer,
} from './api';
import { EditDetailsDialog, ManageClientsDialog } from './dialogs';

const TABS = ['overview', 'plan', 'submissions', 'assessments', 'sheet'] as const;

export default function VideographerDetailPage() {
  const { id = '' } = useParams();
  const person = useVideographer(id);
  const accounts = useAccounts();
  const [tab, setTab] = useEnumParam('tab', TABS, 'overview');
  const [month, setMonth] = useMonthParam();
  const setActive = useSetVideographerActive();
  const resend = useResendInvite();
  const [dialog, setDialog] = useState<'edit' | 'clients' | 'deactivate' | null>(null);

  if (person.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-16 w-2/3" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (person.isError) return <ErrorState error={person.error} onRetry={() => void person.refetch()} />;
  if (!person.data) {
    return (
      <EmptyState
        icon={UserRound}
        title="Videographer not found"
        action={
          <Button asChild variant="secondary">
            <Link to="/admin/videographers">Back to videographers</Link>
          </Button>
        }
      />
    );
  }

  const p = person.data;
  const info = accounts.data?.get(p.id);
  const state = accountState(p, info);
  const firstName = p.full_name.split(' ')[0] ?? p.full_name;

  return (
    <>
      <BackLink to="/admin/videographers">Videographers</BackLink>
      <PageHeader
        leading={
          <span aria-hidden>
            <UserAvatar name={p.full_name} src={p.avatar_url} className="h-14 w-14 text-lg" />
          </span>
        }
        title={p.full_name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{p.email}</span>
            <AccountChip state={state} />
          </span>
        }
        actions={
          <>
            {p.is_active && (
              <Button asChild>
                <Link to={`/admin/plans?month=${month}&vid=${p.id}`}>
                  <CalendarRange /> Plan {formatMonth(month, 'MMMM')}
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" size="icon" aria-label="More actions">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setDialog('edit')}>
                  <Pencil /> Edit details
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDialog('clients')}>
                  <Building /> Manage clients
                </DropdownMenuItem>
                {state === 'pending' && (
                  <DropdownMenuItem
                    onSelect={() =>
                      resend.mutate(p.id, {
                        onSuccess: () => toast.success(`Invite re-sent to ${p.email}`),
                        onError: (e) => toast.error(friendlyError(e)),
                      })
                    }
                  >
                    <MailPlus /> Resend invite
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {p.is_active ? (
                  <DropdownMenuItem onSelect={() => setDialog('deactivate')} className="text-danger-text focus:text-danger-text">
                    <UserX /> Deactivate
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onSelect={() =>
                      setActive.mutate(
                        { id: p.id, active: true },
                        {
                          onSuccess: () => toast.success(`${firstName} can sign in again`),
                          onError: (e) => toast.error(friendlyError(e)),
                        },
                      )
                    }
                  >
                    <UserCheck /> Reactivate
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Tabs value={tab} onValueChange={(v) => setTab(v as (typeof TABS)[number])}>
        <div className="-mx-4 overflow-x-auto px-4 pb-1 scrollbar-thin sm:mx-0 sm:px-0">
          <TabsList>
            <TabsTrigger value="overview">
              <LayoutDashboard aria-hidden /> Overview
            </TabsTrigger>
            <TabsTrigger value="plan">
              <ListChecks aria-hidden /> Plan & tasks
            </TabsTrigger>
            <TabsTrigger value="submissions">
              <Send aria-hidden /> Submissions
            </TabsTrigger>
            <TabsTrigger value="assessments">
              <Award aria-hidden /> Assessments
            </TabsTrigger>
            <TabsTrigger value="sheet">
              <FileSpreadsheet aria-hidden /> Sheet
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="overview">
          <OverviewTab person={p} lastSignIn={info?.lastSignInAt ?? null} month={month} onManageClients={() => setDialog('clients')} />
        </TabsContent>
        <TabsContent value="plan">
          <PlanTab person={p} month={month} onMonthChange={setMonth} />
        </TabsContent>
        <TabsContent value="submissions">
          <SubmissionsTab id={p.id} firstName={firstName} />
        </TabsContent>
        <TabsContent value="assessments">
          <AssessmentsTab id={p.id} month={month} firstName={firstName} />
        </TabsContent>
        <TabsContent value="sheet">
          <SheetTab id={p.id} firstName={firstName} />
        </TabsContent>
      </Tabs>

      <EditDetailsDialog open={dialog === 'edit'} onOpenChange={(o) => !o && setDialog(null)} profile={p} />
      <ManageClientsDialog
        open={dialog === 'clients'}
        onOpenChange={(o) => !o && setDialog(null)}
        videographerId={p.id}
        name={firstName}
        current={p.clients.map((c) => c.id)}
      />
      <ConfirmDialog
        open={dialog === 'deactivate'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={`Deactivate ${p.full_name}?`}
        description={
          <div className="space-y-2">
            <p>{firstName} is signed out and can’t sign in again until you reactivate them.</p>
            <p>Their tasks, submissions and published scores are kept. They disappear from this month’s live standings and from pickers for new work.</p>
          </div>
        }
        confirmLabel="Deactivate"
        destructive
        loading={setActive.isPending}
        onConfirm={() =>
          setActive.mutate(
            { id: p.id, active: false },
            {
              onSuccess: () => {
                toast.success(`${firstName} has been deactivated`);
                setDialog(null);
              },
              onError: (e) => toast.error(friendlyError(e)),
            },
          )
        }
      />
    </>
  );
}

function OverviewTab({ person: p, lastSignIn, month, onManageClients }: { person: Videographer; lastSignIn: string | null; month: string; onManageClients: () => void }) {
  const stats = useCrewMonth(month);
  const s = stats.data?.get(p.id) ?? emptySummary();
  const pct = s.total ? Math.round((s.approved / s.total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Contact</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <DetailRow icon={Mail} label="Email">
                <a href={`mailto:${p.email}`} className="hover:text-primary-text hover:underline">
                  {p.email}
                </a>
              </DetailRow>
              <DetailRow icon={Phone} label="Phone">
                {p.phone ? (
                  <a href={`tel:${p.phone.replace(/[^0-9+]/g, '')}`} className="tabular hover:text-primary-text hover:underline">
                    {p.phone}
                  </a>
                ) : (
                  <span className="text-muted-foreground">Not set</span>
                )}
              </DetailRow>
              <DetailRow icon={MapPin} label="Base location">
                {p.base_location ?? <span className="text-muted-foreground">Not set</span>}
              </DetailRow>
              <DetailRow icon={Clock} label="Last signed in">
                {lastSignIn ? <span title={formatDateTime(lastSignIn)}>{timeAgo(lastSignIn)}</span> : <span className="text-muted-foreground">Never</span>}
              </DetailRow>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2">
              <Building className="h-4 w-4 text-violet-text" aria-hidden /> Clients
            </CardTitle>
            <Button variant="secondary" size="sm" onClick={onManageClients}>
              Manage
            </Button>
          </CardHeader>
          <CardContent>
            {p.clients.length === 0 ? (
              <p className="text-sm text-muted-foreground">No clients assigned yet.</p>
            ) : (
              <ul className="space-y-1">
                {p.clients.map((c) => (
                  <li key={c.id}>
                    <Link to={`/admin/clients/${c.id}`} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-2">
                      <ClientLogo name={c.name} src={c.logo_url} className="h-8 w-8 rounded-md text-[11px]" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{c.name}</span>
                        {c.city && <span className="block truncate text-xs text-muted-foreground">{c.city}</span>}
                      </span>
                      {!c.is_active && <span className="text-xs text-muted-foreground">Archived</span>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6 lg:col-span-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle>{formatMonth(month)}</CardTitle>
            <PlanStatusChip status={s.planStatus} />
          </CardHeader>
          <CardContent>
            {stats.isPending ? (
              <Skeleton className="h-24" />
            ) : s.total === 0 ? (
              <p className="text-sm text-muted-foreground">No tasks planned for this month.</p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Metric label="Tasks" value={s.total} />
                  <Metric label="Approved" value={s.approved} />
                  <Metric label="To review" value={s.submitted} tone={s.submitted ? 'info' : undefined} />
                  <Metric label="Overdue" value={s.overdue} tone={s.overdue ? 'warning' : undefined} />
                </dl>
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className="text-muted-foreground">Points earned</span>
                    <span className="tabular">
                      <span className="font-semibold text-primary-text">{s.points}</span>
                      <span className="text-muted-foreground"> / {s.maxPoints}</span>
                    </span>
                  </div>
                  <Progress value={s.maxPoints ? (s.points / s.maxPoints) * 100 : 0} aria-label="Points earned" />
                  <p className="mt-2 text-xs text-muted-foreground">{pct}% of tasks approved</p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-violet-text" aria-hidden /> Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityFeed videographerId={p.id} limit={10} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone?: 'info' | 'warning' }) {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40 px-3 py-2.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn('tabular mt-0.5 font-display text-2xl font-semibold', tone === 'info' && 'text-info-text', tone === 'warning' && 'text-warning-text')}>
        {value}
      </dd>
    </div>
  );
}

function PlanTab({ person: p, month, onMonthChange }: { person: Videographer; month: string; onMonthChange: (m: string) => void }) {
  const plan = usePlan(p.id, month);
  const tasks = usePlanTasks(p.id, month);

  return (
    <Card>
      <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <CardTitle>{formatMonth(month)}</CardTitle>
          {!plan.isPending && <PlanStatusChip status={plan.data?.status ?? null} />}
        </div>
        <div className="flex flex-wrap gap-2">
          <MonthPicker value={month} onChange={onMonthChange} />
          <Button asChild variant="secondary">
            <Link to={`/admin/plans?month=${month}&vid=${p.id}`}>Open plan builder</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {plan.data?.summary && <p className="mb-4 whitespace-pre-line text-sm text-muted-foreground">{plan.data.summary}</p>}
        {tasks.isPending ? (
          <Skeleton className="h-40 rounded-lg" />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : tasks.data.length === 0 ? (
          <EmptyState icon={ListChecks} title="No tasks this month" description="Open the plan builder to add some." className="py-10" />
        ) : (
          <TaskList tasks={tasks.data} />
        )}
      </CardContent>
    </Card>
  );
}

function SubmissionsTab({ id, firstName }: { id: string; firstName: string }) {
  const subs = useVideographerSubmissions(id);
  if (subs.isPending) return <Skeleton className="h-60 rounded-xl" />;
  if (subs.isError) return <ErrorState error={subs.error} onRetry={() => void subs.refetch()} />;
  if (subs.data.length === 0) {
    return <EmptyState icon={Send} title="No submissions yet" description={`${firstName}’s deliverables will show up here as they hand work in.`} />;
  }
  return (
    <ul className="space-y-3">
      {subs.data.map((s) => (
        <li key={s.id}>
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <Link to={`/admin/tasks/${s.task.id}`} className="font-medium hover:text-primary-text">
                {s.task.title}
              </Link>
              <StatusChip status={s.task.status} />
              <span className="text-sm text-muted-foreground">
                {s.task.client?.name} · v{s.version} · {formatDateTime(s.submitted_at, 'd MMM, h:mm a')}
              </span>
              {s.version === 1 && (
                <span className={cn('text-xs font-medium', s.is_on_time ? 'text-success-text' : 'text-warning-text')}>{s.is_on_time ? 'On time' : 'Late'}</span>
              )}
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {s.links.map((l) => (
                <LinkPreviewCard key={l} url={l} />
              ))}
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}

function AssessmentsTab({ id, month, firstName }: { id: string; month: string; firstName: string }) {
  const list = usePersonAssessments(id);
  if (list.isPending) return <Skeleton className="h-48 rounded-xl" />;
  if (list.isError) return <ErrorState error={list.error} onRetry={() => void list.refetch()} />;
  const hasMonth = list.data.some((a) => toMonthKey(a.month) === month);
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle>Monthly assessments</CardTitle>
        {!hasMonth && (
          <Button asChild size="sm">
            <Link to={`/admin/assessments/${id}/${month}`}>
              <Award /> Assess {formatMonth(month, 'MMMM')}
            </Link>
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {list.data.length === 0 ? (
          <p className="text-sm text-muted-foreground">{firstName} hasn’t been assessed yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {list.data.map((a) => (
              <li key={a.id}>
                <Link to={`/admin/assessments/${id}/${toMonthKey(a.month)}`} className="flex min-h-12 items-center gap-3 py-2 hover:text-primary-text">
                  <span className="flex-1 text-sm font-medium">{formatMonth(toMonthKey(a.month))}</span>
                  <AssessmentStateChip state={assessmentState(a)} />
                  <span className="tabular w-16 text-right font-display font-semibold">{Number(a.total_score).toFixed(2)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function SheetTab({ id, firstName }: { id: string; firstName: string }) {
  const configs = useSheetConfigs();
  const c = configs.data?.find((x) => x.videographer_id === id);
  if (configs.isPending) return <Skeleton className="h-40 rounded-xl" />;
  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
          <FileSpreadsheet className="hidden h-6 w-6 shrink-0 text-success-text sm:block" aria-hidden />
          <div className="min-w-0 flex-1 text-sm">
            {c ? (
              <>
                <p className="font-medium">
                  Tab “{c.tab_name}” {c.is_enabled ? '' : '(paused)'}
                </p>
                <p className="text-muted-foreground">
                  {c.last_synced_at ? `Last synced ${timeAgo(c.last_synced_at)}` : 'Not synced yet'}
                  {c.last_error && <span className="block text-danger-text">{c.last_error}</span>}
                </p>
              </>
            ) : (
              <p className="text-muted-foreground">{firstName} doesn’t have a Google Sheet yet. They can always use the app instead.</p>
            )}
          </div>
          <div className="flex gap-2">
            {c && (
              <Button asChild variant="secondary">
                <a href={sheetUrl(c.spreadsheet_id)} target="_blank" rel="noopener noreferrer">
                  Open sheet
                </a>
              </Button>
            )}
            <Button asChild variant={c ? 'ghost' : 'default'}>
              <Link to="/admin/settings?tab=sheets">{c ? 'Manage' : 'Connect a sheet'}</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
      {c && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Recent sync activity</CardTitle>
          </CardHeader>
          <CardContent>
            <SyncEventList problemsOnly={false} videographerId={id} limit={20} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
