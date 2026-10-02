import { ChevronRight, Paperclip } from 'lucide-react';
import { Link } from 'react-router';

import { PriorityChip } from '@/components/Chips';
import { ClientLogo } from '@/components/ClientLogo';
import { StatusChip } from '@/components/StatusChip';
import { dueLabel, formatDate, isOverdue } from '@/lib/dates';
import { cn } from '@/lib/utils';

import type { CrewTask } from './api';

/** One task in the videographer's list: big tap target, due date first. */
export function CrewTaskCard({ task: t }: { task: CrewTask }) {
  const overdue = isOverdue(t.due_date, t.status);
  const open = !['submitted', 'approved', 'cancelled'].includes(t.status);
  return (
    <Link
      to={`/me/tasks/${t.id}`}
      className={cn(
        'group flex items-center gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-soft transition-[border-color,box-shadow] hover:border-primary/40 hover:shadow-lift sm:p-4',
        t.status === 'revision_requested' && 'border-danger/40',
      )}
    >
      <ClientLogo name={t.client?.name ?? '?'} src={t.client?.logo_url} className="hidden h-11 w-11 sm:grid" />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate font-medium', t.status === 'cancelled' && 'text-muted-foreground line-through decoration-1')}>{t.title}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {t.client?.name} · {t.category?.name}
          {t.refs_count > 0 && (
            <span className="ml-1.5 inline-flex items-center gap-0.5 align-middle">
              <Paperclip className="h-3 w-3" aria-hidden />
              {t.refs_count}
              <span className="sr-only"> references</span>
            </span>
          )}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusChip status={t.status} overdue={overdue} />
          <PriorityChip priority={t.priority} />
          <span className={cn('text-xs', overdue ? 'font-medium text-warning-text' : 'text-muted-foreground')}>
            {open ? dueLabel(t.due_date) : `Due ${formatDate(t.due_date, 'd MMM')}`}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-right">
        <span className="tabular text-sm">
          {t.status === 'approved' ? (
            <>
              <span className="font-semibold text-primary-text">{t.points_awarded}</span>
              <span className="text-muted-foreground">/{t.max_points}</span>
            </>
          ) : (
            <span className="text-muted-foreground">{t.max_points} pts</span>
          )}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
    </Link>
  );
}
