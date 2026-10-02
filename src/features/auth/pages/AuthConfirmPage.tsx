import { useEffect, useRef, useState } from 'react';
import type { EmailOtpType } from '@supabase/supabase-js';
import { LinkIcon } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { FullPageLoader } from '@/components/FullPageLoader';
import { Button } from '@/components/ui/button';
import { friendlyError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

const ALLOWED: EmailOtpType[] = ['invite', 'recovery', 'email', 'email_change'];

/**
 * Landing page for email links built from `{{ .TokenHash }}` (see supabase/templates).
 * Works in any browser — unlike PKCE links, it doesn't need the original tab.
 */
export default function AuthConfirmPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // tokens are single-use; guard against StrictMode double effects

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const tokenHash = params.get('token_hash');
    const type = params.get('type') as EmailOtpType | null;
    if (!tokenHash || !type || !ALLOWED.includes(type)) {
      setError('This link is incomplete. Open it straight from the email.');
      return;
    }
    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: verifyError }) => {
      if (verifyError) {
        setError(friendlyError(verifyError));
        return;
      }
      if (type === 'invite') navigate('/reset-password?mode=invite', { replace: true });
      else if (type === 'recovery') navigate('/reset-password', { replace: true });
      else navigate('/', { replace: true });
    });
  }, [params, navigate]);

  if (!error) return <FullPageLoader label="Verifying your link" />;

  return (
    <div className="text-center">
      <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl border border-border bg-surface-2 text-warning-text">
        <LinkIcon className="h-6 w-6" aria-hidden />
      </div>
      <h1 className="font-display text-2xl font-semibold">We couldn’t verify that link</h1>
      <p className="mt-2 text-sm text-muted-foreground">{error} Links work once and expire after a while.</p>
      <Button asChild className="mt-8 w-full">
        <Link to="/forgot-password">Send a new link</Link>
      </Button>
    </div>
  );
}
