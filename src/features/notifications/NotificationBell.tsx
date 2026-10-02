import { useState } from 'react';
import { Bell, BellOff, CheckCheck } from 'lucide-react';
import { Link, useNavigate } from 'react-router';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { timeAgo } from '@/lib/dates';
import type { Notification } from '@/lib/supabase';
import { cn } from '@/lib/utils';

import { useMarkNotificationsRead, useNotifications, useUnreadCount } from './api';
import { NotificationIcon } from './NotificationIcon';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const unread = useUnreadCount();
  const list = useNotifications(12);
  const markRead = useMarkNotificationsRead();
  const count = unread.data ?? 0;

  function openNotification(n: Notification) {
    if (!n.read_at) markRead.mutate([n.id]);
    setOpen(false);
    if (n.link) navigate(n.link);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'}
        >
          <Bell />
          {count > 0 && (
            <span className="tabular absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground">
              {count > 9 ? '9+' : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-display text-sm font-semibold">Notifications</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs"
            disabled={count === 0 || markRead.isPending}
            onClick={() => markRead.mutate(undefined)}
          >
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <ScrollArea className="max-h-[420px]">
          {list.isPending ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-9 w-9 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-3/4" />
                    <Skeleton className="h-3 w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : list.data && list.data.length > 0 ? (
            <ul className="divide-y divide-border/60">
              {list.data.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openNotification(n)}
                    className={cn(
                      'flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-2 focus-visible:bg-surface-2',
                      !n.read_at && 'bg-primary/[0.04]',
                    )}
                  >
                    <NotificationIcon type={n.type} />
                    <span className="min-w-0 flex-1">
                      <span className={cn('block text-sm leading-snug', !n.read_at && 'font-medium')}>{n.title}</span>
                      {n.body && <span className="mt-0.5 block truncate text-xs text-muted-foreground">{n.body}</span>}
                      <span className="mt-1 block text-[11px] text-muted-foreground">{timeAgo(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="flex flex-col items-center px-6 py-10 text-center">
              <BellOff className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden />
              <p className="text-sm font-medium">You’re all caught up</p>
              <p className="text-xs text-muted-foreground">New tasks, reviews and results will show up here.</p>
            </div>
          )}
        </ScrollArea>
        <div className="border-t border-border p-2">
          <Button asChild variant="ghost" size="sm" className="w-full">
            <Link to="/notifications" onClick={() => setOpen(false)}>
              View all
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
