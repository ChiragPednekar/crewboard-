import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { monthKeyToDate } from '@/lib/dates';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
import { supabase } from '@/lib/supabase';

export interface Badges {
  on_time_streak: number;
  five_star: number;
  perfect_months: number;
  top_performer: number;
  best_work: number;
}

export const motivationKeys = {
  badges: (id: string) => ['motivation', 'badges', id] as const,
  year: (year: number) => ['leaderboard', 'year', year] as const,
  votes: (month: string) => ['leaderboard', 'votes', month] as const,
};

export function useBadges(videographerId: string | undefined) {
  return useQuery({
    queryKey: motivationKeys.badges(videographerId ?? ''),
    enabled: Boolean(videographerId),
    queryFn: async (): Promise<Badges> => {
      const { data, error } = await supabase.rpc('get_badges', { p_videographer_id: videographerId! });
      if (error) throw error;
      return data as unknown as Badges;
    },
  });
}

export function useYearlyLeaderboard(year: number) {
  return useQuery({
    queryKey: motivationKeys.year(year),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_yearly_leaderboard', { p_year: year });
      if (error) throw error;
      return data;
    },
  });
}
export type YearRow = NonNullable<ReturnType<typeof useYearlyLeaderboard>['data']>[number];

export function useVoteCandidates(month: string) {
  return useQuery({
    queryKey: motivationKeys.votes(month),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_vote_candidates', { p_month: monthKeyToDate(month) });
      if (error) throw error;
      return data;
    },
  });
}
export type VoteCandidate = NonNullable<ReturnType<typeof useVoteCandidates>['data']>[number];

export function useCastVote(month: string) {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (taskId: string | null) => {
      const { error } = taskId
        ? await supabase.rpc('cast_vote', { p_month: monthKeyToDate(month), p_task_id: taskId })
        : await supabase.rpc('clear_vote', { p_month: monthKeyToDate(month) });
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: motivationKeys.votes(month) }),
  });
}

/** Which badges to show, most impressive first. */
export function badgeList(b: Badges): { key: keyof Badges; label: string; detail: string; value: number }[] {
  return [
    { key: 'top_performer' as const, label: 'Top performer', detail: 'months ranked #1', value: b.top_performer },
    { key: 'best_work' as const, label: 'Best work', detail: 'times picked best of the month', value: b.best_work },
    { key: 'perfect_months' as const, label: 'Perfect month', detail: 'all work done, all on time', value: b.perfect_months },
    { key: 'five_star' as const, label: '5-star cuts', detail: 'approved with 5★', value: b.five_star },
    { key: 'on_time_streak' as const, label: 'On-time streak', detail: 'deliveries on time in a row', value: b.on_time_streak },
  ];
}
