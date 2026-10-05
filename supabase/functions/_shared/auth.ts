import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

import { HttpError } from './http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

export interface Caller {
  id: string;
  role: 'admin' | 'reviewer' | 'videographer';
  /** Acts as the caller, so RLS, triggers and the activity log see the real user. */
  db: SupabaseClient;
}

/** Service-role client for auth admin calls. Never hand its results back unfiltered. */
export function serviceClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function requireCaller(req: Request): Promise<Caller> {
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) throw new HttpError(401, 'Please sign in again.');

  const db = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await db.auth.getUser(authHeader.slice(7));
  if (userError || !userData.user) throw new HttpError(401, 'Please sign in again.');

  const { data: profile, error } = await db
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', userData.user.id)
    .maybeSingle();
  if (error) throw error;
  if (!profile || !profile.is_active) throw new HttpError(403, 'Your account is not active.');
  return { id: profile.id, role: profile.role, db };
}

export async function requireAdmin(req: Request): Promise<Caller> {
  const caller = await requireCaller(req);
  if (caller.role !== 'admin') throw new HttpError(403, 'Only admins can do that.');
  return caller;
}
