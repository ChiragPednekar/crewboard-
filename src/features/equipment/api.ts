import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { CALLER_HANDLES_ERRORS } from '@/lib/query-meta';
import { supabase, type Tables } from '@/lib/supabase';

export type Equipment = Tables<'equipment'>;
export type EquipmentCategory = 'camera' | 'lens' | 'audio' | 'lighting' | 'gimbal' | 'drone' | 'storage' | 'other';
export type EquipmentStatus = 'available' | 'checked_out' | 'maintenance' | 'retired';

export const EQUIPMENT_CATEGORY_LABEL: Record<EquipmentCategory, string> = {
  camera: 'Camera',
  lens: 'Lens',
  audio: 'Audio',
  lighting: 'Lighting',
  gimbal: 'Gimbal / rig',
  drone: 'Drone',
  storage: 'Cards & drives',
  other: 'Other',
};

export const EQUIPMENT_STATUS_LABEL: Record<EquipmentStatus, string> = {
  available: 'Available',
  checked_out: 'Checked out',
  maintenance: 'In repair',
  retired: 'Retired',
};

export interface EquipmentRow extends Equipment {
  holder: { id: string; full_name: string; avatar_url: string | null } | null;
}

export interface EquipmentLogRow {
  id: number;
  action: string;
  note: string | null;
  created_at: string;
  equipment: { name: string } | null;
  videographer: { full_name: string } | null;
}

export const equipmentKeys = {
  all: ['equipment'] as const,
  list: ['equipment', 'list'] as const,
  log: (id: string) => ['equipment', 'log', id] as const,
};

export function useEquipment() {
  return useQuery({
    queryKey: equipmentKeys.list,
    queryFn: async (): Promise<EquipmentRow[]> => {
      const { data, error } = await supabase
        .from('equipment')
        .select('*, holder:profiles!equipment_holder_id_fkey(id, full_name, avatar_url)')
        .order('category')
        .order('name');
      if (error) throw error;
      return data as unknown as EquipmentRow[];
    },
  });
}

export function useEquipmentLog(id: string | null) {
  return useQuery({
    queryKey: equipmentKeys.log(id ?? ''),
    enabled: Boolean(id),
    queryFn: async (): Promise<EquipmentLogRow[]> => {
      const { data, error } = await supabase
        .from('equipment_log')
        .select('id, action, note, created_at, equipment:equipment(name), videographer:profiles!equipment_log_videographer_id_fkey(full_name)')
        .eq('equipment_id', id!)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as unknown as EquipmentLogRow[];
    },
  });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => void queryClient.invalidateQueries({ queryKey: equipmentKeys.all });
}

export function useSaveEquipment() {
  const invalidate = useInvalidate();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (v: { id?: string; name: string; category: EquipmentCategory; serial_no: string; notes: string }) => {
      const row = { name: v.name.trim(), category: v.category, serial_no: v.serial_no.trim() || null, notes: v.notes.trim() || null };
      const { error } = v.id
        ? await supabase.from('equipment').update(row).eq('id', v.id)
        : await supabase.from('equipment').insert(row);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useCheckout() {
  const invalidate = useInvalidate();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (v: { id: string; videographerId: string; dueBack: string; note: string }) => {
      const { error } = await supabase.rpc('checkout_equipment', {
        p_id: v.id,
        p_videographer_id: v.videographerId,
        p_due_back: v.dueBack || undefined,
        p_note: v.note || undefined,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useReturnEquipment() {
  const invalidate = useInvalidate();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (v: { id: string; note?: string }) => {
      const { error } = await supabase.rpc('return_equipment', { p_id: v.id, p_note: v.note || undefined });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetEquipmentStatus() {
  const invalidate = useInvalidate();
  return useMutation({
    ...CALLER_HANDLES_ERRORS,
    mutationFn: async (v: { id: string; status: 'available' | 'maintenance' | 'retired'; note?: string }) => {
      const { error } = await supabase.rpc('set_equipment_status', { p_id: v.id, p_status: v.status, p_note: v.note || undefined });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}
