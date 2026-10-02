import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { invalidateWork } from '@/features/lookups/api';
import { monthKeyToDate } from '@/lib/dates';
import type { Database } from '@/lib/database.types';
import { type Json, supabase, type Task, type TaskReference } from '@/lib/supabase';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
export { fetchLinkMeta } from '@/lib/linkMeta';

import type { RefDraft, TaskFormValues } from './schemas';

export const taskKeys = {
  all: ['tasks'] as const,
  plan: (videographerId: string, month: string) => ['tasks', 'plan', videographerId, month] as const,
  detail: (id: string) => ['tasks', 'detail', id] as const,
  refs: (id: string) => ['tasks', 'refs', id] as const,
  submissions: (id: string) => ['tasks', 'submissions', id] as const,
  fileUrl: (path: string) => ['tasks', 'file-url', path] as const,
};

/** A task row as listed in plans (with names instead of ids). */
export interface TaskListItem extends Task {
  client: { id: string; name: string; logo_url: string | null } | null;
  category: { id: string; name: string } | null;
  refs_count: number;
  submissions_count: number;
}

const LIST_SELECT =
  '*, client:clients(id, name, logo_url), category:task_categories(id, name), task_references(count), submissions(count)';

type ListRow = Task & {
  client: TaskListItem['client'];
  category: TaskListItem['category'];
  task_references: { count: number }[];
  submissions: { count: number }[];
};

function toListItem({ task_references, submissions, ...t }: ListRow): TaskListItem {
  return { ...t, refs_count: task_references[0]?.count ?? 0, submissions_count: submissions[0]?.count ?? 0 };
}

export function usePlanTasks(videographerId: string, month: string) {
  return useQuery({
    queryKey: taskKeys.plan(videographerId, month),
    queryFn: async (): Promise<TaskListItem[]> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(LIST_SELECT)
        .eq('videographer_id', videographerId)
        .eq('month', monthKeyToDate(month))
        .order('due_date')
        .order('created_at');
      if (error) throw error;
      return (data as unknown as ListRow[]).map(toListItem);
    },
  });
}

export interface TaskDetail extends TaskListItem {
  plan: { id: string; status: 'draft' | 'published' } | null;
  videographer: { id: string; full_name: string; avatar_url: string | null; is_active: boolean } | null;
}

export function useTask(id: string) {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: async (): Promise<TaskDetail | null> => {
      const { data, error } = await supabase
        .from('tasks')
        .select(
          `${LIST_SELECT}, plan:monthly_plans(id, status), videographer:profiles!tasks_videographer_id_fkey(id, full_name, avatar_url, is_active)`,
        )
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as ListRow & Pick<TaskDetail, 'plan' | 'videographer'>;
      return { ...toListItem(row), plan: row.plan, videographer: row.videographer };
    },
  });
}

export function useTaskSubmissions(taskId: string) {
  return useQuery({
    queryKey: taskKeys.submissions(taskId),
    queryFn: async () => {
      const [subs, reviews] = await Promise.all([
        supabase.from('submissions').select('*').eq('task_id', taskId).order('version', { ascending: false }),
        supabase
          .from('task_reviews')
          .select('*, reviewer:profiles!task_reviews_reviewer_id_fkey(full_name)')
          .eq('task_id', taskId)
          .order('reviewed_at', { ascending: false }),
      ]);
      if (subs.error) throw subs.error;
      if (reviews.error) throw reviews.error;
      return { submissions: subs.data, reviews: reviews.data };
    },
  });
}

// ---------------------------------------------------------------------------
// Task mutations
// ---------------------------------------------------------------------------

function taskPayload(v: TaskFormValues) {
  return {
    client_id: v.client_id,
    category_id: v.category_id,
    title: v.title.trim(),
    brief: v.brief.trim(),
    priority: v.priority,
    due_date: v.due_date,
    max_points: v.max_points,
  };
}

function refPayload(refs: RefDraft[]): Json {
  return refs.map((r) =>
    r.kind === 'link'
      ? { kind: 'link', url: r.url.trim(), title: r.title.trim() || null, meta: r.meta as Json }
      : { kind: 'note', note: r.note.trim() },
  );
}

export function useCreateTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ month, values }: { month: string; values: TaskFormValues }) => {
      const { data, error } = await supabase.rpc('create_tasks', {
        p_month: monthKeyToDate(month),
        p_videographer_ids: values.assignees,
        p_task: taskPayload(values),
        p_refs: refPayload(values.refs),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => void invalidateWork(queryClient),
  });
}

export function useUpdateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ id, values }: { id: string; values: TaskFormValues }) => {
      const p = taskPayload(values);
      const { error } = await supabase
        .from('tasks')
        .update({ ...p, brief: p.brief || null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => void invalidateWork(queryClient),
  });
}

export function useCancelTask() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({ id, reason }: { id: string; reason?: string }) => {
      const { error } = await supabase.rpc('cancel_task', { p_task_id: id, p_reason: reason || undefined });
      if (error) throw error;
    },
    onSuccess: () => void invalidateWork(queryClient),
  });
}

export function useRestoreTask() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('restore_task', { p_task_id: id });
      if (error) throw error;
    },
    onSuccess: () => void invalidateWork(queryClient),
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (id: string) => {
      // grab file paths first: the rows cascade away with the task
      const { data: files } = await supabase.from('task_references').select('storage_path').eq('task_id', id).eq('kind', 'file');
      const { error } = await supabase.from('tasks').delete().eq('id', id);
      if (error) throw error;
      const paths = (files ?? []).map((f) => f.storage_path).filter((p): p is string => Boolean(p));
      if (paths.length) await supabase.storage.from('task-refs').remove(paths);
    },
    onSuccess: () => void invalidateWork(queryClient),
  });
}

// ---------------------------------------------------------------------------
// References
// ---------------------------------------------------------------------------

export function useTaskReferences(taskId: string) {
  return useQuery({
    queryKey: taskKeys.refs(taskId),
    queryFn: async (): Promise<TaskReference[]> => {
      const { data, error } = await supabase
        .from('task_references')
        .select('*')
        .eq('task_id', taskId)
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return data;
    },
  });
}

function useInvalidateRefs(taskId: string) {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: taskKeys.refs(taskId) }),
      queryClient.invalidateQueries({ queryKey: ['tasks', 'plan'] }),
      queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) }),
      queryClient.invalidateQueries({ queryKey: ['activity'] }),
    ]);
}

async function nextSortOrder(taskId: string): Promise<number> {
  const { data } = await supabase
    .from('task_references')
    .select('sort_order')
    .eq('task_id', taskId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data?.sort_order ?? 0) + 1;
}

export function useAddReference(taskId: string) {
  const invalidate = useInvalidateRefs(taskId);
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (draft: RefDraft) => {
      const base = { task_id: taskId, sort_order: await nextSortOrder(taskId) };
      const row: Database['public']['Tables']['task_references']['Insert'] =
        draft.kind === 'link'
          ? { ...base, kind: 'link' as const, url: draft.url.trim(), title: draft.title.trim() || null, meta: draft.meta as Json }
          : { ...base, kind: 'note' as const, note: draft.note.trim() };
      const { error } = await supabase.from('task_references').insert(row);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export const REF_FILE_TYPES = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf',
  'video/mp4', 'video/quicktime', 'text/plain', 'application/zip',
];
export const REF_FILE_MAX_BYTES = 50 * 1024 * 1024;

export function safeFileName(name: string): string {
  const cleaned = name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '-').slice(-80);
  return cleaned.replace(/^[.-]+/, '') || 'file';
}

export function useUploadReference(taskId: string) {
  const invalidate = useInvalidateRefs(taskId);
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (file: File) => {
      if (!REF_FILE_TYPES.includes(file.type)) {
        throw new Error('That file type isn’t supported. Use an image, PDF, MP4/MOV, text or ZIP file.');
      }
      if (file.size > REF_FILE_MAX_BYTES) throw new Error('Files must be 50 MB or smaller. Share a link for bigger files.');
      const path = `${taskId}/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error: upErr } = await supabase.storage.from('task-refs').upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { error } = await supabase.from('task_references').insert({
        task_id: taskId,
        kind: 'file',
        storage_path: path,
        title: file.name.slice(0, 200),
        meta: { size: file.size, type: file.type },
        sort_order: await nextSortOrder(taskId),
      });
      if (error) {
        await supabase.storage.from('task-refs').remove([path]);
        throw error;
      }
    },
    onSuccess: invalidate,
  });
}

export function useDeleteReference(taskId: string) {
  const invalidate = useInvalidateRefs(taskId);
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (ref: Pick<TaskReference, 'id' | 'kind' | 'storage_path'>) => {
      const { error } = await supabase.from('task_references').delete().eq('id', ref.id);
      if (error) throw error;
      if (ref.kind === 'file' && ref.storage_path) await supabase.storage.from('task-refs').remove([ref.storage_path]);
    },
    onSuccess: invalidate,
  });
}

/** Short-lived signed URL for a private reference file. */
export function useFileUrl(path: string | null, enabled = true) {
  return useQuery({
    queryKey: taskKeys.fileUrl(path ?? ''),
    enabled: Boolean(path) && enabled,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('task-refs').createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

/** Signed URL for a submission thumbnail (private bucket). */
export function useThumbnailUrl(path: string | null) {
  return useQuery({
    queryKey: ['thumb', path ?? ''],
    enabled: Boolean(path),
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('thumbnails').createSignedUrl(path!, 60 * 60);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}
