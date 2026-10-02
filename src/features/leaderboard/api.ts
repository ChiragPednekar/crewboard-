import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { monthKeyToDate } from '@/lib/dates';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
import { supabase } from '@/lib/supabase';

/**
 * Home-page data. Everything cross-user comes from SECURITY DEFINER RPCs that return a
 * fixed set of safe columns (never admin remarks), so videographers can call them too.
 */
export const leaderboardKeys = {
  all: ['leaderboard'] as const,
  month: (month: string) => ['leaderboard', month] as const,
  top: (month: string) => ['leaderboard', 'top', month] as const,
  featured: (month: string) => ['leaderboard', 'featured', month] as const,
  stats: (month: string) => ['leaderboard', 'stats', month] as const,
  final: (month: string) => ['leaderboard', 'final', month] as const,
};

/** Published scores once every assessment is out; otherwise approved points (provisional). */
export function useLeaderboard(month: string) {
  return useQuery({
    queryKey: leaderboardKeys.month(month),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_leaderboard', { p_month: monthKeyToDate(month) });
      if (error) throw error;
      return data;
    },
  });
}
export type LeaderboardRow = NonNullable<ReturnType<typeof useLeaderboard>['data']>[number];

export function useTopPerformer(month: string) {
  return useQuery({
    queryKey: leaderboardKeys.top(month),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_top_performer', { p_month: monthKeyToDate(month) });
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}

export function useFeaturedWork(month: string) {
  return useQuery({
    queryKey: leaderboardKeys.featured(month),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_featured_work', { p_month: monthKeyToDate(month) });
      if (error) throw error;
      return data;
    },
  });
}
export type FeaturedItem = NonNullable<ReturnType<typeof useFeaturedWork>['data']>[number];

export function useTeamStats(month: string) {
  return useQuery({
    queryKey: leaderboardKeys.stats(month),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_team_stats', { p_month: monthKeyToDate(month) });
      if (error) throw error;
      return data[0] ?? null;
    },
  });
}

export function useIsMonthFinal(month: string) {
  return useQuery({
    queryKey: leaderboardKeys.final(month),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('is_month_final', { p_month: monthKeyToDate(month) });
      if (error) throw error;
      return Boolean(data);
    },
  });
}

/** Approved tasks of a month, the candidates for featured work (admin only). */
export function useFeatureCandidates(month: string) {
  return useQuery({
    queryKey: ['tasks', 'feature-candidates', month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          'id, title, points_awarded, max_points, quality_rating, approved_at, videographer:profiles!tasks_videographer_id_fkey(full_name, avatar_url), client:clients(name), category:task_categories(name), submissions(version, links, thumbnail_path)',
        )
        .eq('month', monthKeyToDate(month))
        .eq('status', 'approved')
        .order('quality_rating', { ascending: false })
        .order('approved_at', { ascending: false })
        .order('version', { referencedTable: 'submissions', ascending: false })
        .limit(1, { referencedTable: 'submissions' });
      if (error) throw error;
      return data;
    },
  });
}

export interface FeaturePick {
  task_id: string;
  rank: number;
  reason: string;
}

export function useSetFeaturedWork() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ month, picks }: { month: string; picks: FeaturePick[] }) => {
      const { error } = await supabase.rpc('set_featured_work', {
        p_month: monthKeyToDate(month),
        p_picks: picks.map((p) => ({ task_id: p.task_id, rank: p.rank, reason: p.reason.trim() || null })),
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: leaderboardKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['activity'] });
    },
  });
}
