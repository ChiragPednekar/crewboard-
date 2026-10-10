// Small HTTP helpers shared by the Edge Functions.

// Browsers may call these functions only from the app itself (APP_URL). Server-to-server
// callers (the sheet sync, the notification dispatcher) don't use CORS.
const APP_URL = Deno.env.get('APP_URL');

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': APP_URL ? new URL(APP_URL).origin : '*',
  Vary: 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extra },
  });
}

/** Errors with a message that is safe to show to the user. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  // PostgREST errors carry our RPC/trigger messages (already user-facing) plus a SQLSTATE.
  const pg = err as { message?: unknown; code?: unknown };
  if (typeof pg?.message === 'string' && typeof pg?.code === 'string') {
    return json({ error: pg.message, code: pg.code }, pg.code === '42501' ? 403 : 400);
  }
  console.error(err);
  return json({ error: 'Something went wrong on the server.' }, 500);
}

/** Count a call against the caller's limit for `bucket`; 429 when they're over it. */
export async function enforceRateLimit(
  db: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> },
  bucket: string,
  max: number,
  windowSeconds: number,
): Promise<void> {
  const { data, error } = await db.rpc('hit_rate_limit', { p_bucket: bucket, p_max: max, p_window_seconds: windowSeconds });
  if (error) throw error;
  if (data !== true) throw new HttpError(429, 'Too many requests. Please wait a few minutes and try again.');
}
