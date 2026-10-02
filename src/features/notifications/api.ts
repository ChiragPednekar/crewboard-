import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { useAuth } from '@/features/auth/AuthProvider';
import { friendlyError } from '@/lib/errors';
import { supabase, type Notification } from '@/lib/supabase';

export const notificationKeys = {
  all: ['notifications'] as const,
  list: (limit: number) => ['notifications', 'list', limit] as const,
  unread: ['notifications', 'unread'] as const,
};

export function useNotifications(limit = 20) {
  const { profile } = useAuth();
  return useQuery({
    queryKey: notificationKeys.list(limit),
    enabled: Boolean(profile),
    queryFn: async (): Promise<Notification[]> => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export function useUnreadCount() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: notificationKeys.unread,
    enabled: Boolean(profile),
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .is('read_at', null);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useMarkNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (ids?: string[]) => {
      const { error } = await supabase.rpc('mark_notifications_read', ids ? { p_ids: ids } : {});
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: notificationKeys.all }),
    onError: (e) => toast.error(friendlyError(e)),
  });
}

/** Live badge + toast for new notifications (Supabase Realtime, RLS-filtered). */
export function useNotificationsRealtime() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!profile) return;
    const channel = supabase
      .channel(`notifications:${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const n = payload.new as Notification;
          toast(n.title, { description: n.body ?? undefined });
          void queryClient.invalidateQueries({ queryKey: notificationKeys.all });
          // a notification means the underlying work changed (new task, review, submission…)
          for (const key of [['crew'], ['tasks'], ['plans'], ['videographers'], ['activity']]) {
            void queryClient.invalidateQueries({ queryKey: key });
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [profile, queryClient]);
}
