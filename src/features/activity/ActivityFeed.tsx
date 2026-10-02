import { Activity, Ban, CalendarCheck, CheckCircle2, Copy, FileSpreadsheet, Pencil, Plus, RotateCcw, Send, Trash2, UserCheck, UserPlus, UserX, type LucideIcon } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, timeAgo } from '@/lib/dates';

import { useActivity } from './api';

type Entry = NonNullable<ReturnType<typeof useActivity>['data']>[number];

const FIELD_LABEL: Record<string, string> = {
  title: 'title',
  brief: 'brief',
  due_date: 'due date',
  max_points: 'points',
  priority: 'priority',
  client: 'client',
  category: 'category',
};

const STATUS_LABEL: Record<string, string> = {
  assigned: 'assigned',
  in_progress: 'in progress',
  submitted: 'submitted',
  revision_requested: 'revision requested',
  approved: 'approved',
  cancelled: 'cancelled',
};

const NAMES_ITSELF = new Set(['task.created', 'task.deleted']);

/**
 * Icon + sentence for an activity row. On a task's own page the title is implied;
 * in wider feeds (`withTitle`) it is appended so each line stands alone.
 */
export function describe(e: Entry, withTitle = false): { icon: LucideIcon; text: string } {
  const d = describeAction(e);
  if (withTitle && e.entity_type === 'task' && e.summary && !NAMES_ITSELF.has(e.action)) {
    return { ...d, text: `${d.text} · ${e.summary}` };
  }
  return d;
}

function describeAction(e: Entry): { icon: LucideIcon; text: string } {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  const what = e.summary ?? '';
  switch (e.action) {
    case 'task.created':
      return { icon: Plus, text: `Task created: ${what}` };
    case 'task.edited': {
      const fields = Array.isArray(p.fields) ? (p.fields as string[]).map((f) => FIELD_LABEL[f] ?? f) : [];
      return { icon: Pencil, text: `Edited ${fields.join(', ') || 'task'}` };
    }
    case 'task.deleted':
      return { icon: Trash2, text: `Task deleted: ${what}` };
    case 'task.status_changed':
      return { icon: p.to === 'cancelled' ? Ban : RotateCcw, text: `Status ${STATUS_LABEL[String(p.from)] ?? p.from} → ${STATUS_LABEL[String(p.to)] ?? p.to}${p.via === 'sheet' ? ' (from the Sheet)' : ''}` };
    case 'task.cancel_reason':
      return { icon: Ban, text: `Cancelled: “${String(p.reason ?? '')}”` };
    case 'task.submitted':
      return { icon: Send, text: `Submitted version ${String(p.version ?? 1)}${p.on_time === false ? ' (late)' : ''}${p.source === 'sheet' ? ' via the Sheet' : ''}` };
    case 'task.reviewed':
      return p.decision === 'approved'
        ? { icon: CheckCircle2, text: `Approved with ${String(p.points)} pts, ${String(p.rating)}★` }
        : { icon: RotateCcw, text: 'Revision requested' };
    case 'plan.published':
      return { icon: CalendarCheck, text: `Published plan for ${what}` };
    case 'plan.duplicated':
      return { icon: Copy, text: what };
    case 'videographer.invited':
      return { icon: UserPlus, text: `Invited ${what}` };
    case 'videographer.deactivated':
      return { icon: UserX, text: `Deactivated ${what}` };
    case 'videographer.reactivated':
      return { icon: UserCheck, text: `Reactivated ${what}` };
    case 'videographer.clients_set':
      return { icon: Pencil, text: `Client list updated (${what})` };
    case 'sheet.connected':
      return { icon: FileSpreadsheet, text: `Google Sheet connected (tab “${what}”)` };
    case 'sheet.disconnected':
      return { icon: FileSpreadsheet, text: `Google Sheet disconnected` };
    case 'assessment.published':
    case 'assessment.republished':
      return { icon: CheckCircle2, text: `Assessment published for ${what}` };
    default:
      return { icon: e.actor_kind === 'sheet' ? FileSpreadsheet : Activity, text: [e.action, what].filter(Boolean).join(' · ') };
  }
}

export function ActivityFeed({ videographerId, entityId, limit = 12, emptyText = 'Nothing has happened yet.' }: { videographerId?: string; entityId?: string; limit?: number; emptyText?: string }) {
  const activity = useActivity({ videographerId, entityId }, limit);

  if (activity.isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-10" />
        ))}
      </div>
    );
  }
  if (activity.isError) return <p className="text-sm text-danger-text">Couldn’t load the history.</p>;
  if (activity.data.length === 0) return <p className="text-sm text-muted-foreground">{emptyText}</p>;

  return (
    <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[13px] before:top-2 before:w-px before:bg-border">
      {activity.data.map((e) => {
        const { icon: Icon, text } = describe(e, !entityId);
        const who = e.actor?.full_name ?? (e.actor_kind === 'sheet' ? 'Google Sheet' : 'System');
        return (
          <li key={e.id} className="relative flex gap-3">
            <span className="relative z-10 grid h-7 w-7 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted-foreground">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <div className="min-w-0 pt-0.5">
              <p className="text-sm leading-snug">{text}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {who} · <time dateTime={e.created_at} title={formatDateTime(e.created_at)}>{timeAgo(e.created_at)}</time>
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
