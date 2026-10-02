import { useMemo, useState } from 'react';
import { BellOff, CheckCheck } from 'lucide-react';
import { useNavigate } from 'react-router';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Segmented } from '@/components/Toolbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, shiftDay, timeAgo, todayKey } from '@/lib/dates';
import type { Notification } from '@/lib/supabase';
import { cn } from '@/lib/utils';

import { useMarkNotificationsRead, useNotifications } from './api';
import { NotificationIcon } from './NotificationIcon';

/** Today / Yesterday / Earlier, by India calendar day. */
function dayGroup(iso: string, today: string): string {
  const day = formatDateTime(iso, 'yyyy-MM-dd');
  if (day === today) return 'Today';
  if (day === shiftDay(today, -1)) return 'Yesterday';
  return 'Earlier';
}

export default function NotificationsPage() {
  const list = useNotifications(100);
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const [show, setShow] = useState<'all' | 'unread'>('all');
  const unread = (list.data ?? []).filter((n) => !n.read_at).length;

  const groups = useMemo(() => {
    const today = todayKey();
    const items = (list.data ?? []).filter((n) => show === 'all' || !n.read_at);
    const map = new Map<string, Notification[]>();
    for (const n of items) {
      const g = dayGroup(n.created_at, today);
      map.set(g, [...(map.get(g) ?? []), n]);
    }
    return [...map.entries()];
  }, [list.data, show]);

  function open(n: Notification) {
    if (!n.read_at) markRead.mutate([n.id]);
    if (n.link) navigate(n.link);
  }

  return (
    <>
      <PageHeader
        title="Notifications"
        description="New tasks, reviews and results. They also appear live on the bell."
        actions={
          <Button variant="secondary" disabled={unread === 0 || markRead.isPending} onClick={() => markRead.mutate(undefined)}>
            <CheckCheck /> Mark all read
          </Button>
        }
      />
      <div className="mb-5">
        <Segmented
          label="Show"
          value={show}
          onChange={setShow}
          options={[
            { value: 'all', label: 'All' },
            { value: 'unread', label: 'Unread', count: unread },
          ]}
        />
      </div>

      {list.isPending ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={show === 'unread' ? 'You’re all caught up' : 'No notifications yet'}
          description="New tasks, reviews and results will show up here."
        />
      ) : (
        <div className="max-w-3xl space-y-6">
          {groups.map(([label, items]) => (
            <section key={label} aria-labelledby={`notif-${label}`}>
              <h2 id={`notif-${label}`} className="mb-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </h2>
              <Card className="overflow-hidden p-0">
                <ul className="divide-y divide-border">
                  {items.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => open(n)}
                        className={cn(
                          'flex w-full gap-3 px-4 py-3.5 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2',
                          !n.read_at && 'bg-primary/[0.04]',
                        )}
                      >
                        <NotificationIcon type={n.type} />
                        <span className="min-w-0 flex-1">
                          <span className={cn('block text-sm leading-snug', !n.read_at && 'font-medium')}>{n.title}</span>
                          {n.body && <span className="mt-0.5 block text-sm text-muted-foreground">{n.body}</span>}
                          <time dateTime={n.created_at} title={formatDateTime(n.created_at)} className="mt-1 block text-xs text-muted-foreground">
                            {timeAgo(n.created_at)}
                          </time>
                        </span>
                        {!n.read_at && (
                          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary">
                            <span className="sr-only">Unread</span>
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
