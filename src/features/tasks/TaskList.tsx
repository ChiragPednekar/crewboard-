import { Ban, Ellipsis, ExternalLink, Paperclip, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import { PriorityChip } from '@/components/Chips';
import { StatusChip } from '@/components/StatusChip';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { dueLabel, formatDate, isOverdue } from '@/lib/dates';
import { cn } from '@/lib/utils';

import type { TaskListItem } from './api';
import { canDeleteTask, useTaskActions } from './TaskActions';

interface TaskListProps {
  tasks: TaskListItem[];
  onEdit?: (task: TaskListItem) => void;
  /** Hide row actions (read-only views). */
  readOnly?: boolean;
}

/** Tasks of one plan: stacked cards on phones, a dense table-like list from md up. */
export function TaskList({ tasks, onEdit, readOnly = false }: TaskListProps) {
  const actions = useTaskActions();

  return (
    <>
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="hidden grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_5rem_2.75rem] gap-4 border-b border-border bg-surface-2/50 px-4 py-2.5 text-xs font-medium text-muted-foreground md:grid">
          <span>Task</span>
          <span>Due</span>
          <span>Status</span>
          <span className="text-right">Points</span>
          <span className="sr-only">Actions</span>
        </div>
        <ul className="divide-y divide-border">
          {tasks.map((t) => {
            const cancelled = t.status === 'cancelled';
            const overdue = isOverdue(t.due_date, t.status);
            return (
              <li
                key={t.id}
                className={cn(
                  'relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-2/50 md:grid-cols-[minmax(0,1fr)_7.5rem_9.5rem_5rem_2.75rem] md:gap-4',
                )}
              >
                <div className="min-w-0">
                  <Link
                    to={`/admin/tasks/${t.id}`}
                    className={cn('block truncate text-sm font-medium after:absolute after:inset-0 hover:text-primary-text', cancelled && 'text-muted-foreground line-through decoration-1')}
                  >
                    {t.title}
                  </Link>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="truncate">{t.client?.name ?? 'Unknown client'}</span>
                    <span aria-hidden>·</span>
                    <span>{t.category?.name}</span>
                    {t.refs_count > 0 && (
                      <span className="inline-flex items-center gap-0.5" title={`${t.refs_count} references`}>
                        <Paperclip className="h-3 w-3" aria-hidden />
                        <span className="tabular">{t.refs_count}</span>
                        <span className="sr-only">references</span>
                      </span>
                    )}
                    <PriorityChip priority={t.priority} />
                  </p>
                </div>

                <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-2 md:contents">
                  <span className={cn('text-xs md:text-sm', overdue ? 'text-warning-text' : 'text-muted-foreground')} title={dueLabel(t.due_date)}>
                    <span className="md:hidden">Due </span>
                    {formatDate(t.due_date, 'EEE d MMM')}
                  </span>
                  <span>
                    <StatusChip status={t.status} overdue={overdue} />
                  </span>
                  <span className="tabular ml-auto text-sm md:ml-0 md:text-right">
                    {t.status === 'approved' ? (
                      <>
                        <span className="font-semibold text-primary-text">{t.points_awarded}</span>
                        <span className="text-muted-foreground">/{t.max_points}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">{t.max_points} pts</span>
                    )}
                  </span>
                </div>

                <div className="relative z-10 col-start-2 row-start-1 flex justify-end md:col-start-auto md:row-start-auto">
                  {!readOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${t.title}`}>
                          <Ellipsis />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/admin/tasks/${t.id}`}>
                            <ExternalLink /> Open
                          </Link>
                        </DropdownMenuItem>
                        {onEdit && !cancelled && (
                          <DropdownMenuItem onSelect={() => onEdit(t)}>
                            <Pencil /> Edit
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        {cancelled ? (
                          <DropdownMenuItem onSelect={() => actions.restore(t)}>
                            <RotateCcw /> Restore
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onSelect={() => actions.askCancel(t)}>
                            <Ban /> Cancel task
                          </DropdownMenuItem>
                        )}
                        {canDeleteTask(t) && (
                          <DropdownMenuItem onSelect={() => actions.askDelete(t)} className="text-danger-text focus:text-danger-text">
                            <Trash2 /> Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
      {actions.dialogs}
    </>
  );
}
