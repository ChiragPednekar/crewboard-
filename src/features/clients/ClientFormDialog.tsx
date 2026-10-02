import { useEffect } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { friendlyError } from '@/lib/errors';
import type { Client } from '@/lib/supabase';

import { useSaveClient } from './api';
import { CLIENT_TYPE_LABEL, CLIENT_TYPES, clientSchema, type ClientFormValues, emptyClient } from './schemas';

function toValues(c: Client): ClientFormValues {
  return {
    name: c.name,
    type: (CLIENT_TYPES as readonly string[]).includes(c.type) ? (c.type as ClientFormValues['type']) : 'other',
    city: c.city ?? '',
    address: c.address ?? '',
    contact_name: c.contact_name ?? '',
    contact_phone: c.contact_phone ?? '',
    contact_email: c.contact_email ?? '',
    notes: c.notes ?? '',
  };
}

interface ClientFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: Client;
}

export function ClientFormDialog({ open, onOpenChange, client }: ClientFormDialogProps) {
  const navigate = useNavigate();
  const save = useSaveClient();
  const form = useForm<ClientFormValues>({ resolver: zodResolver(clientSchema), defaultValues: client ? toValues(client) : emptyClient });

  useEffect(() => {
    if (open) form.reset(client ? toValues(client) : emptyClient);
  }, [open, client, form]);

  function onSubmit(values: ClientFormValues) {
    save.mutate(
      { id: client?.id, values },
      {
        onSuccess: (saved) => {
          toast.success(client ? 'Client updated' : `${saved.name} added`);
          onOpenChange(false);
          if (!client) navigate(`/admin/clients/${saved.id}`);
        },
        onError: (e) => {
          if ((e as { code?: string }).code === '23505') {
            form.setError('name', { message: 'A client with this name already exists' });
          } else {
            toast.error(friendlyError(e));
          }
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{client ? 'Edit client' : 'Add a client'}</DialogTitle>
          <DialogDescription>Contact details are visible to the videographers assigned to this client.</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_11rem]">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Harbourview Hospital" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CLIENT_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {CLIENT_TYPE_LABEL[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input autoComplete="address-level2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Input autoComplete="street-address" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <fieldset className="space-y-4 rounded-lg border border-border p-4">
              <legend className="px-1 text-sm font-medium">Point of contact</legend>
              <FormField
                control={form.control}
                name="contact_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Dr. Meera Iyer (PR Head)" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="contact_phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl>
                        <Input type="tel" inputMode="tel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="contact_email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input type="email" inputMode="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </fieldset>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes for the crew</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Access rules, brand do’s and don’ts, consent requirements…" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
                Cancel
              </Button>
              <Button type="submit" loading={save.isPending}>
                {client ? 'Save changes' : 'Add client'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
