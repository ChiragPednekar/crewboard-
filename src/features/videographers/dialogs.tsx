import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { MailCheck } from 'lucide-react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { CheckList, type CheckListOption } from '@/components/CheckList';
import { ClientLogo } from '@/components/ClientLogo';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useClientOptions } from '@/features/lookups/api';
import { useOnOpen } from '@/hooks/useOnOpen';
import { friendlyError } from '@/lib/errors';
import type { Profile } from '@/lib/supabase';

import { useInviteVideographer, useSetVideographerClients, useUpdateVideographer } from './api';
import { emptyInvite, inviteSchema, type InviteValues, videographerDetailsSchema, type VideographerDetailsValues } from './schemas';

export function useClientCheckOptions(keep: string[] = []): CheckListOption[] {
  const clients = useClientOptions();
  return (clients.data ?? [])
    .filter((c) => c.is_active || keep.includes(c.id))
    .map((c) => ({
      value: c.id,
      label: c.name,
      hint: [c.city, c.is_active ? null : 'Archived'].filter(Boolean).join(' · ') || undefined,
      leading: <ClientLogo name={c.name} src={c.logo_url} className="h-7 w-7 rounded-md text-[10px]" />,
    }));
}

function DetailsFields({ form, }: { form: UseFormReturn<VideographerDetailsValues> | UseFormReturn<InviteValues>; autoFocus?: boolean }) {
  const f = form as UseFormReturn<VideographerDetailsValues>;
  return (
    <>
      <FormField
        control={f.control}
        name="full_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Full name</FormLabel>
            <FormControl>
              <Input autoComplete="off" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={f.control}
        name="email"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input type="email" inputMode="email" autoComplete="off" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={f.control}
          name="phone"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone</FormLabel>
              <FormControl>
                <Input type="tel" inputMode="tel" placeholder="+91 98xxx xxxxx" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={f.control}
          name="base_location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Base location</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Andheri, Mumbai" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </>
  );
}

export function InviteDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate();
  const invite = useInviteVideographer();
  const clientOptions = useClientCheckOptions();
  const form = useForm<InviteValues>({ resolver: zodResolver(inviteSchema), defaultValues: emptyInvite });

  useEffect(() => {
    if (open) form.reset(emptyInvite);
  }, [open, form]);

  function onSubmit(values: InviteValues) {
    invite.mutate(values, {
      onSuccess: (res) => {
        toast.success(`Invite sent to ${values.email}`, {
          description: res.warning ?? 'They’ll set a password from the email link.',
          icon: <MailCheck className="h-4 w-4" />,
        });
        onOpenChange(false);
        navigate(`/admin/videographers/${res.id}`);
      },
      onError: (e) => {
        const msg = friendlyError(e);
        if (/already has an account/i.test(msg)) form.setError('email', { message: msg });
        else toast.error(msg);
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !invite.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Add a videographer</DialogTitle>
          <DialogDescription>We’ll email an invite link. They choose their own password when they accept it.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <DetailsFields form={form} />
            <FormField
              control={form.control}
              name="client_ids"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Clients</FormLabel>
                  <FormDescription>Optional. You can change these any time.</FormDescription>
                  <CheckList label="Clients" options={clientOptions} value={field.value} onChange={field.onChange} searchPlaceholder="Search clients" emptyText="Add clients first to assign them here." />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={invite.isPending}>
                Cancel
              </Button>
              <Button type="submit" loading={invite.isPending}>
                Send invite
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function EditDetailsDialog({ open, onOpenChange, profile }: { open: boolean; onOpenChange: (open: boolean) => void; profile: Profile }) {
  const update = useUpdateVideographer();
  const defaults = {
    full_name: profile.full_name,
    email: profile.email,
    phone: profile.phone ?? '',
    base_location: profile.base_location ?? '',
  };
  const form = useForm<VideographerDetailsValues>({ resolver: zodResolver(videographerDetailsSchema), defaultValues: defaults });

  useOnOpen(open, () => form.reset(defaults));

  const emailChanged = form.watch('email').trim().toLowerCase() !== profile.email.toLowerCase();

  return (
    <Dialog open={open} onOpenChange={(o) => !update.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit {profile.full_name}</DialogTitle>
          <DialogDescription>These details are shown to the admin team and on {profile.full_name.split(' ')[0]}’s profile.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) =>
              update.mutate(
                { profile, values },
                {
                  onSuccess: () => {
                    toast.success('Details saved');
                    onOpenChange(false);
                  },
                  onError: (e) => {
                    const msg = friendlyError(e);
                    if (/already has an account/i.test(msg)) form.setError('email', { message: msg });
                    else toast.error(msg);
                  },
                },
              ),
            )}
            className="space-y-4"
            noValidate
          >
            <DetailsFields form={form} />
            {emailChanged && (
              <p className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning-text">
                They’ll sign in with the new email from now on. No confirmation email is sent.
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={update.isPending}>
                Cancel
              </Button>
              <Button type="submit" loading={update.isPending} disabled={!form.formState.isDirty}>
                Save
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export function ManageClientsDialog({
  open,
  onOpenChange,
  videographerId,
  name,
  current,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  videographerId: string;
  name: string;
  current: string[];
}) {
  const save = useSetVideographerClients();
  const options = useClientCheckOptions(current);
  const [selected, setSelected] = useState<string[]>(current);
  const currentKey = current.join(',');

  useEffect(() => {
    if (open) setSelected(currentKey ? currentKey.split(',') : []);
  }, [open, currentKey]);

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Clients for {name}</DialogTitle>
          <DialogDescription>They’ll see these clients’ contact details and notes. Tasks can still be planned for any client.</DialogDescription>
        </DialogHeader>
        <CheckList label="Clients" options={options} value={selected} onChange={setSelected} searchPlaceholder="Search clients" emptyText="No clients yet." />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                { id: videographerId, clientIds: selected },
                {
                  onSuccess: () => {
                    toast.success('Clients updated');
                    onOpenChange(false);
                  },
                  onError: (e) => toast.error(friendlyError(e)),
                },
              )
            }
          >
            Save clients
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
