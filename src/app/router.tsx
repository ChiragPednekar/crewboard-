import { lazy, Suspense } from 'react';
import { createBrowserRouter, Outlet } from 'react-router';

import { FullPageLoader } from '@/components/FullPageLoader';
import { AuthProvider } from '@/features/auth/AuthProvider';
import { RedirectIfSignedIn, RequireAuth, RequireRole } from '@/features/auth/guards';

import { NotFoundPage, RouteErrorPage } from './errors';
import { AppShell } from './layouts/AppShell';
import { AuthLayout } from './layouts/AuthLayout';

const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const ForgotPasswordPage = lazy(() => import('@/features/auth/pages/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('@/features/auth/pages/ResetPasswordPage'));
const AuthConfirmPage = lazy(() => import('@/features/auth/pages/AuthConfirmPage'));
const ProfilePage = lazy(() => import('@/features/profile/ProfilePage'));
const StyleguidePage = lazy(() => import('@/features/design/StyleguidePage'));
const VideographersPage = lazy(() => import('@/features/videographers/VideographersPage'));
const VideographerDetailPage = lazy(() => import('@/features/videographers/VideographerDetailPage'));
const ClientsPage = lazy(() => import('@/features/clients/ClientsPage'));
const ClientDetailPage = lazy(() => import('@/features/clients/ClientDetailPage'));
const PlansPage = lazy(() => import('@/features/plans/PlansPage'));
const TaskAdminPage = lazy(() => import('@/features/tasks/TaskAdminPage'));
const CrewDashboardPage = lazy(() => import('@/features/crew/CrewDashboardPage'));
const CrewTaskPage = lazy(() => import('@/features/crew/CrewTaskPage'));
const NotificationsPage = lazy(() => import('@/features/notifications/NotificationsPage'));
const AdminDashboardPage = lazy(() => import('@/features/dashboard/AdminDashboardPage'));
const ReviewQueuePage = lazy(() => import('@/features/review/ReviewQueuePage'));
const ReviewPage = lazy(() => import('@/features/review/ReviewPage'));
const AssessmentsPage = lazy(() => import('@/features/assessments/AssessmentsPage'));
const AssessmentEditorPage = lazy(() => import('@/features/assessments/AssessmentEditorPage'));
const ActivityPage = lazy(() => import('@/features/activity/ActivityPage'));
const PointsPage = lazy(() => import('@/features/crew/PointsPage'));
const HomePage = lazy(() => import('@/features/home/HomePage'));
const FeaturedPickerPage = lazy(() => import('@/features/home/FeaturedPickerPage'));
const SettingsPage = lazy(() => import('@/features/settings/SettingsPage'));
const CalendarPage = lazy(() => import('@/features/calendar/CalendarPage'));
const ApprovePage = lazy(() => import('@/features/client-review/ApprovePage'));
const PrivacyPage = lazy(() => import('@/features/legal/LegalPages').then((m) => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('@/features/legal/LegalPages').then((m) => ({ default: m.TermsPage })));
const MyLeavePage = lazy(() => import('@/features/leave/LeavePages').then((m) => ({ default: m.MyLeavePage })));
const AdminLeavePage = lazy(() => import('@/features/leave/LeavePages').then((m) => ({ default: m.AdminLeavePage })));
const EquipmentPage = lazy(() => import('@/features/equipment/EquipmentPages').then((m) => ({ default: m.EquipmentPage })));
const MyGearPage = lazy(() => import('@/features/equipment/EquipmentPages').then((m) => ({ default: m.MyGearPage })));

/** AuthProvider needs router context (navigate on recovery / sign-out). */
function Root() {
  return (
    <AuthProvider>
      <Suspense fallback={<FullPageLoader />}>
        <Outlet />
      </Suspense>
    </AuthProvider>
  );
}

export const router = createBrowserRouter([
  {
    element: <Root />,
    errorElement: <RouteErrorPage />,
    children: [
      // Public auth screens
      {
        element: <AuthLayout />,
        children: [
          {
            element: <RedirectIfSignedIn />,
            children: [
              { path: '/login', element: <LoginPage /> },
              { path: '/forgot-password', element: <ForgotPasswordPage /> },
            ],
          },
          { path: '/reset-password', element: <ResetPasswordPage /> },
          { path: '/auth/confirm', element: <AuthConfirmPage /> },
        ],
      },

      // Public pages (no account): legal pages and the client approval link
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/terms', element: <TermsPage /> },
      { path: '/approve/:token', element: <ApprovePage /> },

      // Signed-in app
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/', element: <HomePage /> },
              { path: '/notifications', element: <NotificationsPage /> },
              { path: '/profile', element: <ProfilePage /> },

              {
                path: '/admin',
                // reviewers review work; everything else in /admin is for admins
                element: <RequireRole roles={['admin', 'reviewer']} />,
                children: [
                  { path: 'review', element: <ReviewQueuePage /> },
                  { path: 'review/:taskId', element: <ReviewPage /> },
                  { path: 'tasks/:id', element: <TaskAdminPage /> },
                  { path: 'calendar', element: <CalendarPage /> },
                  {
                    element: <RequireRole role="admin" />,
                    children: [
                      { index: true, element: <AdminDashboardPage /> },
                      { path: 'videographers', element: <VideographersPage /> },
                      { path: 'videographers/:id', element: <VideographerDetailPage /> },
                      { path: 'clients', element: <ClientsPage /> },
                      { path: 'clients/:id', element: <ClientDetailPage /> },
                      { path: 'plans', element: <PlansPage /> },
                      { path: 'leave', element: <AdminLeavePage /> },
                      { path: 'equipment', element: <EquipmentPage /> },
                      { path: 'assessments', element: <AssessmentsPage /> },
                      { path: 'assessments/:videographerId/:month', element: <AssessmentEditorPage /> },
                      { path: 'featured', element: <FeaturedPickerPage /> },
                      { path: 'activity', element: <ActivityPage /> },
                      { path: 'settings', element: <SettingsPage /> },
                      { path: 'styleguide', element: <StyleguidePage /> },
                    ],
                  },
                ],
              },

              {
                path: '/me',
                element: <RequireRole role="videographer" />,
                children: [
                  { index: true, element: <CrewDashboardPage /> },
                  { path: 'tasks/:id', element: <CrewTaskPage /> },
                  { path: 'points', element: <PointsPage /> },
                  { path: 'calendar', element: <CalendarPage /> },
                  { path: 'leave', element: <MyLeavePage /> },
                  { path: 'gear', element: <MyGearPage /> },
                ],
              },

              { path: '*', element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
]);
