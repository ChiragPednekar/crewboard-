import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Ban, CheckCircle2, CircleSlash, FileWarning, KeyRound, Link2Off, type LucideIcon, Scale } from 'lucide-react';

import { Skeleton } from '@/components/ui/skeleton';
import { formatDateTime, timeAgo } from '@/lib/dates';
import { cn } from '@/lib/utils';

import { useSyncEvents } from './api';

type Detail = Record<string, unknown>;
type Tone = 'ok' | 'warn' | 'bad' | 'muted';

/** Plain-language line for a sync event. */
export function describeSyncEvent(kind: string, d: Detail): { icon: LucideIcon; tone: Tone; text: string } {
  switch (kind) {
    case 'submission_created':
      return { icon: ArrowDownToLine, tone: 'ok', text: d.links === 0 ? 'Marked Completed in the sheet (no link)' : 'Marked Completed in the sheet, with a link' };
    case 'updated':
      return d.status
        ? { icon: ArrowDownToLine, tone: 'ok', text: `Status set to ${d.status === 'in_progress' ? 'In Progress' : 'Assigned'} from the sheet` }
        : d.notes
          ? { icon: ArrowDownToLine, tone: 'ok', text: 'Notes updated from the sheet' }
          : { icon: ArrowDownToLine, tone: 'muted', text: String(d.note ?? 'Updated') };
    case 'written':
      return { icon: ArrowUpFromLine, tone: 'muted', text: `Wrote ${d.rows} ${d.rows === 1 ? 'row' : 'rows'} to the sheet` };
    case 'unknown_id':
      return { icon: FileWarning, tone: 'warn', text: d.reason === 'duplicate row' ? `Duplicate row for a task (first copy is row ${d.firstRow}); ignored` : 'Row has a Task ID that isn’t theirs or doesn’t exist; ignored' };
    case 'missing_id':
      return { icon: FileWarning, tone: 'warn', text: `Row without a Task ID${d.title ? ` (“${d.title}”)` : ''}; ignored — tasks are added in the app` };
    case 'conflict_approved':
      return { icon: Ban, tone: 'warn', text: `Edited a ${d.status} task in the sheet; the edit was reverted` };
    case 'conflict_lww':
      return { icon: Scale, tone: 'warn', text: `Changed in both places; ${d.winner === 'sheet' ? 'the sheet' : 'the app'} was newer and won${d.stamped === false ? ' (no edit stamp, so the sync time was used)' : ''}` };
    case 'bad_link':
      return {
        icon: Link2Off,
        tone: 'bad',
        text: d.reason ? String(d.reason) : `Not a valid link: ${Array.isArray(d.invalid) ? (d.invalid as string[]).join(' ') : ''}`,
      };
    case 'invalid_status':
      return { icon: CircleSlash, tone: 'bad', text: d.reason ? `“${d.value}”: ${d.reason}` : `“${d.value}” isn’t a status they can set${d.from ? ` from ${String(d.from).replace('_', ' ')}` : ''}` };
    case 'permission_denied':
      return { icon: KeyRound, tone: 'bad', text: String(d.message ?? 'The sheet isn’t shared with the service account') };
    case 'error':
      return { icon: AlertTriangle, tone: 'bad', text: String(d.message ?? 'Something went wrong') };
    default:
      return { icon: CheckCircle2, tone: 'muted', text: kind };
  }
}

const TONE: Record<Tone, string> = {
  ok: 'text-success-text',
  warn: 'text-warning-text',
  bad: 'text-danger-text',
  muted: 'text-muted-foreground',
};

export function SyncEventList({ problemsOnly, videographerId, names, limit = 50 }: { problemsOnly: boolean; videographerId?: string; names?: Map<string, string>; limit?: number }) {
  const events = useSyncEvents({ problemsOnly, videographerId }, limit);
  if (events.isPending) return <Skeleton className="h-40" />;
  if (events.isError) return <p className="text-sm text-danger-text">Couldn’t load sync events.</p>;
  if (events.data.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{problemsOnly ? 'No problems in recent syncs.' : 'Nothing synced yet.'}</p>;
  return (
    <ul className="divide-y divide-border">
      {events.data.map((e) => {
        const { icon: Icon, tone, text } = describeSyncEvent(e.kind, (e.detail ?? {}) as Detail);
        const who = e.config ? names?.get(e.config.videographer_id) : undefined;
        return (
          <li key={e.id} className="flex gap-3 py-2.5">
            <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', TONE[tone])} aria-hidden />
            <div className="min-w-0 flex-1 text-sm">
              <p>{text}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[who, e.config?.tab_name && `tab “${e.config.tab_name}”`, e.row_number && `row ${e.row_number}`, e.task?.title].filter(Boolean).join(' · ')}
              </p>
            </div>
            <time dateTime={e.created_at} title={formatDateTime(e.created_at)} className="shrink-0 text-xs text-muted-foreground">
              {timeAgo(e.created_at)}
            </time>
          </li>
        );
      })}
    </ul>
  );
}
