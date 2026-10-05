import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';
import { toast } from 'sonner';

import { FullPageLoader } from '@/components/FullPageLoader';
import { AccountNotReady } from '@/features/auth/pages/AccountNotReady';
import type { UserRole } from '@/lib/supabase';

import { useAuth } from './AuthProvider';

export function roleHome(role: UserRole): string {
  if (role === 'admin') return '/admin';
  if (role === 'reviewer') return '/admin/review';
  return '/me';
}

/** Admin-area pages a reviewer may open (they review work; they don't run the studio). */
export const REVIEWER_PATHS = ['/admin/review', '/admin/tasks/', '/admin/calendar'];

function reviewerMayOpen(path: string): boolean {
  const p = path.split('?')[0] ?? '';
  return REVIEWER_PATHS.some((r) => p === r || p.startsWith(r.endsWith('/') ? r : `${r}/`));
}

/** Gate for every signed-in screen. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Loading your workspace" />;
  if (status === 'no-profile') return <AccountNotReady />;
  if (status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

/**
 * UI-level role gate. The database enforces the same rule with RLS, so bypassing
 * this in the browser only shows empty screens — it never exposes data.
 */
export function RequireRole({ role, roles }: { role?: UserRole; roles?: UserRole[] }) {
  const { profile } = useAuth();
  const allowed = roles ?? (role ? [role] : []);
  const denied = Boolean(profile && !allowed.includes(profile.role));

  useEffect(() => {
    if (denied) toast.error(allowed.includes('videographer') ? 'That area is for videographers.' : 'That area is for admins only.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denied]);

  if (!profile) return null;
  if (denied) return <Navigate to={roleHome(profile.role)} replace />;
  return <Outlet />;
}

/** Is `path` a page this role may open? (A shared device may hand us the previous user's last page.) */
export function canOpen(role: UserRole, path: string): boolean {
  if (path.startsWith('/admin')) return role === 'admin' || (role === 'reviewer' && reviewerMayOpen(path));
  if (path === '/me' || path.startsWith('/me/')) return role === 'videographer';
  return !['/login', '/forgot-password', '/reset-password', '/auth/confirm'].includes(path.split('?')[0] ?? '');
}

/** Login & friends: bounce signed-in users back to where they were going. */
export function RedirectIfSignedIn() {
  const { status, profile } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  if (status === 'loading') return <FullPageLoader />;
  if (status === 'signed-in' && profile) {
    return <Navigate to={from && canOpen(profile.role, from) ? from : '/'} replace />;
  }
  return <Outlet />;
}
