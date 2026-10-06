import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, UserPlus, X } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { UserAvatar } from '@/components/UserAvatar';
import { pendingSignupCountKey } from '@/app/layouts/useNavBadges';
import { useAuth } from '@/features/auth/AuthProvider';
import { timeAgo } from '@/lib/dates';
import { friendlyError } from '@/lib/errors';
import { supabase, type Profile } from '@/lib/supabase';

type Request = Pick<Profile, 'id' | 'full_name' | 'email' | 'avatar_url' | 'created_at' | 'approval_status' | 'approval_decided_at'>;

export const signupKeys = { all: ['signup-requests'] as const };

export function useSignupRequests() {
  const { isAdmin } = useAuth();
  return useQuery({
    queryKey: signupKeys.all,
    enabled: isAdmin,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Request[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, avatar_url, created_at, approval_status, approval_decided_at')
        .in('approval_status', ['pending', 'declined'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

function useDecide() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (v: { id: string; approve: boolean; role?: 'videographer' | 'reviewer' }) => {
      const { error } = await supabase.rpc('decide_signup', {
        p_user_id: v.id,
        p_approve: v.approve,
        p_role: v.role ?? 'videographer',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: signupKeys.all });
      void queryClient.invalidateQueries({ queryKey: pendingSignupCountKey });
      void queryClient.invalidateQueries({ queryKey: ['videographers'] });
      void queryClient.invalidateQueries({ queryKey: ['lookups'] });
    },
  });
}

function RequestRow({ r }: { r: Request }) {
  const decide = useDecide();
  const [role, setRole] = useState<'videographer' | 'reviewer'>('videographer');
  const declined = r.approval_status === 'declined';
  const busy = decide.isPending;

  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar name={r.full_name} src={r.avatar_url} className="h-9 w-9 text-xs" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{r.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {r.email} · {declined && r.approval_decided_at ? `declined ${timeAgo(r.approval_decided_at)}` : `signed up ${timeAgo(r.created_at)}`}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
          <SelectTrigger className="h-9 w-[150px]" aria-label={`Role for ${r.full_name}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="videographer">Videographer</SelectItem>
            <SelectItem value="reviewer">Reviewer</SelectItem>
          </SelectContent>
        </Select>
        <Button
          size="sm"
          loading={busy && decide.variables?.approve === true}
          disabled={busy}
          onClick={() =>
            decide.mutate(
              { id: r.id, approve: true, role },
              {
                onSuccess: () => toast.success(`${r.full_name} can now sign in as a ${role}`),
                onError: (e) => toast.error(friendlyError(e)),
              },
            )
          }
        >
          {!(busy && decide.variables?.approve) && <Check />} Approve
        </Button>
        {!declined && (
          <Button
            size="sm"
            variant="ghost"
            loading={busy && decide.variables?.approve === false}
            disabled={busy}
            onClick={() =>
              decide.mutate(
                { id: r.id, approve: false },
                {
                  onSuccess: () => toast.success(`Declined ${r.full_name}`),
                  onError: (e) => toast.error(friendlyError(e)),
                },
              )
            }
          >
            {!(busy && decide.variables?.approve === false) && <X />} Decline
          </Button>
        )}
      </div>
    </li>
  );
}

/** People who signed up with Google and are waiting for an admin. */
export function SignupRequests() {
  const requests = useSignupRequests();
  const [showDeclined, setShowDeclined] = useState(false);
  const pending = (requests.data ?? []).filter((r) => r.approval_status === 'pending');
  const declined = (requests.data ?? []).filter((r) => r.approval_status === 'declined');
  if (pending.length === 0 && declined.length === 0) return null;

  return (
    <Card className="mb-5 border-primary/40 p-4">
      {pending.length > 0 && (
        <>
          <p className="flex items-center gap-2 text-sm font-medium">
            <UserPlus className="h-4 w-4 text-primary-text" aria-hidden /> Sign-up requests ({pending.length})
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">They signed up with Google and can’t see anything until you approve them.</p>
          <ul className="mt-1 divide-y divide-border/70">
            {pending.map((r) => (
              <RequestRow key={r.id} r={r} />
            ))}
          </ul>
        </>
      )}
      {declined.length > 0 && (
        <div className={pending.length > 0 ? 'mt-2 border-t border-border/70 pt-2' : ''}>
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showDeclined}
            onClick={() => setShowDeclined((s) => !s)}
          >
            <ChevronDown className={showDeclined ? 'h-3.5 w-3.5 rotate-180 transition-transform' : 'h-3.5 w-3.5 transition-transform'} aria-hidden />
            Declined requests ({declined.length})
          </button>
          {showDeclined && (
            <ul className="divide-y divide-border/70">
              {declined.map((r) => (
                <RequestRow key={r.id} r={r} />
              ))}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
