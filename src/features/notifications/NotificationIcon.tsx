import {
  Award,
  Ban,
  Bell,
  CalendarCheck2,
  CalendarClock,
  Camera,
  CheckCircle2,
  ClipboardList,
  Inbox,
  type LucideIcon,
  MessageSquareText,
  Palmtree,
  RotateCcw,
  Trophy,
  UserCheck,
} from 'lucide-react';

import { cn } from '@/lib/utils';

const ICONS: Record<string, { icon: LucideIcon; className: string }> = {
  task_assigned: { icon: ClipboardList, className: 'text-violet-text bg-violet/12' },
  plan_published: { icon: CalendarCheck2, className: 'text-violet-text bg-violet/12' },
  submission_received: { icon: Inbox, className: 'text-info-text bg-info/12' },
  revision_requested: { icon: RotateCcw, className: 'text-danger-text bg-danger/12' },
  task_approved: { icon: CheckCircle2, className: 'text-success-text bg-success/12' },
  assessment_published: { icon: Award, className: 'text-primary-text bg-primary/12' },
  best_work: { icon: Trophy, className: 'text-gold-text bg-gold/12' },
  task_cancelled: { icon: Ban, className: 'text-muted-foreground bg-muted-foreground/10' },
  task_updated: { icon: CalendarClock, className: 'text-warning-text bg-warning/12' },
  comment: { icon: MessageSquareText, className: 'text-primary-text bg-primary/12' },
  client_feedback: { icon: UserCheck, className: 'text-success-text bg-success/12' },
  leave_request: { icon: Palmtree, className: 'text-warning-text bg-warning/12' },
  leave_decision: { icon: Palmtree, className: 'text-success-text bg-success/12' },
  gear_checkout: { icon: Camera, className: 'text-violet-text bg-violet/12' },
};

export function NotificationIcon({ type, className }: { type: string; className?: string }) {
  const meta = ICONS[type] ?? { icon: Bell, className: 'text-muted-foreground bg-muted-foreground/10' };
  const Icon = meta.icon;
  return (
    <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-xl', meta.className, className)}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}
