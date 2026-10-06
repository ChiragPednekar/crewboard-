import {
  Activity,
  Award,
  Bell,
  Building2,
  CalendarDays,
  CalendarRange,
  Camera,
  ClipboardCheck,
  Gauge,
  Home,
  ListChecks,
  type LucideIcon,
  Settings,
  Sparkles,
  Trophy,
  Palmtree,
  Users,
} from 'lucide-react';

import type { UserRole } from '@/lib/supabase';

export type NavBadge = 'review' | 'unread' | 'leave' | 'signups';

export interface NavItem {
  to: string;
  label: string;
  /** Short label for the mobile tab bar */
  short?: string;
  icon: LucideIcon;
  end?: boolean;
  /** Also highlight this item on sub-pages under this prefix (e.g. a task opened from "My tasks"). */
  alsoActiveFor?: string;
  badge?: NavBadge;
  /** Desktop sidebar only (the phone tab bar has room for five). */
  desktopOnly?: boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

const ADMIN_NAV: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Leaderboard', icon: Trophy, end: true },
      { to: '/admin', label: 'Dashboard', icon: Gauge, end: true },
      { to: '/admin/review', label: 'Review queue', icon: ClipboardCheck, badge: 'review' },
      { to: '/admin/calendar', label: 'Shoot calendar', icon: CalendarDays },
    ],
  },
  {
    label: 'Manage',
    items: [
      { to: '/admin/videographers', label: 'Videographers', icon: Users, badge: 'signups' },
      { to: '/admin/clients', label: 'Clients', icon: Building2 },
      { to: '/admin/plans', label: 'Monthly plans', icon: CalendarRange },
      { to: '/admin/leave', label: 'Leave', icon: Palmtree, badge: 'leave' },
      { to: '/admin/equipment', label: 'Equipment', icon: Camera },
    ],
  },
  {
    label: 'Performance',
    items: [
      { to: '/admin/assessments', label: 'Assessments', icon: Award },
      { to: '/admin/featured', label: 'Featured work', icon: Sparkles },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/admin/activity', label: 'Activity', icon: Activity },
      { to: '/admin/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const CREW_NAV: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Leaderboard', short: 'Home', icon: Home, end: true },
      { to: '/me', label: 'My tasks', short: 'Tasks', icon: ListChecks, end: true, alsoActiveFor: '/me/tasks/' },
      { to: '/me/calendar', label: 'My calendar', short: 'Calendar', icon: CalendarDays },
      { to: '/me/points', label: 'My points', short: 'Points', icon: Award },
      { to: '/notifications', label: 'Notifications', short: 'Alerts', icon: Bell, badge: 'unread' },
    ],
  },
  {
    label: 'More',
    items: [
      { to: '/me/leave', label: 'Leave', icon: Palmtree, desktopOnly: true },
      { to: '/me/gear', label: 'My gear', icon: Camera, desktopOnly: true },
    ],
  },
];

const REVIEWER_NAV: NavGroup[] = [
  {
    items: [
      { to: '/', label: 'Leaderboard', icon: Trophy, end: true },
      { to: '/admin/review', label: 'Review queue', icon: ClipboardCheck, badge: 'review' },
      { to: '/admin/calendar', label: 'Shoot calendar', icon: CalendarDays },
      { to: '/notifications', label: 'Notifications', icon: Bell, badge: 'unread' },
    ],
  },
];

export function navFor(role: UserRole): NavGroup[] {
  if (role === 'admin') return ADMIN_NAV;
  if (role === 'reviewer') return REVIEWER_NAV;
  return CREW_NAV;
}
