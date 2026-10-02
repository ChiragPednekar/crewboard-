-- CrewBoard core schema
-- All timestamps are timestamptz (UTC). Months are stored as a date pinned to the 1st.
-- due_date is a calendar date interpreted in Asia/Kolkata (deadline = end of that IST day).

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'videographer');
create type public.plan_status as enum ('draft', 'published');
create type public.task_status as enum (
  'assigned', 'in_progress', 'submitted', 'revision_requested', 'approved', 'cancelled'
);
create type public.task_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.submission_source as enum ('app', 'sheet');
create type public.review_decision as enum ('approved', 'revision_requested');
create type public.assessment_status as enum ('draft', 'published');
create type public.reference_kind as enum ('link', 'file', 'note');
create type public.sheet_mode as enum ('own_sheet', 'master_tab');
create type public.actor_kind as enum ('user', 'sheet', 'system');
create type public.sync_event_kind as enum (
  'updated', 'submission_created', 'written', 'unknown_id', 'missing_id',
  'conflict_approved', 'conflict_lww', 'permission_denied', 'bad_link',
  'invalid_status', 'error'
);

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- First day of the month for a date (month key).
create or replace function public.month_start(d date)
returns date
language sql
immutable
set search_path = ''
as $$ select date_trunc('month', d)::date $$;

-- Deadline for a due date: the instant the *next* day starts in India (exclusive bound).
create or replace function public.due_deadline(d date)
returns timestamptz
language sql
immutable
set search_path = ''
as $$ select ((d + 1)::timestamp at time zone 'Asia/Kolkata') $$;

-- Today's date in India.
create or replace function public.today_ist()
returns date
language sql
stable
set search_path = ''
as $$ select (now() at time zone 'Asia/Kolkata')::date $$;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null check (char_length(btrim(full_name)) between 2 and 120),
  email          text not null,
  phone          text check (phone is null or phone ~ '^[0-9+() -]{6,20}$'),
  avatar_url     text,
  role           public.user_role not null default 'videographer',
  base_location  text check (base_location is null or char_length(base_location) <= 120),
  is_active      boolean not null default true,
  deactivated_at timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint profiles_deactivated_consistent
    check ((is_active and deactivated_at is null) or (not is_active and deactivated_at is not null))
);
create unique index profiles_email_key on public.profiles (lower(email));
create index profiles_role_active_idx on public.profiles (role, is_active);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  name          text not null check (char_length(btrim(name)) between 2 and 160),
  type          text not null default 'other'
                check (type in ('hospital', 'clinic', 'brand', 'corporate', 'education', 'event', 'other')),
  address       text,
  city          text,
  contact_name  text,
  contact_phone text,
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  logo_url      text,
  notes         text,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index clients_name_key on public.clients (lower(name));

create table public.videographer_clients (
  videographer_id uuid not null references public.profiles (id) on delete cascade,
  client_id       uuid not null references public.clients (id) on delete cascade,
  assigned_at     timestamptz not null default now(),
  assigned_by     uuid references public.profiles (id) on delete set null,
  primary key (videographer_id, client_id)
);
create index videographer_clients_client_idx on public.videographer_clients (client_id);

-- ---------------------------------------------------------------------------
-- task categories (admin editable)
-- ---------------------------------------------------------------------------
create table public.task_categories (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null check (char_length(btrim(name)) between 2 and 60),
  default_max_points integer not null default 10 check (default_max_points between 1 and 1000),
  sort_order         integer not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index task_categories_name_key on public.task_categories (lower(name));

-- ---------------------------------------------------------------------------
-- monthly plans
-- ---------------------------------------------------------------------------
create table public.monthly_plans (
  id              uuid primary key default gen_random_uuid(),
  videographer_id uuid not null references public.profiles (id) on delete restrict,
  month           date not null check (extract(day from month) = 1),
  summary         text check (summary is null or char_length(summary) <= 4000),
  goals           text check (goals is null or char_length(goals) <= 4000),
  status          public.plan_status not null default 'draft',
  published_at    timestamptz,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint monthly_plans_one_per_month unique (videographer_id, month)
);
create index monthly_plans_month_idx on public.monthly_plans (month, status);

-- ---------------------------------------------------------------------------
-- tasks
-- ---------------------------------------------------------------------------
create table public.tasks (
  id                 uuid primary key default gen_random_uuid(),
  plan_id            uuid not null references public.monthly_plans (id) on delete cascade,
  -- videographer_id and month are copied from the plan by trigger (fast filtering + RLS)
  videographer_id    uuid not null references public.profiles (id) on delete restrict,
  month              date not null check (extract(day from month) = 1),
  client_id          uuid not null references public.clients (id) on delete restrict,
  category_id        uuid not null references public.task_categories (id) on delete restrict,
  title              text not null check (char_length(btrim(title)) between 2 and 200),
  brief              text check (brief is null or char_length(brief) <= 8000),
  priority           public.task_priority not null default 'normal',
  due_date           date not null,
  max_points         integer not null check (max_points between 1 and 1000),
  status             public.task_status not null default 'assigned',
  status_changed_at  timestamptz not null default now(),
  status_changed_via public.submission_source not null default 'app',
  videographer_notes text check (videographer_notes is null or char_length(videographer_notes) <= 4000),
  first_submitted_at timestamptz,
  last_submitted_at  timestamptz,
  approved_at        timestamptz,
  points_awarded     integer check (points_awarded is null or points_awarded >= 0),
  quality_rating     smallint check (quality_rating is null or quality_rating between 1 and 5),
  sheet_row_ref      text,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint tasks_points_within_max check (points_awarded is null or points_awarded <= max_points),
  constraint tasks_approved_has_points check (status <> 'approved' or points_awarded is not null)
);
create index tasks_plan_idx on public.tasks (plan_id);
create index tasks_videographer_month_idx on public.tasks (videographer_id, month);
create index tasks_videographer_status_idx on public.tasks (videographer_id, status);
create index tasks_month_status_idx on public.tasks (month, status);
create index tasks_client_idx on public.tasks (client_id);
create index tasks_category_idx on public.tasks (category_id);
create index tasks_open_due_idx on public.tasks (due_date)
  where status not in ('approved', 'cancelled');

-- ---------------------------------------------------------------------------
-- task references
-- ---------------------------------------------------------------------------
create table public.task_references (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references public.tasks (id) on delete cascade,
  kind         public.reference_kind not null,
  url          text check (url is null or url ~* '^https?://'),
  storage_path text,
  title        text check (title is null or char_length(title) <= 200),
  note         text check (note is null or char_length(note) <= 4000),
  meta         jsonb not null default '{}'::jsonb,
  sort_order   integer not null default 0,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint task_references_shape check (
    (kind = 'link' and url is not null)
    or (kind = 'file' and storage_path is not null)
    or (kind = 'note' and note is not null)
  )
);
create index task_references_task_idx on public.task_references (task_id, sort_order);

-- ---------------------------------------------------------------------------
-- submissions (append-only history)
-- ---------------------------------------------------------------------------
create table public.submissions (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks (id) on delete restrict,
  version        integer not null check (version >= 1),
  links          text[] not null
                 check (cardinality(links) between 1 and 5),
  thumbnail_path text,
  notes          text check (notes is null or char_length(notes) <= 4000),
  source         public.submission_source not null default 'app',
  submitted_by   uuid references public.profiles (id) on delete set null,
  submitted_at   timestamptz not null default now(),
  is_on_time     boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint submissions_version_unique unique (task_id, version)
);
create index submissions_task_idx on public.submissions (task_id, version desc);
create index submissions_submitted_at_idx on public.submissions (submitted_at desc);

-- ---------------------------------------------------------------------------
-- reviews
-- ---------------------------------------------------------------------------
create table public.task_reviews (
  id             uuid primary key default gen_random_uuid(),
  task_id        uuid not null references public.tasks (id) on delete restrict,
  submission_id  uuid references public.submissions (id) on delete set null,
  reviewer_id    uuid references public.profiles (id) on delete set null,
  decision       public.review_decision not null,
  points_awarded integer check (points_awarded is null or points_awarded >= 0),
  quality_rating smallint check (quality_rating is null or quality_rating between 1 and 5),
  feedback       text check (feedback is null or char_length(feedback) <= 4000),
  reviewed_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  constraint task_reviews_shape check (
    (decision = 'approved' and points_awarded is not null and quality_rating is not null)
    or (decision = 'revision_requested' and feedback is not null and char_length(btrim(feedback)) > 0)
  )
);
create index task_reviews_task_idx on public.task_reviews (task_id, reviewed_at desc);
create index task_reviews_submission_idx on public.task_reviews (submission_id);

-- ---------------------------------------------------------------------------
-- app settings (singleton)
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                    boolean primary key default true check (id),
  weight_points         numeric(5, 2) not null default 60 check (weight_points >= 0),
  weight_completion     numeric(5, 2) not null default 20 check (weight_completion >= 0),
  weight_punctuality    numeric(5, 2) not null default 10 check (weight_punctuality >= 0),
  weight_discretionary  numeric(5, 2) not null default 10 check (weight_discretionary >= 0),
  sheet_mode            public.sheet_mode not null default 'own_sheet',
  master_spreadsheet_id text,
  sync_enabled          boolean not null default false,
  updated_by            uuid references public.profiles (id) on delete set null,
  updated_at            timestamptz not null default now(),
  constraint app_settings_weights_sum check (
    weight_points + weight_completion + weight_punctuality + weight_discretionary = 100
  )
);
insert into public.app_settings (id) values (true);

-- ---------------------------------------------------------------------------
-- monthly assessments
-- ---------------------------------------------------------------------------
create table public.monthly_assessments (
  id                  uuid primary key default gen_random_uuid(),
  videographer_id     uuid not null references public.profiles (id) on delete restrict,
  month               date not null check (extract(day from month) = 1),
  -- raw metrics (snapshot)
  assigned_count      integer not null default 0 check (assigned_count >= 0),
  approved_count      integer not null default 0 check (approved_count >= 0),
  submitted_count     integer not null default 0 check (submitted_count >= 0),
  on_time_count       integer not null default 0 check (on_time_count >= 0),
  points_awarded_sum  integer not null default 0 check (points_awarded_sum >= 0),
  max_points_sum      integer not null default 0 check (max_points_sum >= 0),
  -- ratios 0..1 (rounded to 4dp)
  points_pct          numeric(5, 4) not null default 0 check (points_pct between 0 and 1),
  completion_pct      numeric(5, 4) not null default 0 check (completion_pct between 0 and 1),
  punctuality_pct     numeric(5, 4) not null default 0 check (punctuality_pct between 0 and 1),
  -- weight snapshot {"points":60,"completion":20,"punctuality":10,"discretionary":10}
  weights             jsonb not null,
  discretionary_score numeric(4, 2) check (discretionary_score is null or discretionary_score between 0 and 10),
  bonus_points        numeric(6, 2) not null default 0 check (bonus_points between 0 and 100),
  bonus_reason        text check (bonus_reason is null or char_length(bonus_reason) <= 500),
  base_score          numeric(6, 2) not null default 0,   -- weighted score out of 100
  total_score         numeric(6, 2) not null default 0,   -- base + bonus
  admin_remarks       text check (admin_remarks is null or char_length(admin_remarks) <= 4000),
  public_note         text check (public_note is null or char_length(public_note) <= 280),
  status              public.assessment_status not null default 'draft',
  is_locked           boolean not null default false,
  computed_at         timestamptz not null default now(),
  published_at        timestamptz,
  published_by        uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint monthly_assessments_one_per_month unique (videographer_id, month),
  constraint monthly_assessments_bonus_reason check (bonus_points = 0 or bonus_reason is not null),
  constraint monthly_assessments_published_complete check (
    status = 'draft' or (discretionary_score is not null and published_at is not null)
  )
);
create index monthly_assessments_month_idx on public.monthly_assessments (month, status);

create table public.assessment_unlocks (
  id            uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.monthly_assessments (id) on delete cascade,
  unlocked_by   uuid references public.profiles (id) on delete set null,
  reason        text not null check (char_length(btrim(reason)) between 5 and 1000),
  unlocked_at   timestamptz not null default now()
);
create index assessment_unlocks_assessment_idx on public.assessment_unlocks (assessment_id);

-- ---------------------------------------------------------------------------
-- featured work
-- ---------------------------------------------------------------------------
create table public.featured_work (
  id         uuid primary key default gen_random_uuid(),
  month      date not null check (extract(day from month) = 1),
  task_id    uuid not null references public.tasks (id) on delete cascade,
  rank       smallint not null check (rank between 1 and 10),  -- 1 = Best Work, 2+ = runner-ups
  reason     text check (reason is null or char_length(reason) <= 600),
  chosen_by  uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint featured_work_rank_unique unique (month, rank),
  constraint featured_work_task_unique unique (month, task_id)
);
create index featured_work_task_idx on public.featured_work (task_id);

-- ---------------------------------------------------------------------------
-- activity log & notifications
-- ---------------------------------------------------------------------------
create table public.activity_log (
  id              bigint generated always as identity primary key,
  actor_id        uuid references public.profiles (id) on delete set null,
  actor_kind      public.actor_kind not null default 'user',
  action          text not null,
  entity_type     text not null,
  entity_id       uuid,
  videographer_id uuid references public.profiles (id) on delete set null,
  summary         text,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index activity_log_created_idx on public.activity_log (created_at desc);
create index activity_log_videographer_idx on public.activity_log (videographer_id, created_at desc);
create index activity_log_entity_idx on public.activity_log (entity_type, entity_id);
create index activity_log_actor_idx on public.activity_log (actor_id);

create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null,
  title      text not null,
  body       text,
  link       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Google Sheets sync
-- ---------------------------------------------------------------------------
create table public.sheet_configs (
  id                uuid primary key default gen_random_uuid(),
  videographer_id   uuid not null references public.profiles (id) on delete cascade,
  spreadsheet_id    text not null check (spreadsheet_id ~ '^[A-Za-z0-9_-]{20,}$'),
  tab_name          text not null default 'Tasks' check (char_length(tab_name) between 1 and 100),
  is_enabled        boolean not null default true,
  provisioned_at    timestamptz,
  last_synced_at    timestamptz,
  last_status       text check (last_status is null or last_status in ('ok', 'partial', 'error')),
  last_error        text,
  last_rows_updated integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint sheet_configs_one_per_videographer unique (videographer_id)
);

create table public.sheet_row_state (
  task_id            uuid primary key references public.tasks (id) on delete cascade,
  sheet_config_id    uuid not null references public.sheet_configs (id) on delete cascade,
  last_status        text,
  last_link          text,
  last_notes         text,
  last_sheet_edit_at timestamptz,
  last_written_at    timestamptz,
  last_read_at       timestamptz,
  row_hash           text
);
create index sheet_row_state_config_idx on public.sheet_row_state (sheet_config_id);

create table public.sheet_outbox (
  id           bigint generated always as identity primary key,
  task_id      uuid not null references public.tasks (id) on delete cascade,
  reason       text not null,
  enqueued_at  timestamptz not null default now(),
  processed_at timestamptz,
  attempts     integer not null default 0,
  last_error   text
);
create unique index sheet_outbox_pending_task_key on public.sheet_outbox (task_id) where processed_at is null;
create index sheet_outbox_pending_idx on public.sheet_outbox (enqueued_at) where processed_at is null;

create table public.sync_runs (
  id           uuid primary key default gen_random_uuid(),
  trigger      text not null check (trigger in ('cron', 'manual')),
  triggered_by uuid references public.profiles (id) on delete set null,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'ok', 'partial', 'error')),
  stats        jsonb not null default '{}'::jsonb
);
create index sync_runs_started_idx on public.sync_runs (started_at desc);

create table public.sync_events (
  id              bigint generated always as identity primary key,
  run_id          uuid not null references public.sync_runs (id) on delete cascade,
  sheet_config_id uuid references public.sheet_configs (id) on delete set null,
  task_id         uuid references public.tasks (id) on delete set null,
  row_number      integer,
  kind            public.sync_event_kind not null,
  detail          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now()
);
create index sync_events_run_idx on public.sync_events (run_id);
create index sync_events_config_idx on public.sync_events (sheet_config_id, created_at desc);
create index sync_events_task_idx on public.sync_events (task_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger task_categories_updated_at before update on public.task_categories
  for each row execute function public.set_updated_at();
create trigger monthly_plans_updated_at before update on public.monthly_plans
  for each row execute function public.set_updated_at();
create trigger tasks_updated_at before update on public.tasks
  for each row execute function public.set_updated_at();
create trigger task_references_updated_at before update on public.task_references
  for each row execute function public.set_updated_at();
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();
create trigger monthly_assessments_updated_at before update on public.monthly_assessments
  for each row execute function public.set_updated_at();
create trigger featured_work_updated_at before update on public.featured_work
  for each row execute function public.set_updated_at();
create trigger sheet_configs_updated_at before update on public.sheet_configs
  for each row execute function public.set_updated_at();
