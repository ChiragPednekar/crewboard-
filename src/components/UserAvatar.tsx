import type React from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase() || '?';
}

// Deterministic, muted hues so each person keeps the same colour everywhere.
const HUES = [37, 247, 155, 200, 320, 15, 275, 175];
function hueFor(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return HUES[h % HUES.length] ?? 37;
}

interface UserAvatarProps {
  name: string;
  src?: string | null;
  className?: string;
  ring?: 'gold' | 'silver' | 'bronze' | 'none';
  /**
   * Avatars almost always sit next to the person's visible name, so they are hidden from
   * screen readers by default. Set when the avatar stands alone and must name the person.
   */
  labelled?: boolean;
}

export function UserAvatar({ name, src, className, ring = 'none', labelled = false }: UserAvatarProps) {
  const hue = hueFor(name);
  return (
    <Avatar
      aria-hidden={labelled ? undefined : true}
      role={labelled ? 'img' : undefined}
      aria-label={labelled ? name : undefined}
      className={cn(
        'h-9 w-9 shrink-0',
        ring === 'gold' && 'ring-2 ring-gold ring-offset-2 ring-offset-background',
        ring === 'silver' && 'ring-2 ring-silver ring-offset-2 ring-offset-background',
        ring === 'bronze' && 'ring-2 ring-bronze ring-offset-2 ring-offset-background',
        className,
      )}
    >
      {src && <AvatarImage src={src} alt="" className="object-cover" />}
      <AvatarFallback
        className="avatar-fallback font-display text-[0.8em] font-semibold"
        style={{ '--avatar-h': hue } as React.CSSProperties}
      >
        <span aria-hidden>{initials(name)}</span>
      </AvatarFallback>
    </Avatar>
  );
}
