import { useState } from 'react';
import { Film } from 'lucide-react';

import { useThumbnailUrl } from '@/features/tasks/api';
import { derivedThumbnail, parseLink } from '@/lib/links';
import { cn } from '@/lib/utils';

/** Thumbnail for a piece of work: uploaded still first, then one derived from the link. */
export function WorkThumb({ thumbnailPath, links, className }: { thumbnailPath: string | null; links: string[] | null; className?: string }) {
  const uploaded = useThumbnailUrl(thumbnailPath);
  const first = links?.[0] ? parseLink(links[0]) : null;
  const src = uploaded.data ?? (first ? derivedThumbnail(first) : undefined);
  const [failed, setFailed] = useState(false);
  return (
    <div className={cn('relative overflow-hidden bg-surface-2', className)}>
      {src && !failed ? (
        <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <span className="grid h-full w-full place-items-center text-muted-foreground">
          <Film className="h-8 w-8" aria-hidden />
        </span>
      )}
    </div>
  );
}
