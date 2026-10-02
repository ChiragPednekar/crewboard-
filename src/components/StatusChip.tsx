import { AlarmClock, Ban, CheckCircle2, Circle, type LucideIcon, RotateCcw, Send, Timer } from 'lucide-react';

import type { TaskStatus } from '@/lib/supabase';
import { cn } from '@/lib/utils';

/** One source of truth for status colours across the whole app. */
export const STATUS_META: Record<TaskStatus, { label: string; icon: LucideIcon; className: string; dot: string }> = {
  assigned: {
    label: 'Assigned',
    icon: Circle,
    className: 'bg-muted-foreground/10 text-muted-foreground ring-muted-foreground/20',
    dot: 'bg-muted-foreground',
  },
  in_progress: {
    label: 'In progress',
    icon: Timer,
    className: 'bg-violet/12 text-violet-text ring-violet/25',
    dot: 'bg-violet',
  },
  submitted: {
    label: 'Submitted',
    icon: Send,
    className: 'bg-info/12 text-info-text ring-info/25',
    dot: 'bg-info',
  },
  revision_requested: {
    label: 'Revision requested',
    icon: RotateCcw,
    className: 'bg-danger/12 text-danger-text ring-danger/25',
    dot: 'bg-danger',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    className: 'bg-success/12 text-success-text ring-success/25',
    dot: 'bg-success',
  },
  cancelled: {
    label: 'Cancelled',
    icon: Ban,
    className: 'bg-muted-foreground/5 text-muted-foreground ring-border line-through decoration-1',
    dot: 'bg-muted-foreground/50',
  },
};

export function StatusChip({ status, overdue = false, className }: { status: TaskStatus; overdue?: boolean; className?: string }) {
  const meta = STATUS_META[status];
  const Icon = overdue ? AlarmClock : meta.icon;
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ring-1 ring-inset',
        overdue ? 'bg-warning/12 text-warning-text ring-warning/30' : meta.className,
        className,
      )}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {overdue ? 'Overdue' : meta.label}
    </span>
  );
}
