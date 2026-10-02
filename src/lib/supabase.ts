import { createClient } from '@supabase/supabase-js';

import type { Database } from './database.types';
import { env } from './env';

export const supabase = createClient<Database>(
  env?.VITE_SUPABASE_URL ?? 'http://invalid.local',
  env?.VITE_SUPABASE_ANON_KEY ?? 'missing-key-missing-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

export type Profile = Tables<'profiles'>;
export type UserRole = Enums<'user_role'>;
export type TaskStatus = Enums<'task_status'>;
export type Notification = Tables<'notifications'>;
export type Client = Tables<'clients'>;
export type Task = Tables<'tasks'>;
export type TaskPriority = Enums<'task_priority'>;
export type TaskCategory = Tables<'task_categories'>;
export type TaskReference = Tables<'task_references'>;
export type MonthlyPlan = Tables<'monthly_plans'>;
export type PlanStatus = Enums<'plan_status'>;
export type Submission = Tables<'submissions'>;
export type TaskReview = Tables<'task_reviews'>;
export type ActivityEntry = Tables<'activity_log'>;
export type { Json } from './database.types';
