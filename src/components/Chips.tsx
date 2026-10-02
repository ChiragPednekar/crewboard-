import { ArrowDown, ArrowUp, ChevronsUp, Eye, EyeOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import type { PlanStatus, TaskPriority } from '@/lib/supabase';
import { cn } from '@/lib/utils';

const chipBase = 'inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-medium ring-1 ring-inset';

export function Chip({ className, icon: Icon, children }: { className?: string; icon?: LucideIcon; children: ReactNode }) {
  return (
    <span className={cn(chipBase, 'bg-muted-foreground/10 text-muted-foreground ring-muted-foreground/20', className)}>
      {Icon && <Icon className="h-3.5 w-3.5" aria-hidden />}
      {children}
    </span>
  );
}

/** Draft plans are invisible to the videographer; say so wherever a plan appears. */
export function PlanStatusChip({ status, className }: { status: PlanStatus | null; className?: string }) {
  if (!status) return <Chip className={cn('bg-transparent', className)}>No plan</Chip>;
  return status === 'published' ? (
    <Chip icon={Eye} className={cn('bg-success/12 text-success-text ring-success/25', className)}>
      Published
    </Chip>
  ) : (
    <Chip icon={EyeOff} className={cn('bg-warning/12 text-warning-text ring-warning/30', className)}>
      Draft
    </Chip>
  );
}

export const PRIORITY_META: Record<TaskPriority, { label: string; icon: LucideIcon; className: string }> = {
  low: { label: 'Low', icon: ArrowDown, className: 'text-muted-foreground' },
  normal: { label: 'Normal', icon: ArrowUp, className: 'text-muted-foreground' },
  high: { label: 'High', icon: ArrowUp, className: 'bg-warning/12 text-warning-text ring-warning/30' },
  urgent: { label: 'Urgent', icon: ChevronsUp, className: 'bg-danger/12 text-danger-text ring-danger/25' },
};

/** Only high and urgent get a chip by default; normal/low are noise in a list. */
export function PriorityChip({ priority, always = false }: { priority: TaskPriority; always?: boolean }) {
  if (!always && (priority === 'normal' || priority === 'low')) return null;
  const meta = PRIORITY_META[priority];
  return (
    <Chip icon={meta.icon} className={meta.className}>
      {meta.label}
    </Chip>
  );
}

export function AccountChip({ state }: { state: 'active' | 'pending' | 'deactivated' }) {
  if (state === 'pending') return <Chip className="bg-info/12 text-info-text ring-info/25">Invite pending</Chip>;
  if (state === 'deactivated') return <Chip className="bg-danger/12 text-danger-text ring-danger/25">Deactivated</Chip>;
  return null;
}
