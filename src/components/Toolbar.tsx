import type { ReactNode } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { Link } from 'react-router';

import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="pl-9" />
    </div>
  );
}

/** A small set of mutually exclusive filters (Active / Archived / All). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  fill = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  label: string;
  /** Stretch to the container width, splitting it evenly between options. */
  fill?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('inline-flex h-10 items-center gap-1 rounded-lg border border-border/60 bg-surface-2/70 p-1', fill && 'flex w-full [&>button]:flex-1 [&>button]:justify-center')}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
            value === o.value && 'bg-surface text-foreground shadow-soft',
          )}
        >
          {o.label}
          {o.count !== undefined && <span className="tabular text-xs text-muted-foreground">{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="mb-4 inline-flex h-9 items-center gap-1.5 rounded-lg pr-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden />
      {children}
    </Link>
  );
}

/** Label/value pair used in detail cards (inside a <dl>; dt/dd are direct children of the row div). */
export function DetailRow({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: ReactNode }) {
  return (
    <div className="py-2.5">
      <dt className="flex items-center gap-3 text-xs text-muted-foreground">
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        {label}
      </dt>
      <dd className="mt-0.5 break-words pl-7 text-sm">{children}</dd>
    </div>
  );
}
