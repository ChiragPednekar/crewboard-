import { useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Sparkles, Star } from 'lucide-react';

import { ClientLogo } from '@/components/ClientLogo';
import { UserAvatar } from '@/components/UserAvatar';
import { VideoEmbed } from '@/components/VideoEmbed';
import type { FeaturedItem } from '@/features/leaderboard/api';
import { formatMonth } from '@/lib/dates';
import { embedUrl, parseLink } from '@/lib/links';
import { cn } from '@/lib/utils';

import { WorkThumb } from './WorkThumb';

function playable(item: FeaturedItem): boolean {
  const first = item.links?.[0] ? parseLink(item.links[0]) : null;
  return Boolean(first && embedUrl(first));
}

/** 16:9 still that turns into the player when clicked (or opens the link if it can't embed). */
function Player({ item, large }: { item: FeaturedItem; large?: boolean }) {
  const [playing, setPlaying] = useState(false);
  const url = item.links?.[0];
  if (playing && url) return <VideoEmbed url={url} title={item.title} />;
  const canEmbed = playable(item);
  const label = `Play ${item.title}`;
  const inner = (
    <>
      <WorkThumb thumbnailPath={item.thumbnail_path} links={item.links} className="absolute inset-0" />
      <span className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" aria-hidden />
      <span
        className={cn(
          'absolute left-1/2 top-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-primary-foreground shadow-glow transition-transform group-hover:scale-105',
          large ? 'h-16 w-16' : 'h-11 w-11',
        )}
        aria-hidden
      >
        <Play className={cn('translate-x-0.5 fill-current', large ? 'h-7 w-7' : 'h-5 w-5')} />
      </span>
    </>
  );
  const cls = 'group relative block aspect-video w-full overflow-hidden rounded-lg border border-border';
  if (!url) return <div className={cls}>{inner}</div>;
  return canEmbed ? (
    <button type="button" onClick={() => setPlaying(true)} className={cls} aria-label={label}>
      {inner}
    </button>
  ) : (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls} aria-label={`${label} (opens in a new tab)`}>
      {inner}
    </a>
  );
}

function Credits({ item, compact }: { item: FeaturedItem; compact?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="inline-flex items-center gap-2">
        <UserAvatar name={item.videographer_name} src={item.videographer_avatar_url} className={compact ? 'h-6 w-6 text-[10px]' : 'h-8 w-8 text-xs'} />
        <span className="font-medium">{item.videographer_name}</span>
      </span>
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <ClientLogo name={item.client_name} src={item.client_logo_url} className="h-6 w-6 rounded-md text-[9px]" />
        {item.client_name}
      </span>
      {item.quality_rating && !compact && (
        <span className="inline-flex items-center gap-0.5 text-gold-text" role="img" aria-label={`${item.quality_rating} out of 5 stars`}>
          {Array.from({ length: item.quality_rating }, (_, i) => (
            <Star key={i} className="h-3.5 w-3.5 fill-current" aria-hidden />
          ))}
        </span>
      )}
    </div>
  );
}

export function BestWork({ items, month }: { items: FeaturedItem[]; month: string }) {
  const best = items.find((i) => i.rank === 1);
  const runners = items.filter((i) => i.rank !== 1);
  return (
    <div className="space-y-6">
      {best && (
        <motion.article
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 gap-5 overflow-hidden rounded-xl border border-gold/30 bg-surface p-4 shadow-soft studio-glow sm:p-5 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:items-center"
          aria-labelledby="best-work-title"
        >
          <Player item={best} large />
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.14em] text-gold-text">
              <Sparkles className="h-3.5 w-3.5" aria-hidden /> Best work of {formatMonth(month, 'MMMM')}
            </p>
            <h3 id="best-work-title" className="mt-2 font-display text-xl font-semibold leading-tight sm:text-2xl">
              {best.title}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">{best.category}</p>
            {best.reason && <blockquote className="mt-4 border-l-2 border-gold/60 pl-3 text-sm leading-relaxed">{best.reason}</blockquote>}
            <div className="mt-5">
              <Credits item={best} />
            </div>
          </div>
        </motion.article>
      )}
      {runners.length > 0 && (
        <div>
          <h3 className="mb-3 text-sm font-medium text-muted-foreground">Runners-up</h3>
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {runners.map((r, i) => (
              <motion.li
                key={r.task_id}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06 }}
                className="rounded-xl border border-border bg-surface p-3 shadow-soft"
              >
                <Player item={r} />
                <div className="px-1 pb-1 pt-3">
                  <p className="font-medium leading-snug">{r.title}</p>
                  {r.reason && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.reason}</p>}
                  <div className="mt-3">
                    <Credits item={r} compact />
                  </div>
                </div>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
