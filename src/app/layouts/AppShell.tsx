import { Suspense, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, LogOut, Menu, UserRound } from 'lucide-react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';

import { Logo } from '@/components/Logo';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { UserAvatar } from '@/components/UserAvatar';
import { useAuth, useProfile } from '@/features/auth/AuthProvider';
import { NotificationBell } from '@/features/notifications/NotificationBell';
import { useNotificationsRealtime } from '@/features/notifications/api';
import { cn } from '@/lib/utils';

import { navFor, type NavGroup, type NavItem } from './nav';
import { useNavBadges } from './useNavBadges';

const COLLAPSE_KEY = 'crewboard-sidebar-collapsed';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function AppShell() {
  const profile = useProfile();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  const groups = navFor(profile.role);
  const isCrew = profile.role === 'videographer';
  const badges = useNavBadges();
  useNotificationsRealtime();

  useEffect(() => setMobileOpen(false), [location.pathname]);

  function toggleCollapsed() {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? '0' : '1');
      } catch {
        /* ignore */
      }
      return !c;
    });
  }

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface/70 transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[76px]' : 'w-[252px]',
        )}
        aria-label="Main navigation"
      >
        <div className={cn('flex h-16 items-center border-b border-border', collapsed ? 'justify-center' : 'px-5')}>
          <Link to="/" aria-label="CrewBoard home">
            <Logo collapsed={collapsed} />
          </Link>
        </div>
        <SidebarNav groups={groups} collapsed={collapsed} badges={badges} className="flex-1 overflow-y-auto px-3 py-4 scrollbar-thin" />
        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleCollapsed}
            className={cn('w-full', collapsed ? 'justify-center px-0' : 'justify-start')}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronsRight /> : <ChevronsLeft />}
            {!collapsed && <span>Collapse</span>}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-border bg-background/80 px-3 backdrop-blur-md sm:px-6">
          {!isCrew && (
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] border-border bg-surface p-0">
                <SheetHeader className="h-16 flex-row items-center space-y-0 border-b border-border px-5 text-left">
                  <SheetTitle asChild>
                    <span>
                      <Logo />
                    </span>
                  </SheetTitle>
                </SheetHeader>
                <SidebarNav groups={groups} collapsed={false} badges={badges} className="px-3 py-4" />
              </SheetContent>
            </Sheet>
          )}
          <Link to="/" className="lg:hidden" aria-label="CrewBoard home">
            <Logo collapsed={!isCrew} className="sm:hidden" />
            <Logo className="hidden sm:inline-flex" />
          </Link>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <main id="main" tabIndex={-1} className={cn('flex-1 outline-none', isCrew && 'pb-24 lg:pb-0')}>
          <div className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            <Suspense fallback={<PageSkeleton />}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeOut' }}
                >
                  <Outlet />
                </motion.div>
              </AnimatePresence>
            </Suspense>
          </div>
        </main>
      </div>

      {isCrew && <BottomTabs groups={groups} unread={badges.unread} />}
    </div>
  );
}

function SidebarNav({
  groups,
  collapsed,
  badges,
  className,
}: {
  groups: NavGroup[];
  collapsed: boolean;
  badges: Record<string, number>;
  className?: string;
}) {
  return (
    <nav className={className}>
      {groups.map((group, gi) => (
        <div key={group.label ?? gi} className={cn(gi > 0 && 'mt-6')}>
          {group.label &&
            (collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden />
            ) : (
              <p className="mb-2 px-3 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                {group.label}
              </p>
            ))}
          <ul className="space-y-1">
            {group.items.map((item) => (
              <li key={item.to}>
                <SidebarLink item={item} collapsed={collapsed} count={item.badge ? (badges[item.badge] ?? 0) : 0} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/** Exact-match items stop being exact on their own sub-pages (see NavItem.alsoActiveFor). */
function useEnd(item: NavItem): boolean | undefined {
  const { pathname } = useLocation();
  return item.end && !(item.alsoActiveFor && pathname.startsWith(item.alsoActiveFor));
}

function SidebarLink({ item, collapsed, count }: { item: NavItem; collapsed: boolean; count: number }) {
  const Icon = item.icon;
  const end = useEnd(item);
  const link = (
    <NavLink
      to={item.to}
      end={end}
      aria-label={collapsed ? (count > 0 ? `${item.label} (${count})` : item.label) : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-surface-2 text-foreground'
            : 'text-muted-foreground hover:bg-surface-2/60 hover:text-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full bg-primary" aria-hidden />}
          <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-primary-text')} aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
          {count > 0 &&
            (collapsed ? (
              <span className="absolute right-3 top-2 h-2 w-2 rounded-full bg-primary" aria-hidden />
            ) : (
              <span className="tabular ml-auto rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-semibold text-primary-text">
                {count}
              </span>
            ))}
        </>
      )}
    </NavLink>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function BottomTabs({ groups, unread }: { groups: NavGroup[]; unread: number }) {
  const items = groups.flatMap((g) => g.items);
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Main navigation"
      className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface/95 backdrop-blur-md lg:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {items.map((item) => {
          const Icon = item.icon;
          const count = item.badge === 'unread' ? unread : 0;
          const end = item.end && !(item.alsoActiveFor && pathname.startsWith(item.alsoActiveFor));
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
                    isActive ? 'text-primary-text' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="tab-indicator"
                        className="absolute inset-x-6 top-0 h-[3px] rounded-b-full bg-primary"
                        aria-hidden
                      />
                    )}
                    <span className="relative">
                      <Icon className="h-[22px] w-[22px]" aria-hidden />
                      {count > 0 && (
                        <span className="tabular absolute -right-2.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                          {count > 9 ? '9+' : count}
                        </span>
                      )}
                    </span>
                    <span>{item.short ?? item.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function UserMenu() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-10 gap-2 px-1.5 sm:pr-3" aria-label="Account menu">
          <UserAvatar name={profile.full_name} src={profile.avatar_url} className="h-8 w-8" />
          <span className="hidden max-w-[140px] truncate text-sm font-medium text-foreground sm:inline">
            {profile.full_name.split(' ')[0]}
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{profile.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
          <p className="mt-1.5 inline-flex rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium capitalize text-primary-text">
            {profile.role}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/profile">
            <UserRound /> Profile & password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PageSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-2 h-8 w-56" />
      <Skeleton className="mb-8 h-4 w-80 max-w-full" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-72 rounded-xl" />
    </div>
  );
}
