import { useState } from 'react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { friendlyError } from '@/lib/errors';
import type { Task } from '@/lib/supabase';

import { useCancelTask, useDeleteTask, useRestoreTask } from './api';

type ActionTask = Pick<Task, 'id' | 'title' | 'status'> & { submissions_count: number };

/**
 * Cancel / restore / delete with the right confirmation for each.
 * Tasks with submissions can only be cancelled (history is kept); others can be deleted.
 */
export function useTaskActions({ onDeleted }: { onDeleted?: () => void } = {}) {
  const [target, setTarget] = useState<{ task: ActionTask; action: 'cancel' | 'delete' } | null>(null);
  const [reason, setReason] = useState('');
  const cancel = useCancelTask();
  const restore = useRestoreTask();
  const remove = useDeleteTask();

  const close = () => {
    setTarget(null);
    setReason('');
  };

  const dialogs = (
    <>
      <ConfirmDialog
        open={target?.action === 'cancel'}
        onOpenChange={(o) => !o && close()}
        title={`Cancel “${target?.task.title}”?`}
        description="It stays in the plan as cancelled and stops counting towards points, completion and punctuality. The videographer is notified. You can restore it later."
        confirmLabel="Cancel task"
        destructive
        loading={cancel.isPending}
        onConfirm={() =>
          target &&
          cancel.mutate(
            { id: target.task.id, reason: reason.trim() },
            {
              onSuccess: () => {
                toast.success('Task cancelled');
                close();
              },
              onError: (e) => toast.error(friendlyError(e)),
            },
          )
        }
      >
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Reason (optional, kept in the history)</Label>
          <Textarea id="cancel-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
        </div>
      </ConfirmDialog>
      <ConfirmDialog
        open={target?.action === 'delete'}
        onOpenChange={(o) => !o && close()}
        title={`Delete “${target?.task.title}”?`}
        description="The task and its references are removed for good. Nothing has been submitted yet, so no work is lost."
        confirmLabel="Delete task"
        destructive
        loading={remove.isPending}
        onConfirm={() =>
          target &&
          remove.mutate(target.task.id, {
            onSuccess: () => {
              toast.success('Task deleted');
              close();
              onDeleted?.();
            },
            onError: (e) => toast.error(friendlyError(e)),
          })
        }
      />
    </>
  );

  return {
    dialogs,
    askCancel: (task: ActionTask) => setTarget({ task, action: 'cancel' }),
    askDelete: (task: ActionTask) => setTarget({ task, action: 'delete' }),
    restore: (task: ActionTask) =>
      restore.mutate(task.id, {
        onSuccess: () => toast.success('Task restored as assigned'),
        onError: (e) => toast.error(friendlyError(e)),
      }),
    restoring: restore.isPending,
  };
}

export function canDeleteTask(task: ActionTask): boolean {
  return task.submissions_count === 0;
}
