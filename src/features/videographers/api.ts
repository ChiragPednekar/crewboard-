import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lookupKeys } from '@/features/lookups/api';
import { isOverdue, monthKeyToDate, todayKey } from '@/lib/dates';
import { invokeFunction } from '@/lib/functions';
import { type PlanStatus, type Profile, supabase } from '@/lib/supabase';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';

import type { InviteValues, VideographerDetailsValues } from './schemas';

export const videographerKeys = {
  all: ['videographers'] as const,
  list: ['videographers', 'list'] as const,
  accounts: ['videographers', 'accounts'] as const,
  month: (month: string) => ['videographers', 'month', month] as const,
  detail: (id: string) => ['videographers', 'detail', id] as const,
  submissions: (id: string) => ['videographers', 'submissions', id] as const,
};

export type AccountState = 'active' | 'pending' | 'deactivated';

export interface ClientLink {
  id: string;
  name: string;
  logo_url: string | null;
  city: string | null;
  is_active: boolean;
}

export type Videographer = Profile & { clients: ClientLink[] };

const CLIENTS_EMBED = 'videographer_clients!videographer_clients_videographer_id_fkey(client:clients(id, name, logo_url, city, is_active))';
type ClientRow = { client: ClientLink | null };

function withClients(row: Profile & { videographer_clients: ClientRow[] }): Videographer {
  const { videographer_clients, ...rest } = row;
  return {
    ...rest,
    clients: videographer_clients
      .map((r) => r.client)
      .filter((c): c is ClientLink => Boolean(c))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export function useVideographers() {
  return useQuery({
    queryKey: videographerKeys.list,
    queryFn: async (): Promise<Videographer[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`*, ${CLIENTS_EMBED}`)
        .eq('role', 'videographer')
        .eq('approval_status', 'approved') // sign-up requests are listed separately
        .order('full_name');
      if (error) throw error;
      return (data as unknown as (Profile & { videographer_clients: ClientRow[] })[]).map(withClients);
    },
  });
}

export function useVideographer(id: string) {
  return useQuery({
    queryKey: videographerKeys.detail(id),
    enabled: Boolean(id),
    queryFn: async (): Promise<Videographer | null> => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`*, ${CLIENTS_EMBED}`)
        .eq('id', id)
        .eq('role', 'videographer')
        .maybeSingle();
      if (error) throw error;
      return data ? withClients(data as unknown as Profile & { videographer_clients: ClientRow[] }) : null;
    },
  });
}

export interface AccountInfo {
  state: AccountState;
  invitedAt: string | null;
  lastSignInAt: string | null;
}

/** Invite / sign-in state from auth.users (admin-only RPC). */
export function useAccounts() {
  return useQuery({
    queryKey: videographerKeys.accounts,
    queryFn: async (): Promise<Map<string, Omit<AccountInfo, 'state'> & { confirmed: boolean }>> => {
      const { data, error } = await supabase.rpc('get_account_status');
      if (error) throw error;
      return new Map(
        data.map((r) => [
          r.id,
          { invitedAt: r.invited_at, lastSignInAt: r.last_sign_in_at, confirmed: Boolean(r.confirmed_at || r.last_sign_in_at) },
        ]),
      );
    },
  });
}

export function accountState(profile: Pick<Profile, 'is_active'>, info?: { confirmed: boolean }): AccountState {
  if (!profile.is_active) return 'deactivated';
  if (info && !info.confirmed) return 'pending';
  return 'active';
}

export interface MonthSummary {
  planStatus: PlanStatus | null;
  total: number;
  approved: number;
  submitted: number;
  overdue: number;
  maxPoints: number;
  points: number;
}

export function emptySummary(): MonthSummary {
  return { planStatus: null, total: 0, approved: 0, submitted: 0, overdue: 0, maxPoints: 0, points: 0 };
}

/** Per-videographer progress for one month (plans + non-cancelled tasks). */
export function useCrewMonth(month: string) {
  return useQuery({
    queryKey: videographerKeys.month(month),
    queryFn: async (): Promise<Map<string, MonthSummary>> => {
      const m = monthKeyToDate(month);
      const [plans, tasks] = await Promise.all([
        supabase.from('monthly_plans').select('videographer_id, status').eq('month', m),
        supabase.from('tasks').select('videographer_id, status, due_date, max_points, points_awarded').eq('month', m).neq('status', 'cancelled'),
      ]);
      if (plans.error) throw plans.error;
      if (tasks.error) throw tasks.error;
      const today = todayKey();
      const map = new Map<string, MonthSummary>();
      const get = (id: string) => {
        let s = map.get(id);
        if (!s) map.set(id, (s = emptySummary()));
        return s;
      };
      for (const p of plans.data) get(p.videographer_id).planStatus = p.status;
      for (const t of tasks.data) {
        const s = get(t.videographer_id);
        s.total += 1;
        s.maxPoints += t.max_points;
        if (t.status === 'approved') {
          s.approved += 1;
          s.points += t.points_awarded ?? 0;
        }
        if (t.status === 'submitted') s.submitted += 1;
        if (isOverdue(t.due_date, t.status, today)) s.overdue += 1;
      }
      return map;
    },
  });
}

/** Recent submissions by one videographer (newest first). */
export function useVideographerSubmissions(id: string) {
  return useQuery({
    queryKey: videographerKeys.submissions(id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('submissions')
        .select('id, version, links, notes, source, submitted_at, is_on_time, task:tasks!inner(id, title, status, videographer_id, client:clients(name))')
        .eq('task.videographer_id', id)
        .order('submitted_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateCrew() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: videographerKeys.all }),
      queryClient.invalidateQueries({ queryKey: lookupKeys.crew }),
      queryClient.invalidateQueries({ queryKey: ['clients'] }),
      queryClient.invalidateQueries({ queryKey: ['activity'] }),
    ]);
}

export function useInviteVideographer() {
  const invalidate = useInvalidateCrew();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: (v: InviteValues) =>
      invokeFunction<{ id: string; warning?: string }>('admin-users', {
        action: 'invite',
        full_name: v.full_name,
        email: v.email,
        phone: v.phone || null,
        base_location: v.base_location || null,
        client_ids: v.client_ids,
      }),
    onSuccess: invalidate,
  });
}

export function useResendInvite() {
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: (userId: string) => invokeFunction<{ ok: true }>('admin-users', { action: 'resend_invite', user_id: userId }),
  });
}

export function useSetVideographerActive() {
  const invalidate = useInvalidateCrew();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      invokeFunction<{ ok: true }>('admin-users', { action: 'set_active', user_id: id, active }),
    onSuccess: invalidate,
  });
}

export function useUpdateVideographer() {
  const invalidate = useInvalidateCrew();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ profile, values }: { profile: Profile; values: VideographerDetailsValues }) => {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: values.full_name.trim(),
          phone: values.phone.trim() || null,
          base_location: values.base_location.trim() || null,
        })
        .eq('id', profile.id);
      if (error) throw error;
      if (values.email.trim().toLowerCase() !== profile.email.toLowerCase()) {
        await invokeFunction('admin-users', { action: 'update_email', user_id: profile.id, email: values.email.trim() });
      }
    },
    onSuccess: invalidate,
  });
}

export function useSetVideographerClients() {
  const invalidate = useInvalidateCrew();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ id, clientIds }: { id: string; clientIds: string[] }) => {
      const { error } = await supabase.rpc('set_videographer_clients', { p_videographer_id: id, p_client_ids: clientIds });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
