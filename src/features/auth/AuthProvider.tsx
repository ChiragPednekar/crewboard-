import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import { supabase, type Profile } from '@/lib/supabase';

type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'no-profile' | 'awaiting-approval' | 'declined';

export type AccessStatus = 'approved' | 'pending' | 'declined';

/**
 * The access token hook stamps each session with `crewboard_access`. Sessions of
 * sign-ups that wait for approval carry the `anon` database role, so they can read
 * nothing; the app shows the waiting screen instead of loading the workspace.
 */
export function accessFromToken(accessToken: string | undefined): AccessStatus {
  if (!accessToken) return 'approved';
  try {
    const part = accessToken.split('.')[1] ?? '';
    const claims = JSON.parse(atob(part.replace(/-/g, '+').replace(/_/g, '/'))) as { crewboard_access?: string };
    return claims.crewboard_access === 'pending' || claims.crewboard_access === 'declined' ? claims.crewboard_access : 'approved';
  } catch {
    return 'approved';
  }
}

interface AuthContextValue {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  isAdmin: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const profileQueryKey = (userId: string | undefined) => ['profile', userId] as const;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
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
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [navigate, queryClient]);

  const userId = session?.user.id;
  const access = accessFromToken(session?.access_token);
  const profileQuery = useQuery({
    queryKey: profileQueryKey(userId),
    enabled: Boolean(userId) && access === 'approved',
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
      : access === 'pending'
        ? 'awaiting-approval'
        : access === 'declined'
          ? 'declined'
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
