import { z } from 'zod';

const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
});

const parsed = schema.safeParse(import.meta.env);

/** Null when the app is misconfigured; the root renders a setup screen instead of crashing. */
export const env = parsed.success ? parsed.data : null;
export const envError = parsed.success
  ? null
  : `Missing or invalid environment variables: ${parsed.error.issues.map((i) => i.path.join('.')).join(', ')}`;
