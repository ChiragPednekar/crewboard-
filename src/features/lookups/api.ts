import { type QueryClient, useQuery } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

/** Small reference lists used by pickers across the admin screens. */
export const lookupKeys = {
  categories: ['lookups', 'categories'] as const,
  clients: ['lookups', 'clients'] as const,
  crew: ['lookups', 'crew'] as const,
};

export function useCategories() {
  return useQuery({
    queryKey: lookupKeys.categories,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('task_categories')
        .select('id, name, default_max_points, is_active, sort_order')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

export type ClientOption = { id: string; name: string; type: string; city: string | null; logo_url: string | null; is_active: boolean };

export function useClientOptions() {
  return useQuery({
    queryKey: lookupKeys.clients,
    queryFn: async (): Promise<ClientOption[]> => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, name, type, city, logo_url, is_active')
        .order('name');
      if (error) throw error;
      return data;
    },
  });
}

export type CrewOption = { id: string; full_name: string; avatar_url: string | null; is_active: boolean };

/** Videographers (active first) for pickers. */
export function useCrewOptions() {
  return useQuery({
    queryKey: lookupKeys.crew,
    queryFn: async (): Promise<CrewOption[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, avatar_url, is_active')
        .eq('role', 'videographer')
        .eq('approval_status', 'approved')
        .order('is_active', { ascending: false })
        .order('full_name');
      if (error) throw error;
      return data;
    },
  });
}

/**
 * Anything that changes tasks or plans can move numbers on many screens
 * (plan builder, crew cards, client work, review badge). Refresh them together.
 */
export function invalidateWork(queryClient: QueryClient) {
  return Promise.all(
    [['tasks'], ['plans'], ['videographers'], ['clients'], ['activity'], ['leaderboard']].map((queryKey) =>
      queryClient.invalidateQueries({ queryKey }),
    ),
  );
}
