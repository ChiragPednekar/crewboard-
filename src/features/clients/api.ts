import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lookupKeys } from '@/features/lookups/api';
import { monthKeyToDate } from '@/lib/dates';
import { supabase, type Client } from '@/lib/supabase';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';

import type { ClientFormValues } from './schemas';

export const clientKeys = {
  all: ['clients'] as const,
  list: ['clients', 'list'] as const,
  detail: (id: string) => ['clients', 'detail', id] as const,
  work: (id: string, month: string) => ['clients', 'work', id, month] as const,
  taskCount: (id: string) => ['clients', 'task-count', id] as const,
};

export interface CrewMember {
  id: string;
  full_name: string;
  avatar_url: string | null;
  is_active: boolean;
}

export type ClientWithCrew = Client & { crew: CrewMember[] };

const CREW_EMBED = 'videographer_clients(profile:profiles!videographer_clients_videographer_id_fkey(id, full_name, avatar_url, is_active))';

type CrewRow = { profile: CrewMember | null };
function withCrew<T extends { videographer_clients: CrewRow[] }>(row: T): Omit<T, 'videographer_clients'> & { crew: CrewMember[] } {
  const { videographer_clients, ...rest } = row;
  const crew = videographer_clients
    .map((vc) => vc.profile)
    .filter((p): p is CrewMember => Boolean(p))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  return { ...rest, crew };
}

export function useClients() {
  return useQuery({
    queryKey: clientKeys.list,
    queryFn: async (): Promise<ClientWithCrew[]> => {
      const { data, error } = await supabase.from('clients').select(`*, ${CREW_EMBED}`).order('name');
      if (error) throw error;
      return (data as unknown as (Client & { videographer_clients: CrewRow[] })[]).map(withCrew);
    },
  });
}

export function useClient(id: string) {
  return useQuery({
    queryKey: clientKeys.detail(id),
    queryFn: async (): Promise<ClientWithCrew | null> => {
      const { data, error } = await supabase.from('clients').select(`*, ${CREW_EMBED}`).eq('id', id).maybeSingle();
      if (error) throw error;
      return data ? withCrew(data as unknown as Client & { videographer_clients: CrewRow[] }) : null;
    },
  });
}

/** How many tasks reference this client (decides whether it can be deleted). */
export function useClientTaskCount(id: string) {
  return useQuery({
    queryKey: clientKeys.taskCount(id),
    queryFn: async () => {
      const { count, error } = await supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('client_id', id);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useClientWork(id: string, month: string) {
  return useQuery({
    queryKey: clientKeys.work(id, month),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          'id, title, status, due_date, max_points, points_awarded, priority, plan:monthly_plans(status), category:task_categories(name), videographer:profiles!tasks_videographer_id_fkey(id, full_name, avatar_url)',
        )
        .eq('client_id', id)
        .eq('month', monthKeyToDate(month))
        .order('due_date');
      if (error) throw error;
      return data;
    },
  });
}

function toRow(v: ClientFormValues) {
  const blank = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    name: v.name.trim(),
    type: v.type,
    city: blank(v.city),
    address: blank(v.address),
    contact_name: blank(v.contact_name),
    contact_phone: blank(v.contact_phone),
    contact_email: blank(v.contact_email),
    notes: blank(v.notes),
  };
}

function useInvalidateClients() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: clientKeys.all }),
      queryClient.invalidateQueries({ queryKey: lookupKeys.clients }),
      queryClient.invalidateQueries({ queryKey: ['videographers'] }),
    ]);
}

export function useSaveClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ id, values }: { id?: string; values: ClientFormValues }): Promise<Client> => {
      const query = id
        ? supabase.from('clients').update(toRow(values)).eq('id', id)
        : supabase.from('clients').insert(toRow(values));
      const { data, error } = await query.select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useSetClientActive() {
  const invalidate = useInvalidateClients();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('clients').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDeleteClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (client: Pick<Client, 'id' | 'logo_url'>) => {
      const { error } = await supabase.from('clients').delete().eq('id', client.id);
      if (error) throw error;
      const { data: files } = await supabase.storage.from('client-logos').list(client.id);
      if (files?.length) await supabase.storage.from('client-logos').remove(files.map((f) => `${client.id}/${f.name}`));
    },
    onSuccess: invalidate,
  });
}

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export function useUploadClientLogo() {
  const invalidate = useInvalidateClients();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      if (!LOGO_TYPES.includes(file.type)) throw new Error('Use a PNG, JPG or WebP image.');
      if (file.size > LOGO_MAX_BYTES) throw new Error('The logo must be 2 MB or smaller.');
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
      const path = `${id}/logo-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('client-logos').upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('client-logos').getPublicUrl(path);
      const { error } = await supabase.from('clients').update({ logo_url: pub.publicUrl }).eq('id', id);
      if (error) throw error;
      // tidy up older logos for this client
      const { data: files } = await supabase.storage.from('client-logos').list(id);
      const stale = (files ?? []).map((f) => `${id}/${f.name}`).filter((p) => p !== path);
      if (stale.length) await supabase.storage.from('client-logos').remove(stale);
    },
    onSuccess: invalidate,
  });
}

export function useSetClientCrew() {
  const invalidate = useInvalidateClients();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ id, videographerIds }: { id: string; videographerIds: string[] }) => {
      const { error } = await supabase.rpc('set_client_videographers', { p_client_id: id, p_videographer_ids: videographerIds });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
