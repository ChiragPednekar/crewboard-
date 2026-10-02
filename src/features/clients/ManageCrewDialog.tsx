import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CheckList } from '@/components/CheckList';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { UserAvatar } from '@/components/UserAvatar';
import { useCrewOptions } from '@/features/lookups/api';
import { friendlyError } from '@/lib/errors';

import { useSetClientCrew } from './api';

interface ManageCrewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  current: string[];
}

export function ManageCrewDialog({ open, onOpenChange, clientId, clientName, current }: ManageCrewDialogProps) {
  const crew = useCrewOptions();
  const save = useSetClientCrew();
  const [selected, setSelected] = useState<string[]>(current);

  // reset when (re)opened; key on the ids so a fresh array each render doesn't wipe edits
  const currentKey = current.join(',');
  useEffect(() => {
    if (open) setSelected(currentKey ? currentKey.split(',') : []);
  }, [open, currentKey]);

  const options = (crew.data ?? [])
    .filter((p) => p.is_active || current.includes(p.id))
    .map((p) => ({
      value: p.id,
      label: p.full_name,
      hint: p.is_active ? undefined : 'Deactivated',
      leading: <UserAvatar name={p.full_name} src={p.avatar_url} className="h-7 w-7 text-[11px]" />,
    }));

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crew for {clientName}</DialogTitle>
          <DialogDescription>Assigned videographers can see this client’s contact details and notes.</DialogDescription>
        </DialogHeader>
        <CheckList label="Videographers" options={options} value={selected} onChange={setSelected} emptyText="No videographers yet." searchPlaceholder="Search crew" />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                { id: clientId, videographerIds: selected },
                {
                  onSuccess: () => {
                    toast.success('Crew updated');
                    onOpenChange(false);
                  },
                  onError: (e) => toast.error(friendlyError(e)),
                },
              )
            }
          >
            Save crew
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
