import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { supabase, type Profile } from '@/lib/supabase';

type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'no-profile';

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Supabase's default emails (used until custom SMTP + our templates are set up) link to
 * `/#access_token=…&type=invite|recovery`. supabase-js signs the person in and clears the
 * hash, so read the link type before it does: an invitee must still choose a password.
 */
function readEmailLink(): { type: string | null; error: string | null } {
  if (typeof window === 'undefined') return { type: null, error: null };
  const hash = new URLSearchParams(window.location.hash.slice(1));
  return { type: hash.get('type'), error: hash.get('error_description') };
}
const emailLink = readEmailLink();

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    if (emailLink.error) {
      toast.error(`${emailLink.error.replace(/\+/g, ' ')}. Ask for a new link.`);
      emailLink.error = null;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionLoaded(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      setSessionLoaded(true);
      if (event === 'SIGNED_OUT') {
        queryClient.clear();
      }
      if (event === 'PASSWORD_RECOVERY') {
        navigate('/reset-password', { replace: true });
      }
      if (next && emailLink.type === 'invite' && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) {
        emailLink.type = null;
        navigate('/reset-password?mode=invite', { replace: true });
      }
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, queryClient]);

  const userId = session?.user.id;
  const profileQuery = useQuery({
    queryKey: profileQueryKey(userId),
    enabled: Boolean(userId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const profile = profileQuery.data ?? null;

  // A deactivated account is also banned in Auth; this covers an already-open session.
  useEffect(() => {
    if (profile && !profile.is_active) {
      toast.error('This account has been deactivated. Contact your admin.');
      void supabase.auth.signOut();
    }
  }, [profile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }, [navigate]);

  const status: AuthStatus = !sessionLoaded
    ? 'loading'
    : !session
      ? 'signed-out'
      : profileQuery.isPending
        ? 'loading'
        : profile
          ? 'signed-in'
          : 'no-profile';

  const value = useMemo<AuthContextValue>(
    () => ({ status, session, profile, isAdmin: profile?.role === 'admin', signOut }),
    [status, session, profile, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

/** For screens that are only reachable when signed in. */
export function useProfile(): Profile {
  const { profile } = useAuth();
  if (!profile) throw new Error('useProfile used outside a signed-in route');
  return profile;
}
