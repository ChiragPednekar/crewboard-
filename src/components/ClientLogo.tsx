import { useState } from 'react';

import { initials } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';

/** Client logo on a neutral tile, falling back to initials. */
export function ClientLogo({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <span
      className={cn(
        'grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg border border-border bg-surface-2 font-display text-sm font-semibold text-muted-foreground',
        className,
      )}
      aria-hidden
    >
      {src && !failed ? (
        <img src={src} alt="" className="h-full w-full bg-white object-contain p-1" onError={() => setFailed(true)} />
      ) : (
        initials(name)
      )}
    </span>
  );
}
