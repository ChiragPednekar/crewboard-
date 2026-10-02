import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useProfile } from '@/features/auth/AuthProvider';
import { monthKeyToDate } from '@/lib/dates';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
import { DEFAULT_WEIGHTS, type MonthMetrics, type ScoringWeights } from '@/lib/scoring';
import { supabase, type Tables } from '@/lib/supabase';

export type Assessment = Tables<'monthly_assessments'>;

export const assessmentKeys = {
  all: ['assessments'] as const,
  month: (month: string) => ['assessments', 'month', month] as const,
  one: (vid: string, month: string) => ['assessments', 'one', vid, month] as const,
  unlocks: (id: string) => ['assessments', 'unlocks', id] as const,
  forPerson: (vid: string) => ['assessments', 'person', vid] as const,
  mine: (vid: string) => ['assessments', 'mine', vid] as const,
};

export function metricsOf(a: Assessment): MonthMetrics {
  return {
    assigned: a.assigned_count,
    approved: a.approved_count,
    submitted: a.submitted_count,
    onTime: a.on_time_count,
    pointsAwarded: a.points_awarded_sum,
    maxPoints: a.max_points_sum,
  };
}

export function weightsOf(a: Pick<Assessment, 'weights'>): ScoringWeights {
  const w = (a.weights ?? {}) as Partial<Record<keyof ScoringWeights, number | string>>;
  const n = (k: keyof ScoringWeights) => (w[k] === undefined ? DEFAULT_WEIGHTS[k] : Number(w[k]));
  return { points: n('points'), completion: n('completion'), punctuality: n('punctuality'), discretionary: n('discretionary') };
}

export type AssessmentState = 'none' | 'draft' | 'published' | 'unlocked';
export function assessmentState(a: Assessment | null | undefined): AssessmentState {
  if (!a) return 'none';
  if (a.status === 'draft') return 'draft';
  return a.is_locked ? 'published' : 'unlocked';
}

export function useMonthAssessments(month: string) {
  return useQuery({
    queryKey: assessmentKeys.month(month),
    queryFn: async (): Promise<Assessment[]> => {
      const { data, error } = await supabase.from('monthly_assessments').select('*').eq('month', monthKeyToDate(month));
      if (error) throw error;
      return data;
    },
  });
}

export function useAssessment(vid: string, month: string) {
  return useQuery({
    queryKey: assessmentKeys.one(vid, month),
    queryFn: async (): Promise<Assessment | null> => {
      const { data, error } = await supabase
        .from('monthly_assessments')
        .select('*')
        .eq('videographer_id', vid)
        .eq('month', monthKeyToDate(month))
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUnlockHistory(assessmentId: string | undefined) {
  return useQuery({
    queryKey: assessmentKeys.unlocks(assessmentId ?? ''),
    enabled: Boolean(assessmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('assessment_unlocks')
        .select('id, reason, unlocked_at, by:profiles!assessment_unlocks_unlocked_by_fkey(full_name)')
        .eq('assessment_id', assessmentId!)
        .order('unlocked_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** Every assessment for one videographer (admin view), newest first. */
export function usePersonAssessments(vid: string) {
  return useQuery({
    queryKey: assessmentKeys.forPerson(vid),
    queryFn: async (): Promise<Assessment[]> => {
      const { data, error } = await supabase.from('monthly_assessments').select('*').eq('videographer_id', vid).order('month', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

/** The signed-in videographer's published assessments (RLS hides drafts), oldest first for charts. */
export function useMyAssessments() {
  const profile = useProfile();
  return useQuery({
    queryKey: assessmentKeys.mine(profile.id),
    queryFn: async (): Promise<Assessment[]> => {
      const { data, error } = await supabase.from('monthly_assessments').select('*').eq('videographer_id', profile.id).order('month');
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [assessmentKeys.all, ['activity'], ['tasks'], ['leaderboard']]) void queryClient.invalidateQueries({ queryKey: key });
  };
}

export function useComputeMonth() {
  const invalidate = useInvalidate();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (month: string) => {
      const { data, error } = await supabase.rpc('compute_month_assessments', { p_month: monthKeyToDate(month) });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useComputeAssessment() {
  const invalidate = useInvalidate();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ vid, month }: { vid: string; month: string }) => {
      const { data, error } = await supabase.rpc('compute_assessment', { p_videographer_id: vid, p_month: monthKeyToDate(month) });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export interface AssessmentEdits {
  discretionary_score: number | null;
  bonus_points: number;
  bonus_reason: string;
  admin_remarks: string;
  public_note: string;
}

async function saveEdits(id: string, e: AssessmentEdits) {
  const { error } = await supabase
    .from('monthly_assessments')
    .update({
      discretionary_score: e.discretionary_score,
      bonus_points: e.bonus_points,
      bonus_reason: e.bonus_points > 0 ? e.bonus_reason.trim() || null : null,
      admin_remarks: e.admin_remarks.trim() || null,
      public_note: e.public_note.trim() || null,
    })
    .eq('id', id);
  if (error) throw error;
}

export function useSaveAssessment() {
  const invalidate = useInvalidate();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: ({ id, edits }: { id: string; edits: AssessmentEdits }) => saveEdits(id, edits),
    onSuccess: invalidate,
  });
}

/** Save the latest edits, then publish (which refreshes metrics one last time and locks). */
export function usePublishAssessment() {
  const invalidate = useInvalidate();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ id, edits }: { id: string; edits: AssessmentEdits }) => {
      await saveEdits(id, edits);
      const { data, error } = await supabase.rpc('publish_assessment', { p_assessment_id: id });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export function useUnlockAssessment() {
  const invalidate = useInvalidate();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const { error } = await supabase.rpc('unlock_assessment', { p_assessment_id: id, p_reason: reason.trim() });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

/** Tasks of everyone in a month (for the team "planned vs completed" export). */
export async function fetchMonthTasks(month: string) {
  const { data, error } = await supabase
    .from('tasks')
    .select('title, status, due_date, max_points, points_awarded, quality_rating, first_submitted_at, videographer:profiles!tasks_videographer_id_fkey(full_name), client:clients(name), category:task_categories(name), plan:monthly_plans!inner(status)')
    .eq('month', monthKeyToDate(month))
    .eq('plan.status', 'published')
    .order('due_date');
  if (error) throw error;
  return data;
}
