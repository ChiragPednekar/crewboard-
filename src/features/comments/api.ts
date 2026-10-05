import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
import { supabase, type Tables } from '@/lib/supabase';

export type ReviewComment = Tables<'review_comments'> & {
  author: { id: string; full_name: string; avatar_url: string | null; role: string } | null;
};

export const commentKeys = {
  task: (taskId: string) => ['tasks', 'comments', taskId] as const,
};

/** Timestamped comments first (in playback order), then general ones by time posted. */
export function sortComments(list: ReviewComment[]): ReviewComment[] {
  return [...list].sort((a, b) => {
    if (a.at_seconds !== null && b.at_seconds !== null) return a.at_seconds - b.at_seconds;
    if (a.at_seconds !== null) return -1;
    if (b.at_seconds !== null) return 1;
    return a.created_at.localeCompare(b.created_at);
  });
}

export function useComments(taskId: string) {
  return useQuery({
    queryKey: commentKeys.task(taskId),
    enabled: Boolean(taskId),
    queryFn: async (): Promise<ReviewComment[]> => {
      const { data, error } = await supabase
        .from('review_comments')
        .select('*, author:profiles!review_comments_author_id_fkey(id, full_name, avatar_url, role)')
        .eq('task_id', taskId)
        .order('created_at');
      if (error) throw error;
      return sortComments(data as unknown as ReviewComment[]);
    },
  });
}

export function useAddComment(taskId: string) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (v: { body: string; atSeconds: number | null; submissionId: string | null }) => {
      const { error } = await supabase.from('review_comments').insert({
        task_id: taskId,
        submission_id: v.submissionId,
        author_id: profile!.id,
        body: v.body.trim(),
        at_seconds: v.atSeconds === null ? null : Math.round(v.atSeconds * 100) / 100,
      });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: commentKeys.task(taskId) }),
  });
}

export function useResolveComment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; resolved: boolean }) => {
      const { error } = await supabase.rpc('set_comment_resolved', { p_id: v.id, p_resolved: v.resolved });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: commentKeys.task(taskId) }),
  });
}

export function useDeleteComment(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('review_comments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: commentKeys.task(taskId) }),
  });
}
