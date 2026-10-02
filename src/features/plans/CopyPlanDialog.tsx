import { useEffect, useState } from 'react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMonth } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';

import { useDuplicatePlan, usePlanMonths } from './api';

interface CopyPlanDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videographerId: string;
  name: string;
  month: string;
}

export function CopyPlanDialog({ open, onOpenChange, videographerId, name, month }: CopyPlanDialogProps) {
  const months = usePlanMonths(videographerId);
  const duplicate = useDuplicatePlan();
  const sources = (months.data ?? []).filter((m) => m.month !== month && m.tasks > 0);
  const [from, setFrom] = useState('');

  // default to the latest earlier month each time the dialog opens
  const defaultFrom = sources.find((m) => m.month < month)?.month ?? sources[0]?.month ?? '';
  useEffect(() => {
    if (open) setFrom(defaultFrom);
  }, [open, defaultFrom]);

  return (
    <Dialog open={open} onOpenChange={(o) => !duplicate.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copy a previous plan</DialogTitle>
          <DialogDescription>
            Copies {name}’s tasks into {formatMonth(month)} as new, unstarted tasks on the same days of the month. Links and notes come along;
            uploaded files don’t. Cancelled tasks are skipped.
          </DialogDescription>
        </DialogHeader>
        {sources.length === 0 && !months.isPending ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            {name} has no other months with tasks to copy.
          </p>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="copy-from">Copy from</Label>
            <Select value={from} onValueChange={setFrom}>
              <SelectTrigger id="copy-from">
                <SelectValue placeholder="Pick a month" />
              </SelectTrigger>
              <SelectContent>
                {sources.map((m) => (
                  <SelectItem key={m.month} value={m.month}>
                    {formatMonth(m.month)} · {m.tasks} {m.tasks === 1 ? 'task' : 'tasks'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={duplicate.isPending}>
            Cancel
          </Button>
          <Button
            disabled={!from}
            loading={duplicate.isPending}
            onClick={() =>
              duplicate.mutate(
                { videographerId, from, to: month },
                {
                  onSuccess: (r) => {
                    toast.success(`Copied ${r.copied} ${r.copied === 1 ? 'task' : 'tasks'} from ${formatMonth(from)}`, {
                      description: r.skipped_files > 0 ? `${r.skipped_files} uploaded file(s) were not copied. Re-upload them on the tasks that need them.` : undefined,
                    });
                    onOpenChange(false);
                  },
                  onError: (e) => toast.error(friendlyError(e)),
                },
              )
            }
          >
            <Copy /> Copy tasks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
