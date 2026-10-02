import { useState } from 'react';
import { ExternalLink } from 'lucide-react';

import { LinkPreviewCard } from '@/components/LinkPreviewCard';
import { embedUrl, parseLink } from '@/lib/links';
import { cn } from '@/lib/utils';

/**
 * Inline player for YouTube / Vimeo / Drive / Instagram links; anything else
 * (or a provider that refuses embedding) falls back to a preview card.
 */
export function VideoEmbed({ url, title, className }: { url: string; title: string; className?: string }) {
  const parsed = parseLink(url);
  const src = parsed ? embedUrl(parsed) : undefined;
  const [loaded, setLoaded] = useState(false);

  if (!src) return <LinkPreviewCard url={url} className={className} />;

  const tall = parsed?.provider === 'instagram';
  return (
    <div className={cn('space-y-2', className)}>
      <div className={cn('relative overflow-hidden rounded-lg border border-border bg-black', tall ? 'mx-auto aspect-[9/14] max-w-sm' : 'aspect-video')}>
        {!loaded && <div className="absolute inset-0 animate-pulse bg-surface-2" aria-hidden />}
        <iframe
          src={src}
          title={title}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full"
        />
      </div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary-text hover:underline"
      >
        Open on {parsed?.providerLabel} <ExternalLink className="h-3 w-3" aria-hidden />
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}
