import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, MailCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';

import { CheckList } from '@/components/CheckList';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/features/auth/AuthProvider';
import { timeAgo } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { supabase, type Tables } from '@/lib/supabase';

import { useClientCheckOptions } from './dialogs';

export type AllowedEmail = Tables<'allowed_emails'>;
const allowKeys = { pending: ['allowed-emails', 'pending'] as const };

const allowSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  full_name: z.string().trim().max(120).refine((v) => v === '' || v.length >= 2, 'Name is too short'),
  phone: z.string().trim().refine((v) => v === '' || /^[0-9+() -]{6,20}$/.test(v), 'Use digits, spaces, + ( ) or -'),
  base_location: z.string().trim().max(120),
  role: z.enum(['videographer', 'reviewer']),
  client_ids: z.array(z.string()),
});
type AllowValues = z.infer<typeof allowSchema>;

export function usePendingAllowList() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: allowKeys.pending,
    enabled: isAdmin,
    queryFn: async (): Promise<AllowedEmail[]> => {
      const { data, error } = await supabase.from('allowed_emails').select('*').is('claimed_at', null).order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/**
 * "Add by Google sign-in": list someone's email so they can sign in with Google.
 * Their name, phone, clients and role are applied on first sign-in. No email is sent.
 */
export function AllowDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const clientOptions = useClientCheckOptions();
  const empty: AllowValues = { email: '', full_name: '', phone: '', base_location: '', role: 'videographer', client_ids: [] };
  const [v, setV] = useState<AllowValues>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof AllowValues, string>>>({});

  const save = useMutation({
    mutationFn: async (values: AllowValues) => {
      const { error } = await supabase.from('allowed_emails').upsert(
        {
          email: values.email,
          full_name: values.full_name || null,
          phone: values.phone || null,
          base_location: values.base_location || null,
          role: values.role,
          client_ids: values.client_ids,
          added_by: profile!.id,
        },
        { onConflict: 'email' },
      );
      if (error) throw error;
    },
    onSuccess: (_d, values) => {
      void queryClient.invalidateQueries({ queryKey: allowKeys.pending });
      toast.success(`${values.email} can now sign in with Google`, { description: 'Share the CrewBoard link with them.' });
      setV(empty);
      onOpenChange(false);
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  function submit() {
    const parsed = allowSchema.safeParse(v);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path[0], i.message])) as typeof errors);
      return;
    }
    setErrors({});
    save.mutate(parsed.data);
  }

  const field = (k: 'email' | 'full_name' | 'phone' | 'base_location', label: string, extra: Partial<React.ComponentProps<typeof Input>> = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`allow-${k}`}>{label}</Label>
      <Input id={`allow-${k}`} value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} aria-invalid={Boolean(errors[k]) || undefined} {...extra} />
      {errors[k] && <p className="text-sm text-danger-text">{errors[k]}</p>}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add someone by Google sign-in</DialogTitle>
          <DialogDescription>
            No invite email is sent. They open CrewBoard, choose “Continue with Google” with this address, and land with the details below.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {field('email', 'Google email', { type: 'email', inputMode: 'email', placeholder: 'name@gmail.com' })}
          <div className="grid gap-4 sm:grid-cols-2">
            {field('full_name', 'Name (optional)')}
            {field('phone', 'Phone (optional)', { type: 'tel', inputMode: 'tel' })}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('base_location', 'Base location (optional)')}
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={v.role} onValueChange={(r) => setV({ ...v, role: r as AllowValues['role'] })}>
                <SelectTrigger aria-label="Role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="videographer">Videographer</SelectItem>
                  <SelectItem value="reviewer">Reviewer (approves work)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {v.role === 'videographer' && (
            <CheckList
              label="Clients"
              options={clientOptions}
              value={v.client_ids}
              onChange={(ids) => setV({ ...v, client_ids: ids })}
              searchPlaceholder="Search clients"
              emptyText="Add clients first to assign them here."
            />
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              <MailCheck /> Allow sign-in
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** People allowed in who haven't signed in yet. */
export function PendingAllowList() {
  const queryClient = useQueryClient();
  const pending = usePendingAllowList();
  const remove = useMutation({
    mutationFn: async (email: string) => {
      const { error } = await supabase.from('allowed_emails').delete().eq('email', email);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: allowKeys.pending });
      toast.success('Removed — they can no longer sign up');
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  if (!pending.data || pending.data.length === 0) return null;
  return (
    <Card className="mb-5 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium">
        <Clock className="h-4 w-4 text-warning-text" aria-hidden /> Waiting for their first sign-in ({pending.data.length})
      </p>
      <ul className="divide-y divide-border/70">
        {pending.data.map((a) => (
          <li key={a.email} className="flex flex-wrap items-center gap-2 py-2 text-sm">
            <span className="font-medium">{a.full_name || a.email}</span>
            {a.full_name && <span className="text-muted-foreground">{a.email}</span>}
            {a.role === 'reviewer' && <span className="rounded-full bg-violet/12 px-2 py-0.5 text-xs text-violet-text">Reviewer</span>}
            <span className="ml-auto text-xs text-muted-foreground">added {timeAgo(a.created_at)}</span>
            <Button variant="ghost" size="icon-sm" aria-label={`Remove ${a.email}`} onClick={() => remove.mutate(a.email)}>
              <Trash2 />
            </Button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
