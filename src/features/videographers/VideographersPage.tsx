import { useMemo, useState } from 'react';
import { AlarmClock, Building, MapPin, SearchX, UserPlus, Users } from 'lucide-react';
import { Link } from 'react-router';

import { AccountChip, PlanStatusChip } from '@/components/Chips';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { MonthPicker } from '@/components/MonthPicker';
import { PageHeader } from '@/components/PageHeader';
import { SearchInput, Segmented } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { useMonthParam } from '@/hooks/useSearchParamState';
import { formatMonth } from '@/lib/dates';

import { accountState, emptySummary, useAccounts, useCrewMonth, useVideographers } from './api';
import { InviteDialog } from './dialogs';

type Show = 'active' | 'deactivated' | 'all';

export default function VideographersPage() {
  const crew = useVideographers();
  const accounts = useAccounts();
  const [month, setMonth] = useMonthParam();
  const monthStats = useCrewMonth(month);
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('active');
  const [inviting, setInviting] = useState(false);

  const counts = useMemo(() => {
    const list = crew.data ?? [];
    return { active: list.filter((p) => p.is_active).length, deactivated: list.filter((p) => !p.is_active).length, all: list.length };
  }, [crew.data]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (crew.data ?? []).filter(
      (p) =>
        (show === 'all' || (show === 'active' ? p.is_active : !p.is_active)) &&
        (!q || `${p.full_name} ${p.email} ${p.base_location ?? ''}`.toLowerCase().includes(q)),
    );
  }, [crew.data, query, show]);

  return (
    <>
      <PageHeader
        title="Videographers"
        description="Your crew, their clients and how this month is going."
        actions={
          <Button onClick={() => setInviting(true)}>
            <UserPlus /> Add videographer
          </Button>
        }
      />

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SearchInput value={query} onChange={setQuery} placeholder="Search by name, email or area" className="lg:max-w-xs lg:flex-1" />
        <Segmented
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { value: 'active', label: 'Active', count: counts.active },
            { value: 'deactivated', label: 'Deactivated', count: counts.deactivated },
            { value: 'all', label: 'All', count: counts.all },
          ]}
        />
        <MonthPicker value={month} onChange={setMonth} className="lg:ml-auto" />
      </div>

      {crew.isPending ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : crew.isError ? (
        <ErrorState error={crew.error} onRetry={() => void crew.refetch()} />
      ) : counts.all === 0 ? (
        <EmptyState
          icon={Users}
          title="No videographers yet"
          description="Invite your crew. Each person gets an email to set their password."
          action={
            <Button onClick={() => setInviting(true)}>
              <UserPlus /> Add your first videographer
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState icon={SearchX} title="Nobody matches" description="Try a different search or filter." />
      ) : (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => {
            const s = monthStats.data?.get(p.id) ?? emptySummary();
            const state = accountState(p, accounts.data?.get(p.id));
            const pct = s.total ? Math.round((s.approved / s.total) * 100) : 0;
            return (
              <li key={p.id}>
                <Card className="group relative flex h-full flex-col p-5 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-lift">
                  <div className="flex items-start gap-3">
                    <UserAvatar name={p.full_name} src={p.avatar_url} className="h-12 w-12 text-base" />
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-display text-base font-semibold">
                        <Link to={`/admin/videographers/${p.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
                          {p.full_name}
                        </Link>
                      </h2>
                      <p className="truncate text-sm text-muted-foreground">{p.email}</p>
                    </div>
                    <AccountChip state={state} />
                  </div>

                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5" aria-hidden /> {p.base_location ?? 'No base set'}
                    </span>
                    <span className="inline-flex items-center gap-1" title={p.clients.map((c) => c.name).join(', ')}>
                      <Building className="h-3.5 w-3.5" aria-hidden />
                      {p.clients.length} {p.clients.length === 1 ? 'client' : 'clients'}
                    </span>
                  </div>

                  <div className="mt-auto pt-5">
                    <div className="rounded-lg border border-border bg-surface-2/40 p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium text-muted-foreground">{formatMonth(month, 'MMMM')}</span>
                        {monthStats.isPending ? <Skeleton className="h-6 w-20 rounded-full" /> : <PlanStatusChip status={s.planStatus} />}
                      </div>
                      {s.total > 0 ? (
                        <>
                          <div className="mt-3 flex items-baseline justify-between text-sm">
                            <span>
                              <span className="tabular font-display text-lg font-semibold">{s.approved}</span>
                              <span className="text-muted-foreground">/{s.total} approved</span>
                            </span>
                            <span className="tabular text-muted-foreground">
                              <span className="font-medium text-primary-text">{s.points}</span>/{s.maxPoints} pts
                            </span>
                          </div>
                          <Progress value={pct} className="mt-2 h-1.5" aria-label={`${pct}% of tasks approved`} />
                          {(s.submitted > 0 || s.overdue > 0) && (
                            <p className="mt-2 flex gap-3 text-xs">
                              {s.submitted > 0 && <span className="text-info-text">{s.submitted} to review</span>}
                              {s.overdue > 0 && (
                                <span className="inline-flex items-center gap-1 text-warning-text">
                                  <AlarmClock className="h-3.5 w-3.5" aria-hidden /> {s.overdue} overdue
                                </span>
                              )}
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="mt-2 text-sm text-muted-foreground">No tasks planned.</p>
                      )}
                    </div>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <InviteDialog open={inviting} onOpenChange={setInviting} />
    </>
  );
}
