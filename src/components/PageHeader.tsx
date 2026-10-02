import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  /** Avatar/logo shown before the title (detail pages). */
  leading?: ReactNode;
  className?: string;
}

export function PageHeader({ title, description, eyebrow, actions, leading, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="flex min-w-0 items-center gap-4">
        {leading}
        <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-xs font-medium uppercase tracking-[0.14em] text-primary-text">{eyebrow}</p>
        )}
        <h1 className="font-display text-2xl font-semibold leading-tight sm:text-[28px]">{title}</h1>
        {description && <div className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
