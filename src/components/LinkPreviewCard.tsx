import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Camera, CirclePlay, Cloud, Droplets, ExternalLink, Film, Link2, Send, type LucideIcon } from 'lucide-react';

import { fetchLinkMeta } from '@/lib/linkMeta';
import { asLinkMeta, derivedThumbnail, type LinkProvider, parseLink } from '@/lib/links';
import { cn } from '@/lib/utils';

const PROVIDER_ICON: Record<LinkProvider, LucideIcon> = {
  youtube: CirclePlay,
  vimeo: Film,
  drive: Cloud,
  dropbox: Droplets,
  instagram: Camera,
  frameio: Film,
  wetransfer: Send,
  other: Link2,
};

interface LinkPreviewCardProps {
  url: string;
  meta?: unknown;
  title?: string | null;
  actions?: ReactNode;
  className?: string;
  /** Fetch title/thumbnail when none is stored (cached per URL). Turn off while a link is being typed. */
  autoMeta?: boolean;
}

/** A reference or deliverable link with its thumbnail (16:9), title and provider. */
export function LinkPreviewCard({ url, meta, title, actions, className, autoMeta = true }: LinkPreviewCardProps) {
  const parsed = parseLink(url);
  const stored = asLinkMeta(meta);
  const fetched = useQuery({
    queryKey: ['link-meta', url],
    enabled: autoMeta && !stored.title && !stored.thumbnail && Boolean(parsed),
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    queryFn: () => fetchLinkMeta(url),
  });
  const m = stored.title || stored.thumbnail ? stored : { ...stored, ...fetched.data };
  const [imgFailed, setImgFailed] = useState(false);
  const thumb = !imgFailed ? (m.thumbnail ?? (parsed ? derivedThumbnail(parsed) : undefined)) : undefined;
  const Icon = PROVIDER_ICON[parsed?.provider ?? 'other'];
  const heading = title || m.title || parsed?.hostname || url;
  const sub = [parsed?.providerLabel, m.author].filter(Boolean).join(' · ');

  return (
    <div className={cn('group relative flex gap-3 rounded-lg border border-border bg-surface-2/40 p-2 transition-colors hover:border-primary/40', className)}>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-surface-2 sm:w-36"
        tabIndex={-1}
        aria-hidden
      >
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setImgFailed(true)} className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-muted-foreground">
            <Icon className="h-6 w-6" />
          </span>
        )}
      </a>
      <div className="flex min-w-0 flex-1 flex-col justify-center py-0.5 pr-1">
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="line-clamp-2 text-sm font-medium leading-snug hover:text-primary-text hover:underline"
        >
          {heading}
          <ExternalLink className="ml-1 inline h-3 w-3 align-baseline opacity-60" aria-hidden />
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
        <p className="mt-1 flex items-center gap-1.5 truncate text-xs text-muted-foreground">
          <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{sub || parsed?.hostname}</span>
        </p>
      </div>
      {actions && <div className="flex shrink-0 items-start">{actions}</div>}
    </div>
  );
}
