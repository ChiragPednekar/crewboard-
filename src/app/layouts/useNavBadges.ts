import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/features/auth/AuthProvider';
import { useUnreadCount } from '@/features/notifications/api';
import { supabase } from '@/lib/supabase';

import type { NavBadge } from './nav';

export const reviewQueueCountKey = ['tasks', 'review-queue-count'] as const;
export const pendingLeaveCountKey = ['leave', 'pending-count'] as const;

/** Counts shown next to nav items. */
export function useNavBadges(): Record<NavBadge, number> {
  const { isAdmin, profile } = useAuth();
  const isStaff = isAdmin || profile?.role === 'reviewer';
  const unread = useUnreadCount();
  const review = useQuery({
    queryKey: reviewQueueCountKey,
    enabled: isStaff,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'submitted');
      if (error) throw error;
      return count ?? 0;
    },
  });
  const leave = useQuery({
    queryKey: pendingLeaveCountKey,
    enabled: isAdmin,
    refetchInterval: 120_000,
    queryFn: async () => {
      const { count, error } = await supabase
        .from('leave_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      if (error) throw error;
      return count ?? 0;
    },
  });
  return { review: review.data ?? 0, unread: unread.data ?? 0, leave: leave.data ?? 0 };
}
