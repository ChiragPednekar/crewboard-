import { cn } from '@/lib/utils';

/** CrewBoard mark: a camera body with a lens hood, in amber. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('h-8 w-8', className)}>
      <rect width="32" height="32" rx="9" className="fill-surface-2" />
      <rect x="0.5" y="0.5" width="31" height="31" rx="8.5" className="fill-none stroke-border" />
      <path d="M8 11.5A2.5 2.5 0 0 1 10.5 9h7a2.5 2.5 0 0 1 2.5 2.5v9a2.5 2.5 0 0 1-2.5 2.5h-7A2.5 2.5 0 0 1 8 20.5z" className="fill-primary" />
      <path d="m21.5 14 3.5-2.2v8.4L21.5 18z" className="fill-primary" opacity=".65" />
      <circle cx="14" cy="16" r="2.4" className="fill-background" opacity=".85" />
    </svg>
  );
}

export function Logo({ collapsed = false, className }: { collapsed?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {!collapsed && (
        <span className="font-display text-[17px] font-semibold tracking-tight">
          Crew<span className="text-primary-text">Board</span>
        </span>
      )}
    </span>
  );
}
