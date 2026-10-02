// Small HTTP helpers shared by the Edge Functions.

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
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
