import { FunctionsHttpError } from '@supabase/supabase-js';

import { supabase } from './supabase';

/**
 * Call an Edge Function and surface its `{ error }` message as a normal Error,
 * so `friendlyError` and toasts show what the server actually said.
 */
export async function invokeFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const payload = (await error.context.json().catch(() => null)) as { error?: string; code?: string } | null;
      throw Object.assign(new Error(payload?.error ?? 'The server could not complete that request.'), {
        code: payload?.code,
      });
    }
    throw error;
  }
  return data as T;
}
