import { useMemo, useState } from 'react';
import { ArrowRight, CheckCheck, FileSpreadsheet, Film } from 'lucide-react';
import { Link } from 'react-router';

import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { UserAvatar } from '@/components/UserAvatar';
import { useThumbnailUrl } from '@/features/tasks/api';
import { formatDate, submittedOnTime, timeAgo } from '@/lib/dates';
import { derivedThumbnail, parseLink } from '@/lib/links';
import { cn } from '@/lib/utils';

import { type QueueItem, useReviewQueue } from './api';

export default function ReviewQueuePage() {
  const queue = useReviewQueue();
  const [who, setWho] = useState('all');

  const people = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of queue.data ?? []) if (t.videographer) map.set(t.videographer.id, t.videographer.full_name);
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [queue.data]);
  const items = (queue.data ?? []).filter((t) => who === 'all' || t.videographer?.id === who);

  return (
    <>
      <PageHeader
        title="Review queue"
        description="Submitted work waiting for you, oldest first. Approve with points and a rating, or send it back with feedback."
        actions={
          people.length > 1 && (
            <Select value={who} onValueChange={setWho}>
              <SelectTrigger className="w-52" aria-label="Filter by videographer">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Everyone ({queue.data?.length})</SelectItem>
                {people.map(([id, name]) => (
                  <SelectItem key={id} value={id}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        }
      />

      {queue.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : queue.isError ? (
        <ErrorState error={queue.error} onRetry={() => void queue.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={CheckCheck} title="All caught up" description="Nothing is waiting for review. New submissions appear here and on the bell." />
      ) : (
        <ul className="space-y-3">
          {items.map((t) => (
            <li key={t.id}>
              <QueueCard item={t} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function QueueCard({ item: t }: { item: QueueItem }) {
  const sub = t.submissions[0];
  const [imgFailed, setImgFailed] = useState(false);
  const thumb = useThumbnailUrl(sub?.thumbnail_path ?? null);
  const firstLink = sub?.links[0] ? parseLink(sub.links[0]) : null;
  const image = thumb.data ?? (firstLink ? derivedThumbnail(firstLink) : undefined);
  const late = t.first_submitted_at ? !submittedOnTime(t.first_submitted_at, t.due_date) : false;

  return (
    <Card className="group relative flex flex-col gap-4 p-4 transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-lift sm:flex-row sm:items-center">
      <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-surface-2 sm:w-44">
        {image && !imgFailed ? (
          <img src={image} alt="" className="h-full w-full object-cover" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} />
        ) : (
          <span className="grid h-full w-full place-items-center text-muted-foreground">
            <Film className="h-6 w-6" aria-hidden />
          </span>
        )}
        {sub && sub.version > 1 && (
          <span className="absolute left-2 top-2 rounded-md bg-black/70 px-1.5 py-0.5 text-[11px] font-medium text-white">v{sub.version}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">
          {t.client?.name} · {t.category?.name}
        </p>
        <h2 className="mt-0.5 truncate font-display text-base font-semibold">
          <Link to={`/admin/review/${t.id}`} className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
            {t.title}
          </Link>
        </h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          {t.videographer && (
            <span className="inline-flex items-center gap-1.5">
              <UserAvatar name={t.videographer.full_name} src={t.videographer.avatar_url} className="h-5 w-5 text-[9px]" />
              {t.videographer.full_name}
            </span>
          )}
          {t.last_submitted_at && <span>Submitted {timeAgo(t.last_submitted_at)}</span>}
          <span>Due {formatDate(t.due_date, 'd MMM')}</span>
          {sub?.source === 'sheet' && (
            <span className="inline-flex items-center gap-1">
              <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden /> via Sheet
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
        {late ? (
          <span className="text-xs font-medium text-warning-text">First version late</span>
        ) : (
          <span className={cn('text-xs font-medium text-success-text', !t.first_submitted_at && 'invisible')}>On time</span>
        )}
        <span className="inline-flex items-center gap-1 text-sm font-medium text-primary-text">
          Review <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </span>
      </div>
    </Card>
  );
}
