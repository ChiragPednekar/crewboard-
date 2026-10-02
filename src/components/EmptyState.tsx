import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  tone?: 'default' | 'violet';
  /** Heading level; h2 by default so it never skips a level under the page's h1. */
  as?: 'h2' | 'h3';
}

export function EmptyState({ icon: Icon, title, description, action, className, tone = 'default', as: Heading = 'h2' }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-xl border border-dashed border-border/80 px-6 py-14 text-center',
        className,
      )}
    >
      <div
        className={cn(
          'relative mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-surface-2',
          tone === 'violet' ? 'text-violet-text' : 'text-primary-text',
        )}
      >
        <div
          className={cn(
            'absolute inset-0 rounded-2xl opacity-60 blur-xl',
            tone === 'violet' ? 'bg-violet/20' : 'bg-primary/15',
          )}
          aria-hidden
        />
        <Icon className="relative h-6 w-6" aria-hidden />
      </div>
      <Heading className="font-display text-lg font-semibold">{title}</Heading>
      {description && <p className="mt-1.5 max-w-md text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
