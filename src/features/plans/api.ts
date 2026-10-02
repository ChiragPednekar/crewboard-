import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateWork } from '@/features/lookups/api';
import { monthKeyToDate, toMonthKey } from '@/lib/dates';
import { type MonthlyPlan, supabase } from '@/lib/supabase';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';

export const planKeys = {
  all: ['plans'] as const,
  one: (videographerId: string, month: string) => ['plans', 'one', videographerId, month] as const,
  months: (videographerId: string) => ['plans', 'months', videographerId] as const,
};

export function usePlan(videographerId: string, month: string) {
  return useQuery({
    queryKey: planKeys.one(videographerId, month),
    queryFn: async (): Promise<MonthlyPlan | null> => {
      const { data, error } = await supabase
        .from('monthly_plans')
        .select('*')
        .eq('videographer_id', videographerId)
        .eq('month', monthKeyToDate(month))
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

/** Months (YYYY-MM, newest first) that have a plan with at least one task, for "copy from". */
export function usePlanMonths(videographerId: string) {
  return useQuery({
    queryKey: planKeys.months(videographerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('monthly_plans')
        .select('month, status, tasks(count)')
        .eq('videographer_id', videographerId)
        .order('month', { ascending: false });
      if (error) throw error;
      return (data as unknown as { month: string; status: MonthlyPlan['status']; tasks: { count: number }[] }[]).map((p) => ({
        month: toMonthKey(p.month),
        status: p.status,
        tasks: p.tasks[0]?.count ?? 0,
      }));
    },
  });
}

export function useEnsurePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ videographerId, month }: { videographerId: string; month: string }) => {
      const { data, error } = await supabase.rpc('ensure_plan', { p_videographer_id: videographerId, p_month: monthKeyToDate(month) });
      if (error) throw error;
      return data;
    },
    onSuccess: () => void invalidateWork(queryClient),
  });
}

export function useSavePlanNotes() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ id, summary, goals }: { id: string; summary: string; goals: string }) => {
      const { error } = await supabase
        .from('monthly_plans')
        .update({ summary: summary.trim() || null, goals: goals.trim() || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: planKeys.all }),
  });
}

export function usePublishPlan() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (planId: string) => {
      const { error } = await supabase.rpc('publish_plan', { p_plan_id: planId });
      if (error) throw error;
    },
    onSuccess: () => void invalidateWork(queryClient),
  });
}

export function useDuplicatePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ videographerId, from, to }: { videographerId: string; from: string; to: string }) => {
      const { data, error } = await supabase.rpc('duplicate_plan', {
        p_videographer_id: videographerId,
        p_from_month: monthKeyToDate(from),
        p_to_month: monthKeyToDate(to),
      });
      if (error) throw error;
      return data as { plan_id: string; copied: number; skipped_files: number };
    },
    onSuccess: () => void invalidateWork(queryClient),
  });
}
