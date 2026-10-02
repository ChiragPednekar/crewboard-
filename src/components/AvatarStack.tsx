import { UserAvatar } from '@/components/UserAvatar';
import { cn } from '@/lib/utils';

interface Person {
  id: string;
  full_name: string;
  avatar_url: string | null;
}

/** Overlapping avatars with a "+N" overflow; names are announced for screen readers. */
export function AvatarStack({ people, max = 4, className }: { people: Person[]; max?: number; className?: string }) {
  if (people.length === 0) return <span className={cn('text-xs text-muted-foreground', className)}>No crew assigned</span>;
  const shown = people.slice(0, max);
  const extra = people.length - shown.length;
  return (
    <div className={cn('flex items-center', className)} title={people.map((p) => p.full_name).join(', ')}>
      <span className="sr-only">{people.map((p) => p.full_name).join(', ')}</span>
      <div className="flex -space-x-2" aria-hidden>
        {shown.map((p) => (
          <UserAvatar key={p.id} name={p.full_name} src={p.avatar_url} className="h-7 w-7 text-[11px] ring-2 ring-surface" />
        ))}
        {extra > 0 && (
          <span className="tabular grid h-7 w-7 place-items-center rounded-full bg-surface-2 text-[11px] font-semibold text-muted-foreground ring-2 ring-surface">
            +{extra}
          </span>
        )}
      </div>
    </div>
  );
}
