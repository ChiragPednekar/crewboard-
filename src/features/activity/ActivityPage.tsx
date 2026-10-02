import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useCrewOptions } from '@/features/lookups/api';
import { useEnumParam } from '@/hooks/useSearchParamState';
import { formatDateTime } from '@/lib/dates';

import { describe } from './ActivityFeed';
import { ACTIVITY_KINDS, type ActivityKind, useActivity } from './api';

const PAGE = 40;
const KINDS = Object.keys(ACTIVITY_KINDS) as ActivityKind[];

/** Where an activity row leads, when it is about something with its own page. */
function linkFor(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  if (entityType === 'task') return `/admin/tasks/${entityId}`;
  if (entityType === 'client') return `/admin/clients/${entityId}`;
  if (entityType === 'profile') return `/admin/videographers/${entityId}`;
  return null;
}

export default function ActivityPage() {
  const crew = useCrewOptions();
  const [kind, setKind] = useEnumParam('kind', KINDS, 'all');
  const [who, setWho] = useState('all');
  const [limit, setLimit] = useState(PAGE);
  const log = useActivity({ kind, videographerId: who === 'all' ? undefined : who }, limit);
  const rows = log.data ?? [];

  return (
    <>
      <PageHeader title="Activity" description="Everything that happened, newest first — in the app, from the Sheet sync, or by the system." />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row">
        <Select
          value={kind}
          onValueChange={(v) => {
            setKind(v as ActivityKind);
            setLimit(PAGE);
          }}
        >
          <SelectTrigger className="sm:w-60" aria-label="Kind of activity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {ACTIVITY_KINDS[k].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={who}
          onValueChange={(v) => {
            setWho(v);
            setLimit(PAGE);
          }}
        >
          <SelectTrigger className="sm:w-60" aria-label="Videographer">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Whole team</SelectItem>
            {(crew.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {log.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ) : log.isError ? (
        <ErrorState error={log.error} onRetry={() => void log.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing here yet" description="Try another filter." />
      ) : (
        <>
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-border">
              {rows.map((e) => {
                const { icon: Icon, text } = describe(e, true);
                const href = linkFor(e.entity_type, e.entity_id);
                const who = e.actor?.full_name ?? (e.actor_kind === 'sheet' ? 'Google Sheet' : 'System');
                const body = (
                  <>
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2 text-muted-foreground">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{text}</span>
                      <span className="block text-xs text-muted-foreground">{who}</span>
                    </span>
                    <time dateTime={e.created_at} className="tabular shrink-0 text-xs text-muted-foreground">
                      {formatDateTime(e.created_at, 'd MMM, h:mm a')}
                    </time>
                  </>
                );
                return (
                  <li key={e.id}>
                    {href ? (
                      <Link to={href} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3">{body}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
          {rows.length >= limit && (
            <div className="mt-4 flex justify-center">
              <Button variant="secondary" loading={log.isFetching} onClick={() => setLimit((l) => l + PAGE)}>
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
