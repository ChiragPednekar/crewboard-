import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Camera, CalendarDays, Flag, Palmtree } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth } from '@/features/auth/AuthProvider';
import { LEAVE_KIND_LABEL, type LeaveKind, useApprovedLeave } from '@/features/leave/api';
import { useCrewOptions } from '@/features/lookups/api';
import { useMonthParam } from '@/hooks/useSearchParamState';
import { formatDate, monthBounds, todayKey } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

import { type CalendarEvent, type CalendarTask, eventsByDay, monthGrid } from './calendar';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function useCalendarTasks(from: string, to: string) {
  return useQuery({
    queryKey: ['tasks', 'calendar', from, to],
    queryFn: async (): Promise<CalendarTask[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, shoot_date, videographer:profiles!tasks_videographer_id_fkey(id, full_name, avatar_url), client:clients(name)')
        .neq('status', 'cancelled')
        .or(`and(shoot_date.gte.${from},shoot_date.lte.${to}),and(due_date.gte.${from},due_date.lte.${to})`)
        .order('due_date');
      if (error) throw error;
      return data as unknown as CalendarTask[];
    },
  });
}

/** Shoot calendar. Staff see everyone (with a person filter); crew see their own month. */
export default function CalendarPage() {
  const { profile } = useAuth();
  const isStaff = profile?.role === 'admin' || profile?.role === 'reviewer';
  const [month, setMonth] = useMonthParam();
  const [person, setPerson] = useState<string>('all');
  const { first, last } = monthBounds(month);
  const weeks = useMemo(() => monthGrid(month), [month]);
  const gridFrom = weeks[0]![0]!.day;
  const gridTo = weeks[weeks.length - 1]![6]!.day;

  const tasks = useCalendarTasks(gridFrom, gridTo);
  const leave = useApprovedLeave(gridFrom, gridTo);
  const crew = useCrewOptions();

  const filteredTasks = (tasks.data ?? []).filter((t) => person === 'all' || t.videographer?.id === person);
  const filteredLeave = (leave.data ?? []).filter((l) => person === 'all' || l.videographer?.id === person);
  const events = useMemo(
    () => eventsByDay(filteredTasks, filteredLeave, weeks.flat().map((d) => d.day)),
    [filteredTasks, filteredLeave, weeks],
  );
  const clashCount = new Set(
    [...events.values()].flat().flatMap((e) => (e.kind === 'shoot' && e.clash ? [e.task.id] : [])),
  ).size;
  const today = todayKey();
  const taskHref = (id: string) => (isStaff ? `/admin/tasks/${id}` : `/me/tasks/${id}`);

  return (
    <>
      <PageHeader
        eyebrow="Schedule"
        title={isStaff ? 'Shoot calendar' : 'My calendar'}
        description={isStaff ? 'Who is shooting where, when work is due, and who is away.' : 'Your shoots, due dates and approved leave.'}
        actions={
          <>
            {isStaff && (
              <Select value={person} onValueChange={setPerson}>
                <SelectTrigger className="w-[200px]" aria-label="Filter by videographer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Everyone</SelectItem>
                  {(crew.data ?? []).filter((c) => c.is_active).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <MonthPicker value={month} onChange={setMonth} />
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
        <Legend icon={Camera} className="text-violet-text">Shoot</Legend>
        <Legend icon={Flag} className="text-primary-text">Due</Legend>
        <Legend icon={Palmtree} className="text-success-text">Leave</Legend>
        {clashCount > 0 && (
          <span className="inline-flex items-center gap-1.5 font-medium text-danger-text">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {clashCount} clashing {clashCount === 1 ? 'shoot' : 'shoots'}
          </span>
        )}
      </div>

      {tasks.isError ? (
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : tasks.isPending || leave.isPending ? (
        <Skeleton className="h-[560px] rounded-xl" />
      ) : (
        <>
          {/* Desktop: month grid */}
          <Card className="hidden overflow-hidden md:block">
            <div className="grid grid-cols-7 border-b border-border bg-surface-2/50 text-xs font-medium text-muted-foreground">
              {WEEKDAYS.map((d) => (
                <div key={d} className="px-3 py-2">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7">
              {weeks.flat().map(({ day, inMonth }) => {
                const list = events.get(day) ?? [];
                return (
                  <div
                    key={day}
                    className={cn(
                      'min-h-[118px] border-b border-r border-border/70 p-1.5 [&:nth-child(7n)]:border-r-0',
                      !inMonth && 'bg-surface-2/30',
                    )}
                  >
                    <p
                      className={cn(
                        'tabular mb-1 inline-grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs',
                        day === today ? 'bg-primary font-semibold text-primary-foreground' : inMonth ? 'text-foreground' : 'text-muted-foreground/60',
                      )}
                    >
                      {Number(day.slice(8))}
                    </p>
                    <ul className="space-y-1">
                      {list.slice(0, 4).map((e, i) => (
                        <li key={`${e.kind}-${i}`}>
                          <EventPill event={e} href={e.kind === 'leave' ? undefined : taskHref(e.task.id)} showPerson={isStaff && person === 'all'} />
                        </li>
                      ))}
                      {list.length > 4 && <li className="px-1 text-[11px] text-muted-foreground">+{list.length - 4} more</li>}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Phone: agenda */}
          <div className="space-y-3 md:hidden">
            {weeks
              .flat()
              .filter(({ day }) => day >= first && day <= last && (events.get(day)?.length ?? 0) > 0)
              .map(({ day }) => (
                <Card key={day} className="p-3">
                  <p className={cn('mb-2 text-sm font-medium', day === today && 'text-primary-text')}>
                    {formatDate(day, 'EEE d MMM')} {day === today && '· today'}
                  </p>
                  <ul className="space-y-1.5">
                    {(events.get(day) ?? []).map((e, i) => (
                      <li key={`${e.kind}-${i}`}>
                        <EventPill event={e} href={e.kind === 'leave' ? undefined : taskHref(e.task.id)} showPerson={isStaff && person === 'all'} large />
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            {![...events.entries()].some(([d, l]) => d >= first && d <= last && l.length > 0) && (
              <EmptyState icon={CalendarDays} title="Nothing scheduled" description="Shoot dates and due dates for this month will show up here." />
            )}
          </div>
        </>
      )}
    </>
  );
}

function Legend({ icon: Icon, className, children }: { icon: typeof Camera; className: string; children: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Icon className={cn('h-3.5 w-3.5', className)} aria-hidden /> {children}
    </span>
  );
}

function EventPill({ event, href, showPerson, large = false }: { event: CalendarEvent; href?: string; showPerson: boolean; large?: boolean }) {
  const base = cn(
    'flex w-full items-center gap-1.5 rounded-md px-1.5 text-left transition-colors',
    large ? 'min-h-10 py-1.5 text-sm' : 'py-0.5 text-[11px] leading-tight',
  );
  if (event.kind === 'leave') {
    return (
      <span className={cn(base, 'bg-success/10 text-success-text')}>
        <Palmtree className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">
          {showPerson && event.leave.videographer ? `${event.leave.videographer.full_name.split(' ')[0]} · ` : ''}
          {LEAVE_KIND_LABEL[event.leave.kind as LeaveKind] ?? 'Away'}
        </span>
      </span>
    );
  }
  const t = event.task;
  const isShoot = event.kind === 'shoot';
  const clash = isShoot && event.clash;
  const pill = (
    <Link
      to={href ?? '#'}
      className={cn(
        base,
        isShoot ? 'bg-violet/12 text-violet-text hover:bg-violet/20' : 'bg-primary/10 text-primary-text hover:bg-primary/20',
        clash && 'ring-1 ring-inset ring-danger',
        t.status === 'approved' && 'opacity-60',
      )}
    >
      {clash ? (
        <AlertTriangle className="h-3 w-3 shrink-0 text-danger-text" aria-label="Clash" />
      ) : isShoot ? (
        <Camera className="h-3 w-3 shrink-0" aria-hidden />
      ) : (
        <Flag className="h-3 w-3 shrink-0" aria-hidden />
      )}
      {showPerson && t.videographer && large && <UserAvatar name={t.videographer.full_name} src={t.videographer.avatar_url} className="h-5 w-5 text-[8px]" />}
      <span className="truncate">
        {showPerson && t.videographer && !large ? `${t.videographer.full_name.split(' ')[0]} · ` : ''}
        {t.title}
      </span>
    </Link>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>{pill}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="font-medium">{t.title}</p>
        <p className="text-xs text-muted-foreground">
          {isShoot ? 'Shoot' : 'Due'} · {t.client?.name}
          {t.videographer ? ` · ${t.videographer.full_name}` : ''}
        </p>
        {clash && <p className="mt-1 text-xs text-danger-text">Clashes with another shoot or approved leave</p>}
      </TooltipContent>
    </Tooltip>
  );
}
