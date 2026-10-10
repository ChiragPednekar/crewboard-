import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useProfile } from '@/features/auth/AuthProvider';
import { monthKeyToDate } from '@/lib/dates';
import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
import { type Client, type MonthlyPlan, supabase, type Task } from '@/lib/supabase';

/** Everything here is read through RLS: own tasks in published plans only. */
export const crewKeys = {
  all: ['crew'] as const,
  month: (userId: string, month: string) => ['crew', 'month', userId, month] as const,
  task: (id: string) => ['crew', 'task', id] as const,
  clients: (userId: string) => ['crew', 'clients', userId] as const,
};

export interface CrewTask extends Task {
  client: Pick<Client, 'id' | 'name' | 'logo_url'> | null;
  category: { name: string } | null;
  refs_count: number;
}

type CrewTaskRow = Task & {
  client: CrewTask['client'];
  category: CrewTask['category'];
  task_references: { count: number }[];
};

export function useMyMonth(month: string) {
  const profile = useProfile();
  return useQuery({
    queryKey: crewKeys.month(profile.id, month),
    queryFn: async (): Promise<{ plan: MonthlyPlan | null; tasks: CrewTask[] }> => {
      const m = monthKeyToDate(month);
      const [plan, tasks] = await Promise.all([
        supabase.from('monthly_plans').select('*').eq('videographer_id', profile.id).eq('month', m).maybeSingle(),
        supabase
          .from('tasks')
          .select('*, client:clients(id, name, logo_url), category:task_categories(name), task_references(count)')
          .eq('videographer_id', profile.id)
          .eq('month', m)
          .order('due_date')
          .order('created_at'),
      ]);
      if (plan.error) throw plan.error;
      if (tasks.error) throw tasks.error;
      return {
        plan: plan.data,
        tasks: (tasks.data as unknown as CrewTaskRow[]).map(({ task_references, ...t }) => ({
          ...t,
          refs_count: task_references[0]?.count ?? 0,
        })),
      };
    },
  });
}

export function useMyClients() {
  const profile = useProfile();
  return useQuery({
    queryKey: crewKeys.clients(profile.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('videographer_clients')
        .select('client:clients(id, name, logo_url, city, contact_name, contact_phone, is_active)')
        .eq('videographer_id', profile.id);
      if (error) throw error;
      return data
        .map((r) => r.client)
        .filter((c): c is NonNullable<typeof c> => Boolean(c?.is_active))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
  });
}

export interface CrewTaskDetail extends Task {
  client: Client | null;
  category: { name: string } | null;
  plan: { summary: string | null } | null;
}

export function useMyTask(id: string) {
  return useQuery({
    queryKey: crewKeys.task(id),
    queryFn: async (): Promise<CrewTaskDetail | null> => {
      const { data, error } = await supabase
        .from('tasks')
        .select('*, client:clients(*), category:task_categories(name), plan:monthly_plans(summary)')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as CrewTaskDetail | null;
    },
  });
}

/** After any change: refresh my lists, the task, its submissions and my notifications. */
function useInvalidateCrewWork() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: crewKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    void queryClient.invalidateQueries({ queryKey: ['activity'] });
  };
}

export function useStartTask() {
  const invalidate = useInvalidateCrewWork();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('start_task', { p_task_id: id });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export const THUMB_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const THUMB_MAX_BYTES = 5 * 1024 * 1024;

/** Audio a crew member can attach to a submission, by extension (browsers report audio MIME types inconsistently). */
const AUDIO_EXT_TYPES: Record<string, string> = { mp3: 'audio/mpeg', wav: 'audio/wav', m4a: 'audio/mp4' };
export const AUDIO_ACCEPT = '.mp3,.wav,.m4a,audio/mpeg,audio/wav,audio/mp4';
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;

/** The content type to store an audio file with, or null if it isn't an MP3, WAV or M4A. */
export function audioContentType(file: Pick<File, 'name'>): string | null {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return AUDIO_EXT_TYPES[ext] ?? null;
}

export function useSubmitTask() {
  const invalidate = useInvalidateCrewWork();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async ({
      taskId,
      links,
      notes,
      thumbnail,
      audio,
    }: {
      taskId: string;
      links: string[];
      notes: string;
      thumbnail: File | null;
      audio: File | null;
    }) => {
      let thumbnailPath: string | undefined;
      if (thumbnail) {
        if (!THUMB_TYPES.includes(thumbnail.type)) throw new Error('The thumbnail must be a JPG, PNG or WebP image.');
        if (thumbnail.size > THUMB_MAX_BYTES) throw new Error('The thumbnail must be 5 MB or smaller.');
        const ext = thumbnail.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'jpg';
        thumbnailPath = `${taskId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('thumbnails').upload(thumbnailPath, thumbnail, { contentType: thumbnail.type });
        if (upErr) throw upErr;
      }
      let audioPath: string | undefined;
      if (audio) {
        const contentType = audioContentType(audio);
        if (!contentType) throw new Error('The audio must be an MP3, WAV or M4A file.');
        if (audio.size > AUDIO_MAX_BYTES) throw new Error('The audio file must be 50 MB or smaller.');
        audioPath = `${taskId}/${crypto.randomUUID()}.${audio.name.split('.').pop()!.toLowerCase()}`;
        const { error: upErr } = await supabase.storage.from('submission-audio').upload(audioPath, audio, { contentType });
        if (upErr) throw upErr;
      }
      const { data, error } = await supabase.rpc('submit_task', {
        p_task_id: taskId,
        p_links: links,
        p_notes: notes.trim() || undefined,
        p_thumbnail_path: thumbnailPath,
        p_audio_path: audioPath,
        p_audio_name: audio?.name,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: invalidate,
  });
}

export { useThumbnailUrl } from '@/features/tasks/api';
