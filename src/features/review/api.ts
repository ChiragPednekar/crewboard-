import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateWork } from '@/features/lookups/api';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
import { supabase } from '@/lib/supabase';

export const reviewKeys = {
  queue: ['tasks', 'review-queue'] as const,
};

export interface QueueItem {
  id: string;
  title: string;
  status: 'submitted';
  due_date: string;
  max_points: number;
  month: string;
  first_submitted_at: string | null;
  last_submitted_at: string | null;
  videographer: { id: string; full_name: string; avatar_url: string | null } | null;
  client: { name: string; logo_url: string | null } | null;
  category: { name: string } | null;
  submissions: { version: number; is_on_time: boolean; thumbnail_path: string | null; audio_path: string | null; links: string[]; source: string }[];
}

/** Submitted work, oldest first (first in, first reviewed). */
export function useReviewQueue() {
  return useQuery({
    queryKey: reviewKeys.queue,
    queryFn: async (): Promise<QueueItem[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          'id, title, status, due_date, max_points, month, first_submitted_at, last_submitted_at, videographer:profiles!tasks_videographer_id_fkey(id, full_name, avatar_url), client:clients(name, logo_url), category:task_categories(name), submissions(version, is_on_time, thumbnail_path, audio_path, links, source)',
        )
        .eq('status', 'submitted')
        .order('last_submitted_at', { ascending: true })
        .order('version', { referencedTable: 'submissions', ascending: false })
        .limit(1, { referencedTable: 'submissions' });
      if (error) throw error;
      return data as unknown as QueueItem[];
    },
  });
}

export type ReviewInput =
  | { taskId: string; decision: 'approved'; points: number; rating: number; feedback: string }
  | { taskId: string; decision: 'revision_requested'; feedback: string };

export function useReviewTask() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (input: ReviewInput) => {
      const { error } = await supabase.rpc('review_task', {
        p_task_id: input.taskId,
        p_decision: input.decision,
        p_points: input.decision === 'approved' ? input.points : undefined,
        p_rating: input.decision === 'approved' ? input.rating : undefined,
        p_feedback: input.feedback.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => void invalidateWork(queryClient),
  });
}
