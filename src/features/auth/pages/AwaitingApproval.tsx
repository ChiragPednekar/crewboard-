import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock, LogOut, UserX } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/UserAvatar';
import { timeAgo } from '@/lib/dates';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';

import { accessFromToken, useAuth } from '../AuthProvider';

interface MyAccess {
  status: 'approved' | 'pending' | 'declined';
  full_name: string;
  email: string;
  avatar_url: string | null;
  requested_at: string;
}

const CHECK_EVERY_MS = 20_000;

/**
 * Shown to a signed-up account until an admin approves it. Its session has no data
 * access; refreshing the session picks up the approval (the token hook re-reads it),
 * at which point the app loads normally.
 */
export function AwaitingApproval({ declined = false }: { declined?: boolean }) {
  const { signOut, session } = useAuth();
  const me = useQuery({
    queryKey: ['my-access', session?.user.id],
    queryFn: async (): Promise<MyAccess | null> => {
      const { data, error } = await supabase.rpc('my_access');
      if (error) throw error;
      return data as unknown as MyAccess | null;
    },
  });
  useEffect(() => {
    if (declined) return;
    let busy = false;
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return;
      busy = true;
      const { data } = await supabase.auth.refreshSession();
      busy = false;
      if (accessFromToken(data.session?.access_token) === 'approved') toast.success('You’re in. Welcome to CrewBoard!');
    };
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [declined]);

  const name = me.data?.full_name ?? session?.user.email ?? '';

  return (
    <div className="studio-glow grid min-h-dvh place-items-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-7 text-center shadow-lift">
        <div
          className={cn(
            'mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl',
            declined ? 'bg-danger/12 text-danger-text' : 'bg-warning/12 text-warning-text',
          )}
        >
          {declined ? <UserX className="h-6 w-6" aria-hidden /> : <Clock className="h-6 w-6" aria-hidden />}
        </div>
        <h1 className="font-display text-2xl font-semibold">{declined ? 'Your request wasn’t approved' : 'Waiting for approval'}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {declined
            ? 'The studio admin declined this account. If you think that’s a mistake, contact them directly.'
            : 'Thanks for signing up. Your studio admin has been asked to approve your account. This page lets you in by itself as soon as they do.'}
        </p>

        {name && (
          <div className="mt-6 flex items-center gap-3 rounded-xl border border-border bg-background/40 p-3 text-left">
            <UserAvatar name={name} src={me.data?.avatar_url ?? null} className="h-10 w-10 text-sm" labelled />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {me.data?.email ?? session?.user.email}
                {me.data?.requested_at && !declined ? ` · requested ${timeAgo(me.data.requested_at)}` : ''}
              </p>
            </div>
          </div>
        )}

        <Button variant="secondary" className="mt-6 w-full" onClick={() => void signOut()}>
          <LogOut /> Sign out
        </Button>
      </div>
    </div>
  );
}
