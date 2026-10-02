-- CrewBoard Row Level Security.
-- Principle: admins see everything; a videographer sees only their own rows, and only
-- for plans the admin has published. Cross-user data (leaderboard, featured work)
-- is exposed exclusively through SECURITY DEFINER RPCs that return safe columns.

-- Base privileges. Recent Supabase versions no longer auto-grant table/function access
-- to API roles, so grant explicitly; RLS (below) then decides which rows are visible.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to authenticated, service_role;

-- Nothing in this app is public: strip the anon role.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon, public;

-- Internal SECURITY DEFINER helpers must never be callable by end users.
revoke execute on function public.log_activity(text, text, uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify(uuid, text, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_admins(text, text, text, text) from public, anon, authenticated;
revoke execute on function public.enqueue_sheet_sync(uuid, text) from public, anon, authenticated;
revoke execute on function public.is_month_locked(uuid, date) from public, anon;
revoke execute on function public.current_weights() from public, anon;
revoke execute on function public.is_admin() from public, anon;

-- ---------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.clients              enable row level security;
alter table public.videographer_clients enable row level security;
alter table public.task_categories      enable row level security;
alter table public.monthly_plans        enable row level security;
alter table public.tasks                enable row level security;
alter table public.task_references      enable row level security;
alter table public.submissions          enable row level security;
alter table public.task_reviews         enable row level security;
alter table public.app_settings         enable row level security;
alter table public.monthly_assessments  enable row level security;
alter table public.assessment_unlocks   enable row level security;
alter table public.featured_work        enable row level security;
alter table public.activity_log         enable row level security;
alter table public.notifications        enable row level security;
alter table public.sheet_configs        enable row level security;
alter table public.sheet_row_state      enable row level security;
alter table public.sheet_outbox         enable row level security;
alter table public.sync_runs            enable row level security;
alter table public.sync_events          enable row level security;

-- profiles ------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
-- Own row (phone/avatar only — enforced by profiles_guard) or admin.
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()))
  with check (id = (select auth.uid()) or (select public.is_admin()));
-- Inserts/deletes happen only via the service role (admin-users Edge Function).

-- clients -------------------------------------------------------------------
create policy clients_select on public.clients for select to authenticated
  using (
    (select public.is_admin())
    or exists (
      select 1 from public.videographer_clients vc
      where vc.client_id = clients.id and vc.videographer_id = (select auth.uid())
    )
  );
create policy clients_admin_insert on public.clients for insert to authenticated
  with check ((select public.is_admin()));
create policy clients_admin_update on public.clients for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy clients_admin_delete on public.clients for delete to authenticated
  using ((select public.is_admin()));

-- videographer_clients ------------------------------------------------------
create policy vc_select on public.videographer_clients for select to authenticated
  using (videographer_id = (select auth.uid()) or (select public.is_admin()));
create policy vc_admin_insert on public.videographer_clients for insert to authenticated
  with check ((select public.is_admin()));
create policy vc_admin_update on public.videographer_clients for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy vc_admin_delete on public.videographer_clients for delete to authenticated
  using ((select public.is_admin()));

-- task_categories -----------------------------------------------------------
create policy categories_select on public.task_categories for select to authenticated using (true);
create policy categories_admin_insert on public.task_categories for insert to authenticated
  with check ((select public.is_admin()));
create policy categories_admin_update on public.task_categories for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_admin_delete on public.task_categories for delete to authenticated
  using ((select public.is_admin()));

-- monthly_plans -------------------------------------------------------------
create policy plans_select on public.monthly_plans for select to authenticated
  using (
    (select public.is_admin())
    or (videographer_id = (select auth.uid()) and status = 'published')
  );
create policy plans_admin_insert on public.monthly_plans for insert to authenticated
  with check ((select public.is_admin()));
create policy plans_admin_update on public.monthly_plans for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy plans_admin_delete on public.monthly_plans for delete to authenticated
  using ((select public.is_admin()));

-- tasks ---------------------------------------------------------------------
-- Videographers never write tasks directly; they use start_task/submit_task RPCs.
create policy tasks_select on public.tasks for select to authenticated
  using (
    (select public.is_admin())
    or (
      videographer_id = (select auth.uid())
      and exists (
        select 1 from public.monthly_plans p
        where p.id = tasks.plan_id and p.status = 'published'
      )
    )
  );
create policy tasks_admin_insert on public.tasks for insert to authenticated
  with check ((select public.is_admin()));
create policy tasks_admin_update on public.tasks for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy tasks_admin_delete on public.tasks for delete to authenticated
  using ((select public.is_admin()));

-- task_references -----------------------------------------------------------
create policy refs_select on public.task_references for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.tasks t where t.id = task_references.task_id)  -- tasks RLS applies
  );
create policy refs_admin_insert on public.task_references for insert to authenticated
  with check ((select public.is_admin()));
create policy refs_admin_update on public.task_references for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy refs_admin_delete on public.task_references for delete to authenticated
  using ((select public.is_admin()));

-- submissions (append-only; inserted only through submit_task) -------------
create policy submissions_select on public.submissions for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.tasks t where t.id = submissions.task_id)
  );

-- task_reviews (inserted only through review_task) --------------------------
create policy reviews_select on public.task_reviews for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.tasks t where t.id = task_reviews.task_id)
  );

-- app_settings --------------------------------------------------------------
create policy settings_select on public.app_settings for select to authenticated using (true);
create policy settings_admin_update on public.app_settings for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- monthly_assessments -------------------------------------------------------
create policy assessments_select on public.monthly_assessments for select to authenticated
  using (
    (select public.is_admin())
    or (videographer_id = (select auth.uid()) and status = 'published')
  );
create policy assessments_admin_insert on public.monthly_assessments for insert to authenticated
  with check ((select public.is_admin()));
create policy assessments_admin_update on public.monthly_assessments for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy assessments_admin_delete on public.monthly_assessments for delete to authenticated
  using ((select public.is_admin()) and status = 'draft');

-- assessment_unlocks (inserted only through unlock_assessment) --------------
create policy unlocks_select on public.assessment_unlocks for select to authenticated
  using ((select public.is_admin()));

-- featured_work (others read via get_featured_work) -------------------------
create policy featured_admin_select on public.featured_work for select to authenticated
  using ((select public.is_admin()));
create policy featured_admin_insert on public.featured_work for insert to authenticated
  with check ((select public.is_admin()));
create policy featured_admin_update on public.featured_work for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy featured_admin_delete on public.featured_work for delete to authenticated
  using ((select public.is_admin()));

-- activity_log (written only by SECURITY DEFINER code) ----------------------
create policy activity_select on public.activity_log for select to authenticated
  using ((select public.is_admin()) or videographer_id = (select auth.uid()));

-- notifications (read own; mark read via mark_notifications_read) -----------
create policy notifications_select on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

-- sheets & sync: admin read, admin manages configs, service role does the rest
create policy sheet_configs_admin_select on public.sheet_configs for select to authenticated
  using ((select public.is_admin()));
create policy sheet_configs_admin_insert on public.sheet_configs for insert to authenticated
  with check ((select public.is_admin()));
create policy sheet_configs_admin_update on public.sheet_configs for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy sheet_configs_admin_delete on public.sheet_configs for delete to authenticated
  using ((select public.is_admin()));
create policy sheet_row_state_admin_select on public.sheet_row_state for select to authenticated
  using ((select public.is_admin()));
create policy sheet_outbox_admin_select on public.sheet_outbox for select to authenticated
  using ((select public.is_admin()));
create policy sync_runs_admin_select on public.sync_runs for select to authenticated
  using ((select public.is_admin()));
create policy sync_events_admin_select on public.sync_events for select to authenticated
  using ((select public.is_admin()));

-- Belt and braces: tables written only by SECURITY DEFINER code get no direct
-- write privileges for end users at all.
revoke insert, update, delete on public.submissions, public.task_reviews, public.activity_log,
  public.notifications, public.assessment_unlocks, public.sheet_row_state, public.sheet_outbox,
  public.sync_runs, public.sync_events
  from authenticated;
revoke insert, delete on public.profiles, public.app_settings from authenticated;

-- Live notification badge
alter publication supabase_realtime add table public.notifications;
