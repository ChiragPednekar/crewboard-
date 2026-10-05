import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { pendingLeaveCountKey } from '@/app/layouts/useNavBadges';
import { useAuth } from '@/features/auth/AuthProvider';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
import { supabase, type Tables } from '@/lib/supabase';

export type LeaveRequest = Tables<'leave_requests'>;
export type LeaveKind = 'leave' | 'sick' | 'unavailable';
export type LeaveStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export const LEAVE_KIND_LABEL: Record<LeaveKind, string> = {
  leave: 'Leave',
  sick: 'Sick leave',
  unavailable: 'Unavailable',
};

export interface LeaveWithPerson extends LeaveRequest {
  videographer: { id: string; full_name: string; avatar_url: string | null } | null;
}

export const leaveKeys = {
  all: ['leave'] as const,
  mine: ['leave', 'mine'] as const,
  admin: (status: string) => ['leave', 'admin', status] as const,
  range: (from: string, to: string) => ['leave', 'range', from, to] as const,
};

export function useMyLeave() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: leaveKeys.mine,
    enabled: Boolean(profile),
    queryFn: async (): Promise<LeaveRequest[]> => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*')
        .eq('videographer_id', profile!.id)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useLeaveRequests(status: LeaveStatus | 'all') {
  return useQuery({
    queryKey: leaveKeys.admin(status),
    queryFn: async (): Promise<LeaveWithPerson[]> => {
      let q = supabase
        .from('leave_requests')
        .select('*, videographer:profiles!leave_requests_videographer_id_fkey(id, full_name, avatar_url)')
        .order('start_date', { ascending: status === 'pending' });
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return data as unknown as LeaveWithPerson[];
    },
  });
}

/** Approved leave overlapping [from, to] (RLS: own for crew, everyone for staff). */
export function useApprovedLeave(from: string, to: string) {
  return useQuery({
    queryKey: leaveKeys.range(from, to),
    queryFn: async (): Promise<LeaveWithPerson[]> => {
      const { data, error } = await supabase
        .from('leave_requests')
        .select('*, videographer:profiles!leave_requests_videographer_id_fkey(id, full_name, avatar_url)')
        .eq('status', 'approved')
        .lte('start_date', to)
        .gte('end_date', from);
      if (error) throw error;
      return data as unknown as LeaveWithPerson[];
    },
  });
}

function useInvalidateLeave() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: leaveKeys.all });
    void queryClient.invalidateQueries({ queryKey: pendingLeaveCountKey });
  };
}

export function useRequestLeave() {
  const { profile } = useAuth();
  const invalidate = useInvalidateLeave();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (v: { start_date: string; end_date: string; kind: LeaveKind; reason: string }) => {
      const { error } = await supabase.from('leave_requests').insert({
        videographer_id: profile!.id,
        start_date: v.start_date,
        end_date: v.end_date,
        kind: v.kind,
        reason: v.reason.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useWithdrawLeave() {
  const invalidate = useInvalidateLeave();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (r: Pick<LeaveRequest, 'id' | 'status'>) => {
      if (r.status === 'pending') {
        const { error } = await supabase.from('leave_requests').delete().eq('id', r.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.rpc('cancel_leave', { p_id: r.id });
        if (error) throw error;
      }
    },
    onSuccess: invalidate,
  });
}

export function useDecideLeave() {
  const invalidate = useInvalidateLeave();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (v: { id: string; decision: 'approved' | 'rejected'; note?: string }) => {
      const { error } = await supabase.rpc('decide_leave', { p_id: v.id, p_decision: v.decision, p_note: v.note || undefined });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Does [start, end] (YYYY-MM-DD) include `day`? */
export function leaveCovers(l: Pick<LeaveRequest, 'start_date' | 'end_date'>, day: string): boolean {
  return l.start_date <= day && day <= l.end_date;
}
