/**
 * Turn Supabase / Postgres / network errors into short, human messages.
 * Our RPCs raise friendly messages with specific SQLSTATEs — those pass through.
 */
interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

const PASS_THROUGH_CODES = new Set(['22023', 'P0002', '55000', '23514']);

export function friendlyError(error: unknown): string {
  if (!error) return 'Something went wrong.';
  if (typeof error === 'string') return error;

  const e = error as ErrorLike;
  const message = e.message ?? '';

  if (e.name === 'TypeError' && /fetch/i.test(message)) {
    return "Can't reach the server. Check your connection and try again.";
  }
  if (/invalid login credentials/i.test(message)) return 'Email or password is incorrect.';
  if (/email not confirmed/i.test(message)) return 'Your email address has not been confirmed yet.';
  if (/user is banned/i.test(message)) return 'This account has been deactivated. Contact your admin.';
  if (/new password should be different/i.test(message)) return 'Choose a password you have not used before.';
  if (/rate limit/i.test(message)) return 'Too many attempts. Please wait a minute and try again.';
  if (/jwt expired|invalid jwt/i.test(message)) return 'Your session expired. Please sign in again.';

  if (e.code && PASS_THROUGH_CODES.has(e.code) && !/violates check constraint/i.test(message)) {
    return message;
  }
  switch (e.code) {
    case '42501':
      return /permission denied|row-level security/i.test(message)
        ? "You don't have permission to do that."
        : message || "You don't have permission to do that.";
    case '23505':
      return 'That already exists.';
    case '23503':
      return 'This is still in use elsewhere, so it can’t be removed.';
    case '23514':
      return 'Some values are not valid. Check the form and try again.';
    case 'PGRST116':
      return 'Not found.';
  }
  // Other database errors can name tables or columns: never show those raw.
  if (e.code) return 'Something went wrong. Please try again.';
  return message || 'Something went wrong.';
}
