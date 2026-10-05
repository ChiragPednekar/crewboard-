import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Video } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { lookupKeys } from '@/features/lookups/api';
import { friendlyError } from '@/lib/errors';
import { supabase, type UserRole } from '@/lib/supabase';

import { videographerKeys } from './api';

/**
 * Switch someone between videographer and reviewer. A reviewer can open the review
 * queue, approve work and leave notes, but can't plan, assess or manage the studio.
 */
export function RoleMenuItem({ person }: { person: { id: string; full_name: string; role: UserRole } }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const toReviewer = person.role === 'videographer';
  const first = person.full_name.split(' ')[0] ?? person.full_name;

  const change = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('profiles')
        .update({ role: toReviewer ? 'reviewer' : 'videographer' })
        .eq('id', person.id);
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: videographerKeys.all });
      await queryClient.invalidateQueries({ queryKey: lookupKeys.crew });
      toast.success(toReviewer ? `${first} is now a reviewer` : `${first} is a videographer again`);
      setOpen(false);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  if (person.role === 'admin') return null;
  return (
    <>
      <DropdownMenuItem onSelect={() => setOpen(true)}>
        {toReviewer ? <ShieldCheck /> : <Video />} {toReviewer ? 'Make reviewer' : 'Make videographer'}
      </DropdownMenuItem>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={toReviewer ? `Make ${first} a reviewer?` : `Make ${first} a videographer again?`}
        description={
          toReviewer
            ? 'Reviewers can see all submitted work, approve or send it back with points, and leave notes. They can’t plan months, publish assessments or change settings. Their own existing tasks stay as they are.'
            : 'They’ll lose access to the review queue and go back to seeing only their own tasks.'
        }
        confirmLabel={toReviewer ? 'Make reviewer' : 'Make videographer'}
        loading={change.isPending}
        onConfirm={() => change.mutate()}
      />
    </>
  );
}
