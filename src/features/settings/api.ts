import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { lookupKeys } from '@/features/lookups/api';
import { invokeFunction } from '@/lib/functions';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
import { supabase, type Tables } from '@/lib/supabase';

export const settingsKeys = {
  app: ['settings', 'app'] as const,
  sheets: ['settings', 'sheets'] as const,
  sheetInfo: ['settings', 'sheet-info'] as const,
  runs: ['settings', 'sync-runs'] as const,
  events: (filter: object) => ['settings', 'sync-events', filter] as const,
};

export type AppSettings = Tables<'app_settings'>;
export type SheetConfigRow = Tables<'sheet_configs'>;

export function useAppSettings() {
  return useQuery({
    queryKey: settingsKeys.app,
    queryFn: async (): Promise<AppSettings> => {
      const { data, error } = await supabase.from('app_settings').select('*').single();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdateAppSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (patch: Partial<Omit<AppSettings, 'id' | 'updated_at'>>) => {
      const { error } = await supabase.from('app_settings').update(patch).eq('id', true);
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: settingsKeys.app });
      void queryClient.invalidateQueries({ queryKey: ['assessments'] });
    },
  });
}

// --- categories -------------------------------------------------------------------

export function useSaveCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (c: { id?: string; name: string; default_max_points: number; is_active: boolean; sort_order: number }) => {
      const row = { name: c.name.trim(), default_max_points: c.default_max_points, is_active: c.is_active, sort_order: c.sort_order };
      const { error } = c.id ? await supabase.from('task_categories').update(row).eq('id', c.id) : await supabase.from('task_categories').insert(row);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: lookupKeys.categories }),
  });
}

export function useDeleteCategory() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('task_categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: lookupKeys.categories }),
  });
}

// --- Google Sheets ------------------------------------------------------------------

export interface SheetInfo {
  configured: boolean;
  serviceAccountEmail: string | null;
  cronSecretSet: boolean;
  syncEnabled: boolean;
}

export function useSheetInfo() {
  return useQuery({
    queryKey: settingsKeys.sheetInfo,
    staleTime: 5 * 60_000,
    retry: false,
    queryFn: () => invokeFunction<SheetInfo>('sheets', { action: 'info' }),
  });
}

export function useSheetConfigs() {
  return useQuery({
    queryKey: settingsKeys.sheets,
    queryFn: async (): Promise<SheetConfigRow[]> => {
      const { data, error } = await supabase.from('sheet_configs').select('*');
      if (error) throw error;
      return data;
    },
  });
}

export function useSaveSheetConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (c: { id?: string; videographer_id: string; spreadsheet_id: string; tab_name: string; is_enabled?: boolean }) => {
      const row = { videographer_id: c.videographer_id, spreadsheet_id: c.spreadsheet_id, tab_name: c.tab_name.trim(), is_enabled: c.is_enabled ?? true };
      const { data, error } = c.id
        ? await supabase.from('sheet_configs').update(row).eq('id', c.id).select().single()
        : await supabase.from('sheet_configs').insert(row).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

export function useDeleteSheetConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('sheet_configs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });
}

/** New instant-sync tokens for every tab of one spreadsheet (replaces any earlier script). */
export function useIssuePingTokens() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (spreadsheetId: string) => {
      const { data, error } = await supabase.rpc('issue_sheet_ping_tokens', { p_spreadsheet_id: spreadsheetId });
      if (error) throw error;
      return Object.fromEntries(data.map((t) => [t.tab_name, t.token])) as Record<string, string>;
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: settingsKeys.sheets }),
  });
}

export interface SyncResult {
  skipped?: string;
  status?: 'ok' | 'partial' | 'error';
  sheets?: number;
  failed?: number;
  actions?: number;
  rowsWritten?: number;
  errors?: number;
}

/** Sync now (all sheets, or one) — or set up a sheet first with `provision`. */
export function useRunSheets() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: (v: { action: 'sync' | 'provision'; configId?: string }) =>
      invokeFunction<SyncResult>('sheets', { action: v.action, ...(v.configId ? { config_id: v.configId } : {}) }),
    onSuccess: () => {
      for (const key of [['settings'], ['tasks'], ['crew'], ['activity'], ['leaderboard']]) void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export function useSyncRuns(limit = 10) {
  return useQuery({
    queryKey: [...settingsKeys.runs, limit],
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sync_runs')
        .select('id, trigger, status, started_at, finished_at, stats, by:profiles!sync_runs_triggered_by_fkey(full_name)')
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data;
    },
  });
}

export const PROBLEM_KINDS = ['unknown_id', 'missing_id', 'conflict_approved', 'conflict_lww', 'permission_denied', 'bad_link', 'invalid_status', 'error'] as const;

export function useSyncEvents(filter: { problemsOnly: boolean; videographerId?: string }, limit = 50) {
  return useQuery({
    queryKey: settingsKeys.events({ ...filter, limit }),
    refetchInterval: 60_000,
    queryFn: async () => {
      let q = supabase
        .from('sync_events')
        .select('id, kind, row_number, detail, created_at, task:tasks(id, title), config:sheet_configs!inner(videographer_id, tab_name)')
        .order('id', { ascending: false })
        .limit(limit);
      if (filter.problemsOnly) q = q.in('kind', [...PROBLEM_KINDS]);
      if (filter.videographerId) q = q.eq('config.videographer_id', filter.videographerId);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });
}
