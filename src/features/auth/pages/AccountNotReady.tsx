import { UserX } from 'lucide-react';

import { EmptyState } from '@/components/EmptyState';
import { Button } from '@/components/ui/button';

import { useAuth } from '../AuthProvider';

/** Signed in, but no profile row exists (should not happen for admin-created accounts). */
export function AccountNotReady() {
  const { signOut } = useAuth();
  return (
    <div className="studio-glow grid min-h-dvh place-items-center px-4">
      <EmptyState
        icon={UserX}
        title="Your account isn’t set up yet"
        description="We couldn’t find a CrewBoard profile for this login. Ask your studio admin to finish creating your account."
        action={
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        }
        className="max-w-lg bg-surface"
      />
    </div>
  );
}
