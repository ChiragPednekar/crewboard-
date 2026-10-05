import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { monthKeyToDate } from '@/lib/dates';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
import { supabase, type Tables } from '@/lib/supabase';

export type ClientReviewLink = Tables<'client_review_links'>;

export interface PublicClientReview {
  state: 'open' | 'responded' | 'expired' | 'revoked' | 'invalid';
  title?: string;
  client?: string;
  client_logo?: string | null;
  category?: string;
  videographer?: string;
  links?: string[];
  version?: number;
  submitted_at?: string;
  expires_at?: string;
  decision?: 'approved' | 'changes' | null;
  rating?: number | null;
  comment?: string | null;
  responder_name?: string | null;
  responded_at?: string | null;
}

export const clientReviewKeys = {
  task: (taskId: string) => ['tasks', 'client-links', taskId] as const,
  public: (token: string) => ['client-review', token] as const,
  ratings: (month: string) => ['assessments', 'client-ratings', month] as const,
};

export function approvalUrl(token: string): string {
  return `${window.location.origin}/approve/${token}`;
}

export function useClientLinks(taskId: string) {
  return useQuery({
    queryKey: clientReviewKeys.task(taskId),
    queryFn: async (): Promise<ClientReviewLink[]> => {
      const { data, error } = await supabase
        .from('client_review_links')
        .select('*')
        .eq('task_id', taskId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useCreateClientLink(taskId: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (v: { submissionId: string; contact: string; days: number }) => {
      const { data, error } = await supabase
        .from('client_review_links')
        .insert({
          task_id: taskId,
          submission_id: v.submissionId,
          client_contact: v.contact.trim() || null,
          created_by: profile!.id,
          expires_at: new Date(Date.now() + v.days * 86_400_000).toISOString(),
        })
        .select('token')
        .single();
      if (error) throw error;
      return data.token;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: clientReviewKeys.task(taskId) }),
  });
}

export function useRevokeClientLink(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('client_review_links').update({ revoked_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: clientReviewKeys.task(taskId) }),
  });
}

/** Public page (no account). */
export function usePublicClientReview(token: string) {
  return useQuery({
    queryKey: clientReviewKeys.public(token),
    retry: false,
    queryFn: async (): Promise<PublicClientReview> => {
      const { data, error } = await supabase.rpc('get_client_review', { p_token: token });
      if (error) throw error;
      return data as unknown as PublicClientReview;
    },
  });
}

export function useSubmitClientReview(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (v: { decision: 'approved' | 'changes'; rating: number; comment: string; name: string }) => {
      const { data, error } = await supabase.rpc('submit_client_review', {
        p_token: token,
        p_decision: v.decision,
        p_rating: v.rating,
        p_comment: v.comment || undefined,
        p_name: v.name || undefined,
      });
      if (error) throw error;
      return data as unknown as PublicClientReview;
    },
    onSuccess: (data) => queryClient.setQueryData(clientReviewKeys.public(token), data),
  });
}

/** Average client rating per videographer for a month (assessment helper). */
export function useClientRatings(month: string) {
  return useQuery({
    queryKey: clientReviewKeys.ratings(month),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_client_ratings', { p_month: monthKeyToDate(month) });
      if (error) throw error;
      return data;
    },
  });
}
