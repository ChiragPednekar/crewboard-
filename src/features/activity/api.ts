import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/** Activity filters by kind; values are PostgREST `or` expressions. */
export const ACTIVITY_KINDS = {
  all: { label: 'Everything', filter: null },
  planning: { label: 'Plans & tasks', filter: 'action.like.plan.*,action.in.(task.created,task.edited,task.deleted,task.status_changed,task.cancel_reason)' },
  delivery: { label: 'Submissions & reviews', filter: 'action.in.(task.submitted,task.reviewed)' },
  scores: { label: 'Assessments & featured', filter: 'action.like.assessment.*,action.like.featured.*' },
  people: { label: 'Crew & clients', filter: 'action.like.videographer.*,action.like.client.*' },
} as const;
export type ActivityKind = keyof typeof ACTIVITY_KINDS;

export interface ActivityFilter {
  videographerId?: string;
  entityId?: string;
  kind?: ActivityKind;
}

/** Activity for a videographer, an entity (task, client…) or everything, newest first. */
export function useActivity(filter: ActivityFilter, limit = 12) {
  return useQuery({
    queryKey: ['activity', filter, limit],
    placeholderData: keepPreviousData, // "load more" keeps the list on screen
    queryFn: async () => {
      let q = supabase
        .from('activity_log')
        .select('id, action, actor_kind, summary, payload, created_at, entity_type, entity_id, actor:profiles!activity_log_actor_id_fkey(full_name)')
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(limit);
      if (filter.videographerId) q = q.eq('videographer_id', filter.videographerId);
      if (filter.entityId) q = q.eq('entity_id', filter.entityId);
      const kind = filter.kind ? ACTIVITY_KINDS[filter.kind].filter : null;
      if (kind) q = q.or(kind);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}
