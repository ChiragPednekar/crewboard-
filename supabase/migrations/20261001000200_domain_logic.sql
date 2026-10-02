-- CrewBoard domain logic: identity helpers, invariants, status machine, audit + notifications.

-- ---------------------------------------------------------------------------
-- Identity helpers
-- ---------------------------------------------------------------------------

-- True when the caller is an active admin.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin' and p.is_active
  );
$$;

-- True for service-role requests (Edge Functions) and direct DB sessions
-- (migrations, seed, cron) — i.e. anything that is not an end-user JWT.
create or replace function public.is_service_context()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.role(), 'service_role') = 'service_role';
$$;

create or replace function public.is_privileged()
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.is_service_context() or public.is_admin();
$$;

-- Who is acting: set `app.actor_kind = 'sheet'` (transaction-local) from the sync job.
create or replace function public.current_actor_kind()
returns public.actor_kind
language sql
stable
set search_path = ''
as $$
  select coalesce(
    nullif(current_setting('app.actor_kind', true), ''),
    case when auth.uid() is null then 'system' else 'user' end
  )::public.actor_kind;
$$;

create or replace function public.log_activity(
  p_action          text,
  p_entity_type     text,
  p_entity_id       uuid,
  p_videographer_id uuid,
  p_summary         text,
  p_payload         jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.activity_log (actor_id, actor_kind, action, entity_type, entity_id, videographer_id, summary, payload)
  values (
    (select p.id from public.profiles p where p.id = auth.uid()),
    public.current_actor_kind(),
    p_action, p_entity_type, p_entity_id, p_videographer_id, p_summary, coalesce(p_payload, '{}'::jsonb)
  );
$$;

create or replace function public.notify(
  p_user_id uuid, p_type text, p_title text, p_body text, p_link text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link)
  values (p_user_id, p_type, p_title, p_body, p_link);
$$;

create or replace function public.notify_admins(
  p_type text, p_title text, p_body text, p_link text
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link)
  select p.id, p_type, p_title, p_body, p_link
  from public.profiles p
  where p.role = 'admin' and p.is_active;
$$;

create or replace function public.format_month(p_month date)
returns text
language sql
immutable
set search_path = ''
as $$ select to_char(p_month, 'FMMonth YYYY') $$;

-- ---------------------------------------------------------------------------
-- Profiles: bootstrap from auth.users + privilege guard
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Role comes from app_metadata, which only the service role can set.
  insert into public.profiles (id, email, full_name, role, phone, base_location)
  values (
    new.id,
    new.email,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), new.email),
    coalesce(nullif(new.raw_app_meta_data ->> 'role', '')::public.user_role, 'videographer'),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'base_location'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_privileged() then
    -- A videographer may only edit their own phone and avatar.
    if row(new.id, new.full_name, new.email, new.role, new.base_location, new.is_active, new.deactivated_at)
       is distinct from
       row(old.id, old.full_name, old.email, old.role, old.base_location, old.is_active, old.deactivated_at) then
      raise exception 'Only an admin can change these profile fields' using errcode = '42501';
    end if;
  end if;

  -- An admin cannot lock themselves out.
  if new.id = auth.uid() and (new.role <> old.role or (old.is_active and not new.is_active)) then
    raise exception 'You cannot change your own role or deactivate yourself' using errcode = '42501';
  end if;

  if new.is_active and not old.is_active then
    new.deactivated_at := null;
  elsif not new.is_active and old.is_active then
    new.deactivated_at := coalesce(new.deactivated_at, now());
  end if;
  return new;
end;
$$;

create trigger profiles_guard
  before update on public.profiles
  for each row execute function public.profiles_guard();

-- ---------------------------------------------------------------------------
-- videographer_clients: only videographers can be linked to clients
-- ---------------------------------------------------------------------------
create or replace function public.videographer_clients_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles where id = new.videographer_id and role = 'videographer') then
    raise exception 'Only videographers can be assigned to clients' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger videographer_clients_guard
  before insert or update on public.videographer_clients
  for each row execute function public.videographer_clients_guard();

-- ---------------------------------------------------------------------------
-- monthly_plans: only for videographers; log + notify on publish
-- ---------------------------------------------------------------------------
create or replace function public.monthly_plans_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.videographer_id is distinct from old.videographer_id then
    if not exists (select 1 from public.profiles where id = new.videographer_id and role = 'videographer') then
      raise exception 'Plans can only be created for videographers' using errcode = '23514';
    end if;
  end if;
  if tg_op = 'UPDATE' and (new.videographer_id <> old.videographer_id or new.month <> old.month) then
    raise exception 'A plan''s videographer and month cannot be changed' using errcode = '23514';
  end if;
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  return new;
end;
$$;

create trigger monthly_plans_before_write
  before insert or update on public.monthly_plans
  for each row execute function public.monthly_plans_before_write();

create or replace function public.monthly_plans_after_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if new.status = 'published' and (tg_op = 'INSERT' or old.status <> 'published') then
    select count(*) into v_count from public.tasks where plan_id = new.id and status <> 'cancelled';
    perform public.notify(
      new.videographer_id, 'plan_published',
      'Your plan for ' || public.format_month(new.month) || ' is live',
      v_count || case when v_count = 1 then ' task' else ' tasks' end || ' assigned to you.',
      '/me'
    );
    perform public.log_activity('plan.published', 'monthly_plan', new.id, new.videographer_id,
      'Published plan for ' || public.format_month(new.month), jsonb_build_object('tasks', v_count));
    -- every task in the plan needs to reach the sheet
    insert into public.sheet_outbox (task_id, reason)
    select t.id, 'plan_published'
    from public.tasks t
    join public.sheet_configs c on c.videographer_id = t.videographer_id and c.is_enabled
    where t.plan_id = new.id
    on conflict (task_id) where processed_at is null do nothing;
  end if;
  return null;
end;
$$;

create trigger monthly_plans_after_publish
  after insert or update of status on public.monthly_plans
  for each row execute function public.monthly_plans_after_publish();

-- ---------------------------------------------------------------------------
-- Assessment lock helper
-- ---------------------------------------------------------------------------
create or replace function public.is_month_locked(p_videographer_id uuid, p_month date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.monthly_assessments a
    where a.videographer_id = p_videographer_id and a.month = p_month and a.is_locked
  );
$$;

-- ---------------------------------------------------------------------------
-- Task status machine
-- ---------------------------------------------------------------------------
-- Videographer moves:  assigned→in_progress→submitted, assigned→submitted, in_progress→assigned,
--                      revision_requested→in_progress|submitted
-- Admin-only moves:    submitted|revision_requested→approved, submitted|approved→revision_requested,
--                      *→cancelled, cancelled→assigned
create or replace function public.task_transition_allowed(
  p_from public.task_status, p_to public.task_status, p_as_admin boolean
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when p_from = p_to then true
    when p_from::text || '>' || p_to::text in (
      'assigned>in_progress', 'assigned>submitted', 'in_progress>submitted', 'in_progress>assigned',
      'revision_requested>in_progress', 'revision_requested>submitted'
    ) then true
    when not p_as_admin then false
    when p_to = 'approved' then p_from in ('submitted', 'revision_requested')
    when p_to = 'revision_requested' then p_from in ('submitted', 'approved')
    when p_to = 'cancelled' then true
    when p_from = 'cancelled' then p_to = 'assigned'
    else false
  end;
$$;

create or replace function public.tasks_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_plan public.monthly_plans%rowtype;
begin
  if tg_op = 'UPDATE' and new.plan_id <> old.plan_id then
    raise exception 'A task cannot be moved to another plan' using errcode = '23514';
  end if;

  -- copy owner + month from the plan
  select * into v_plan from public.monthly_plans where id = new.plan_id;
  new.videographer_id := v_plan.videographer_id;
  new.month := v_plan.month;

  if new.max_points is null then
    select c.default_max_points into new.max_points from public.task_categories c where c.id = new.category_id;
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'assigned' and not public.is_service_context() then
      raise exception 'New tasks must start as assigned' using errcode = '23514';
    end if;
    if public.is_month_locked(new.videographer_id, new.month) then
      raise exception 'The % assessment is locked; unlock it before adding tasks', public.format_month(new.month)
        using errcode = '55000';
    end if;
    return new;
  end if;

  -- scoring-relevant change on a locked month?
  if row(new.status, new.points_awarded, new.quality_rating, new.max_points, new.due_date, new.first_submitted_at)
     is distinct from
     row(old.status, old.points_awarded, old.quality_rating, old.max_points, old.due_date, old.first_submitted_at)
     and public.is_month_locked(new.videographer_id, new.month) then
    raise exception 'The % assessment is locked; unlock it before changing this task', public.format_month(new.month)
      using errcode = '55000';
  end if;

  if new.status is distinct from old.status then
    if not public.task_transition_allowed(old.status, new.status, public.is_privileged()) then
      raise exception 'Status change % → % is not allowed', old.status, new.status using errcode = '42501';
    end if;
    -- callers in a trusted context may backdate (seed/import); otherwise stamp now()
    if new.status_changed_at is not distinct from old.status_changed_at then
      new.status_changed_at := now();
    end if;
    if new.status = 'approved' then
      new.approved_at := coalesce(new.approved_at, now());
    elsif old.status = 'approved' then
      new.approved_at := null;
      new.points_awarded := null;
      new.quality_rating := null;
    end if;
  end if;

  if new.status <> 'approved' and new.points_awarded is not null and old.status <> 'approved' then
    raise exception 'Points can only be awarded on approval' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tasks_before_write
  before insert or update on public.tasks
  for each row execute function public.tasks_before_write();

create or replace function public.tasks_before_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_month_locked(old.videographer_id, old.month) then
    raise exception 'The % assessment is locked; unlock it before deleting tasks', public.format_month(old.month)
      using errcode = '55000';
  end if;
  return old;
end;
$$;

create trigger tasks_before_delete
  before delete on public.tasks
  for each row execute function public.tasks_before_delete();

-- audit + notifications for task lifecycle
create or replace function public.tasks_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan_status public.plan_status;
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('task.created', 'task', new.id, new.videographer_id, new.title,
      jsonb_build_object('due_date', new.due_date, 'max_points', new.max_points));
    select status into v_plan_status from public.monthly_plans where id = new.plan_id;
    if v_plan_status = 'published' then
      perform public.notify(new.videographer_id, 'task_assigned', 'New task: ' || new.title,
        'Due ' || to_char(new.due_date, 'DD Mon') || ' · ' || new.max_points || ' pts', '/me/tasks/' || new.id);
    end if;
    return null;
  end if;

  -- submissions and reviews log themselves; here we only cover the other status moves
  if new.status is distinct from old.status
     and new.status in ('in_progress', 'assigned', 'cancelled')
  then
    perform public.log_activity('task.status_changed', 'task', new.id, new.videographer_id, new.title,
      jsonb_build_object('from', old.status, 'to', new.status, 'via', new.status_changed_via));
    if new.status = 'cancelled' then
      perform public.notify(new.videographer_id, 'task_cancelled', 'Task cancelled: ' || new.title, null, '/me');
    end if;
  end if;
  return null;
end;
$$;

create trigger tasks_after_write
  after insert or update on public.tasks
  for each row execute function public.tasks_after_write();

-- ---------------------------------------------------------------------------
-- Submissions: versioning, punctuality, task timestamps, notify admins
-- ---------------------------------------------------------------------------
create or replace function public.submissions_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_due date;
begin
  select t.due_date into v_due from public.tasks t where t.id = new.task_id for update;
  select coalesce(max(s.version), 0) + 1 into new.version from public.submissions s where s.task_id = new.task_id;
  new.is_on_time := new.submitted_at < public.due_deadline(v_due);
  -- links must be http(s)
  if exists (select 1 from unnest(new.links) l where l !~* '^https?://[^\s]+$') then
    raise exception 'Every deliverable link must be a valid http(s) URL' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger submissions_before_insert
  before insert on public.submissions
  for each row execute function public.submissions_before_insert();

create or replace function public.submissions_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
  v_name text;
begin
  update public.tasks
     set first_submitted_at = least(coalesce(first_submitted_at, new.submitted_at), new.submitted_at),
         last_submitted_at  = greatest(coalesce(last_submitted_at, new.submitted_at), new.submitted_at)
   where id = new.task_id
  returning * into v_task;

  select full_name into v_name from public.profiles where id = v_task.videographer_id;

  perform public.log_activity('task.submitted', 'task', v_task.id, v_task.videographer_id, v_task.title,
    jsonb_build_object('version', new.version, 'source', new.source, 'on_time', new.is_on_time));
  perform public.notify_admins('submission_received',
    coalesce(v_name, 'A videographer') || ' submitted ' || v_task.title,
    case when new.version > 1 then 'Version ' || new.version else null end
      || case when new.source = 'sheet' then ' (via Google Sheet)' else '' end,
    '/admin/review/' || v_task.id);
  return null;
end;
$$;

create trigger submissions_after_insert
  after insert on public.submissions
  for each row execute function public.submissions_after_insert();

-- ---------------------------------------------------------------------------
-- Reviews: points bound + notify videographer
-- ---------------------------------------------------------------------------
create or replace function public.task_reviews_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_max integer;
begin
  select max_points into v_max from public.tasks where id = new.task_id;
  if new.points_awarded is not null and new.points_awarded > v_max then
    raise exception 'Points (%) exceed the task maximum (%)', new.points_awarded, v_max using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger task_reviews_before_insert
  before insert on public.task_reviews
  for each row execute function public.task_reviews_before_insert();

create or replace function public.task_reviews_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tasks%rowtype;
begin
  select * into v_task from public.tasks where id = new.task_id;
  perform public.log_activity('task.reviewed', 'task', v_task.id, v_task.videographer_id, v_task.title,
    jsonb_build_object('decision', new.decision, 'points', new.points_awarded, 'rating', new.quality_rating));
  if new.decision = 'approved' then
    perform public.notify(v_task.videographer_id, 'task_approved',
      'Approved: ' || v_task.title,
      new.points_awarded || ' / ' || v_task.max_points || ' pts · ' || new.quality_rating || '★',
      '/me/tasks/' || v_task.id);
  else
    perform public.notify(v_task.videographer_id, 'revision_requested',
      'Revision requested: ' || v_task.title,
      left(new.feedback, 140),
      '/me/tasks/' || v_task.id);
  end if;
  return null;
end;
$$;

create trigger task_reviews_after_insert
  after insert on public.task_reviews
  for each row execute function public.task_reviews_after_insert();

-- ---------------------------------------------------------------------------
-- Scoring
-- ---------------------------------------------------------------------------
create or replace function public.safe_ratio(p_num numeric, p_den numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when coalesce(p_den, 0) <= 0 then 0::numeric
              else least(1::numeric, round(p_num / p_den, 4)) end;
$$;

-- Weighted score out of 100. Ratios are 0..1, discretionary is 0..10, weights sum to 100.
create or replace function public.calc_assessment_score(
  p_points_pct      numeric,
  p_completion_pct  numeric,
  p_punctuality_pct numeric,
  p_discretionary   numeric,
  p_weights         jsonb
)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
      coalesce((p_weights ->> 'points')::numeric, 0)        * coalesce(p_points_pct, 0)
    + coalesce((p_weights ->> 'completion')::numeric, 0)    * coalesce(p_completion_pct, 0)
    + coalesce((p_weights ->> 'punctuality')::numeric, 0)   * coalesce(p_punctuality_pct, 0)
    + coalesce((p_weights ->> 'discretionary')::numeric, 0) * coalesce(p_discretionary, 0) / 10
  , 2);
$$;

create or replace function public.current_weights()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'points', s.weight_points,
    'completion', s.weight_completion,
    'punctuality', s.weight_punctuality,
    'discretionary', s.weight_discretionary
  )
  from public.app_settings s
  where s.id;
$$;

-- Raw monthly metrics for one videographer (cancelled tasks excluded).
-- SECURITY INVOKER: RLS decides what the caller can count.
create or replace function public.calc_month_metrics(p_videographer_id uuid, p_month date)
returns table (
  assigned_count     integer,
  approved_count     integer,
  submitted_count    integer,
  on_time_count      integer,
  points_awarded_sum integer,
  max_points_sum     integer
)
language sql
stable
set search_path = ''
as $$
  select
    count(*)::integer,
    count(*) filter (where t.status = 'approved')::integer,
    count(*) filter (where t.first_submitted_at is not null)::integer,
    count(*) filter (where t.first_submitted_at is not null
                       and t.first_submitted_at < public.due_deadline(t.due_date))::integer,
    coalesce(sum(t.points_awarded) filter (where t.status = 'approved'), 0)::integer,
    coalesce(sum(t.max_points), 0)::integer
  from public.tasks t
  where t.videographer_id = p_videographer_id
    and t.month = p_month
    and t.status <> 'cancelled';
$$;

create or replace function public.monthly_assessments_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.is_locked and new.is_locked
     and row(new.assigned_count, new.approved_count, new.submitted_count, new.on_time_count,
             new.points_awarded_sum, new.max_points_sum, new.points_pct, new.completion_pct,
             new.punctuality_pct, new.weights, new.discretionary_score, new.bonus_points,
             new.bonus_reason, new.admin_remarks, new.public_note, new.status)
         is distinct from
         row(old.assigned_count, old.approved_count, old.submitted_count, old.on_time_count,
             old.points_awarded_sum, old.max_points_sum, old.points_pct, old.completion_pct,
             old.punctuality_pct, old.weights, old.discretionary_score, old.bonus_points,
             old.bonus_reason, old.admin_remarks, old.public_note, old.status)
  then
    raise exception 'This assessment is locked. Unlock it (with a reason) to edit.' using errcode = '55000';
  end if;

  if not exists (select 1 from public.profiles where id = new.videographer_id and role = 'videographer') then
    raise exception 'Assessments are only for videographers' using errcode = '23514';
  end if;

  new.base_score := public.calc_assessment_score(
    new.points_pct, new.completion_pct, new.punctuality_pct, new.discretionary_score, new.weights);
  new.total_score := new.base_score + coalesce(new.bonus_points, 0);
  if coalesce(new.bonus_points, 0) = 0 then
    new.bonus_reason := null;
  end if;
  return new;
end;
$$;

create trigger monthly_assessments_before_write
  before insert or update on public.monthly_assessments
  for each row execute function public.monthly_assessments_before_write();

-- ---------------------------------------------------------------------------
-- Featured work: must be an approved task from the same month
-- ---------------------------------------------------------------------------
create or replace function public.featured_work_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.tasks t
    where t.id = new.task_id and t.status = 'approved' and t.month = new.month
  ) then
    raise exception 'Featured work must be an approved task from %', public.format_month(new.month)
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger featured_work_guard
  before insert or update on public.featured_work
  for each row execute function public.featured_work_guard();

-- ---------------------------------------------------------------------------
-- Sheet outbox: queue App→Sheet writes when anything shown in the sheet changes
-- ---------------------------------------------------------------------------
create or replace function public.enqueue_sheet_sync(p_task_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.sheet_outbox (task_id, reason)
  select t.id, p_reason
  from public.tasks t
  join public.monthly_plans p on p.id = t.plan_id and p.status = 'published'
  join public.sheet_configs c on c.videographer_id = t.videographer_id and c.is_enabled
  where t.id = p_task_id
  on conflict (task_id) where processed_at is null do nothing;
$$;

create or replace function public.tasks_enqueue_sheet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and row(new.title, new.brief, new.status, new.due_date, new.client_id, new.category_id,
             new.max_points, new.points_awarded, new.videographer_notes, new.priority)
         is not distinct from
         row(old.title, old.brief, old.status, old.due_date, old.client_id, old.category_id,
             old.max_points, old.points_awarded, old.videographer_notes, old.priority)
  then
    return null;
  end if;
  perform public.enqueue_sheet_sync(new.id, lower(tg_op));
  return null;
end;
$$;

create trigger tasks_enqueue_sheet
  after insert or update on public.tasks
  for each row execute function public.tasks_enqueue_sheet();

create or replace function public.child_enqueue_sheet()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.enqueue_sheet_sync(
    case when tg_op = 'DELETE' then old.task_id else new.task_id end,
    tg_table_name);
  return null;
end;
$$;

create trigger submissions_enqueue_sheet
  after insert on public.submissions
  for each row execute function public.child_enqueue_sheet();
create trigger task_reviews_enqueue_sheet
  after insert on public.task_reviews
  for each row execute function public.child_enqueue_sheet();
create trigger task_references_enqueue_sheet
  after insert or update or delete on public.task_references
  for each row execute function public.child_enqueue_sheet();
