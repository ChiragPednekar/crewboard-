-- Phase 2: admin operations — plans, tasks (single + assign-to-many), duplicate a month,
-- videographer ⇄ client assignment, account status for the crew list, and audit triggers.

-- ---------------------------------------------------------------------------
-- Get (or create as draft) the plan for a videographer + month.
-- ---------------------------------------------------------------------------
create or replace function public.ensure_plan(p_videographer_id uuid, p_month date)
returns public.monthly_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := public.month_start(p_month);
  v       public.monthly_plans;
begin
  if not public.is_privileged() then
    raise exception 'Only admins can manage plans' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles where id = p_videographer_id and role = 'videographer' and is_active
  ) then
    raise exception 'Plans can only be created for active videographers' using errcode = '22023';
  end if;

  insert into public.monthly_plans (videographer_id, month, created_by)
  values (p_videographer_id, v_month, auth.uid())
  on conflict (videographer_id, month) do nothing
  returning * into v;

  if not found then
    select * into v from public.monthly_plans where videographer_id = p_videographer_id and month = v_month;
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Create one task for one or more videographers (same brief, same references).
--   p_task: { client_id, category_id, title, brief, priority, due_date, max_points }
--   p_refs: [{ kind: 'link'|'note', url, title, note, meta }]
-- Plans are created as drafts when missing. Returns the new tasks.
-- ---------------------------------------------------------------------------
create or replace function public.create_tasks(
  p_month            date,
  p_videographer_ids uuid[],
  p_task             jsonb,
  p_refs             jsonb default '[]'::jsonb
)
returns setof public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := public.month_start(p_month);
  v_due   date := (p_task ->> 'due_date')::date;
  v_vid   uuid;
  v_plan  public.monthly_plans;
  t       public.tasks;
begin
  if not public.is_admin() then
    raise exception 'Only admins can create tasks' using errcode = '42501';
  end if;
  if coalesce(cardinality(p_videographer_ids), 0) = 0 then
    raise exception 'Pick at least one videographer' using errcode = '22023';
  end if;
  if v_due is null or public.month_start(v_due) <> v_month then
    raise exception 'The due date must fall in %', public.format_month(v_month) using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_refs, '[]'::jsonb)) <> 'array' then
    raise exception 'References must be a list' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_refs, '[]'::jsonb)) r
     where coalesce(r ->> 'kind', '') not in ('link', 'note')
  ) then
    raise exception 'Only link and note references can be added here' using errcode = '22023';
  end if;

  foreach v_vid in array (select array_agg(distinct x) from unnest(p_videographer_ids) x) loop
    v_plan := public.ensure_plan(v_vid, v_month);

    insert into public.tasks (plan_id, videographer_id, month, client_id, category_id, title, brief, priority,
                              due_date, max_points, created_by)
    values (
      v_plan.id, v_vid, v_month,
      (p_task ->> 'client_id')::uuid,
      (p_task ->> 'category_id')::uuid,
      btrim(p_task ->> 'title'),
      nullif(btrim(p_task ->> 'brief'), ''),
      coalesce(nullif(p_task ->> 'priority', ''), 'normal')::public.task_priority,
      v_due,
      nullif(p_task ->> 'max_points', '')::integer,
      auth.uid()
    )
    returning * into t;

    insert into public.task_references (task_id, kind, url, title, note, meta, sort_order, created_by)
    select t.id, (r ->> 'kind')::public.reference_kind,
           nullif(btrim(r ->> 'url'), ''), nullif(btrim(r ->> 'title'), ''), nullif(btrim(r ->> 'note'), ''),
           coalesce(r -> 'meta', '{}'::jsonb), ord::integer, auth.uid()
      from jsonb_array_elements(coalesce(p_refs, '[]'::jsonb)) with ordinality as x(r, ord);

    return next t;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Copy a videographer's plan from one month into another.
-- Non-cancelled tasks are copied as fresh "assigned" tasks with the same day of
-- month (clamped to the target month's last day). Link and note references come
-- along; uploaded files stay with the original task.
-- ---------------------------------------------------------------------------
create or replace function public.duplicate_plan(
  p_videographer_id uuid,
  p_from_month      date,
  p_to_month        date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from     date := public.month_start(p_from_month);
  v_to       date := public.month_start(p_to_month);
  v_src      public.monthly_plans;
  v_dst      public.monthly_plans;
  v_last_day integer := extract(day from (v_to + interval '1 month - 1 day'))::integer;
  v_copied   integer := 0;
  v_files    integer := 0;
  s          public.tasks;
  t          public.tasks;
begin
  if not public.is_admin() then
    raise exception 'Only admins can duplicate plans' using errcode = '42501';
  end if;
  if v_from = v_to then
    raise exception 'Pick a different month to copy from' using errcode = '22023';
  end if;

  select * into v_src from public.monthly_plans where videographer_id = p_videographer_id and month = v_from;
  if not found then
    raise exception 'There is no plan for % to copy', public.format_month(v_from) using errcode = 'P0002';
  end if;

  v_dst := public.ensure_plan(p_videographer_id, v_to);
  update public.monthly_plans
     set summary = coalesce(summary, v_src.summary),
         goals   = coalesce(goals, v_src.goals)
   where id = v_dst.id;

  for s in
    select * from public.tasks
     where plan_id = v_src.id and status <> 'cancelled'
     order by due_date, created_at
  loop
    insert into public.tasks (plan_id, videographer_id, month, client_id, category_id, title, brief, priority,
                              due_date, max_points, created_by)
    values (
      v_dst.id, p_videographer_id, v_to, s.client_id, s.category_id, s.title, s.brief, s.priority,
      v_to + (least(extract(day from s.due_date)::integer, v_last_day) - 1),
      s.max_points, auth.uid()
    )
    returning * into t;

    insert into public.task_references (task_id, kind, url, title, note, meta, sort_order, created_by)
    select t.id, r.kind, r.url, r.title, r.note, r.meta, r.sort_order, auth.uid()
      from public.task_references r
     where r.task_id = s.id and r.kind in ('link', 'note');

    select v_files + count(*) into v_files
      from public.task_references r where r.task_id = s.id and r.kind = 'file';
    v_copied := v_copied + 1;
  end loop;

  perform public.log_activity('plan.duplicated', 'monthly_plan', v_dst.id, p_videographer_id,
    'Copied ' || v_copied || ' tasks from ' || public.format_month(v_from),
    jsonb_build_object('from', v_from, 'to', v_to, 'tasks', v_copied));

  return jsonb_build_object('plan_id', v_dst.id, 'copied', v_copied, 'skipped_files', v_files);
end;
$$;

-- ---------------------------------------------------------------------------
-- Replace a videographer's client list, or a client's crew, in one go.
-- ---------------------------------------------------------------------------
create or replace function public.set_videographer_clients(p_videographer_id uuid, p_client_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can assign clients' using errcode = '42501';
  end if;
  delete from public.videographer_clients
   where videographer_id = p_videographer_id
     and not (client_id = any (coalesce(p_client_ids, '{}')));
  insert into public.videographer_clients (videographer_id, client_id, assigned_by)
  select p_videographer_id, c, auth.uid() from unnest(coalesce(p_client_ids, '{}')) c
  on conflict do nothing;
  select count(*) into v_count from public.videographer_clients where videographer_id = p_videographer_id;
  perform public.log_activity('videographer.clients_set', 'profile', p_videographer_id, p_videographer_id,
    v_count || case when v_count = 1 then ' client' else ' clients' end, '{}'::jsonb);
  return v_count;
end;
$$;

create or replace function public.set_client_videographers(p_client_id uuid, p_videographer_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Only admins can assign clients' using errcode = '42501';
  end if;
  delete from public.videographer_clients
   where client_id = p_client_id
     and not (videographer_id = any (coalesce(p_videographer_ids, '{}')));
  insert into public.videographer_clients (videographer_id, client_id, assigned_by)
  select v, p_client_id, auth.uid() from unnest(coalesce(p_videographer_ids, '{}')) v
  on conflict do nothing;
  select count(*) into v_count from public.videographer_clients where client_id = p_client_id;
  perform public.log_activity('client.crew_set', 'client', p_client_id, null,
    v_count || case when v_count = 1 then ' videographer' else ' videographers' end, '{}'::jsonb);
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account status for the crew list (invite pending, last sign-in). Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.get_account_status()
returns table (
  id              uuid,
  invited_at      timestamptz,
  confirmed_at    timestamptz,
  last_sign_in_at timestamptz,
  banned_until    timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Only admins can see account status' using errcode = '42501';
  end if;
  return query
    select u.id, u.invited_at, u.email_confirmed_at, u.last_sign_in_at, u.banned_until
      from auth.users u
      join public.profiles p on p.id = u.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit: client changes, task edits/deletes, profile activation.
-- ---------------------------------------------------------------------------
create or replace function public.clients_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('client.created', 'client', new.id, null, new.name, '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    perform public.log_activity('client.deleted', 'client', old.id, null, old.name, '{}'::jsonb);
    return old;
  elsif new.is_active is distinct from old.is_active then
    perform public.log_activity(case when new.is_active then 'client.restored' else 'client.archived' end,
      'client', new.id, null, new.name, '{}'::jsonb);
  end if;
  return null;
end;
$$;

create trigger clients_audit
  after insert or update of is_active or delete on public.clients
  for each row execute function public.clients_audit();

create or replace function public.tasks_audit_edit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changed text[];
begin
  if tg_op = 'DELETE' then
    perform public.log_activity('task.deleted', 'task', old.id, old.videographer_id, old.title,
      jsonb_build_object('month', old.month));
    return old;
  end if;

  select array_agg(f) into v_changed from (
    select 'title' as f where new.title is distinct from old.title
    union all select 'brief' where new.brief is distinct from old.brief
    union all select 'due_date' where new.due_date is distinct from old.due_date
    union all select 'max_points' where new.max_points is distinct from old.max_points
    union all select 'priority' where new.priority is distinct from old.priority
    union all select 'client' where new.client_id is distinct from old.client_id
    union all select 'category' where new.category_id is distinct from old.category_id
  ) x;

  if v_changed is not null then
    perform public.log_activity('task.edited', 'task', new.id, new.videographer_id, new.title,
      jsonb_build_object('fields', to_jsonb(v_changed),
                         'due_date', jsonb_build_object('from', old.due_date, 'to', new.due_date)));
    -- the videographer only hears about edits once they can see the task
    if new.due_date is distinct from old.due_date
       and exists (select 1 from public.monthly_plans p where p.id = new.plan_id and p.status = 'published')
       and new.status not in ('approved', 'cancelled')
    then
      perform public.notify(new.videographer_id, 'task_updated', 'Due date changed: ' || new.title,
        'Now due ' || to_char(new.due_date, 'DD Mon'), '/me/tasks/' || new.id);
    end if;
  end if;
  return null;
end;
$$;

create trigger tasks_audit_edit
  after update of title, brief, due_date, max_points, priority, client_id, category_id on public.tasks
  for each row execute function public.tasks_audit_edit();

create trigger tasks_audit_delete
  before delete on public.tasks
  for each row execute function public.tasks_audit_edit();

create or replace function public.profiles_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inviter uuid;
begin
  if tg_op = 'INSERT' then
    if new.role = 'videographer' then
      -- Invites are created by the admin-users function (service role), so auth.uid() is
      -- empty here; it records the inviting admin in the new user's metadata instead.
      select p.id into v_inviter
        from auth.users u
        join public.profiles p on p.id = (u.raw_user_meta_data ->> 'invited_by')::uuid and p.role = 'admin'
       where u.id = new.id
         and (u.raw_user_meta_data ->> 'invited_by') ~ '^[0-9a-f-]{36}$';
      insert into public.activity_log (actor_id, actor_kind, action, entity_type, entity_id, videographer_id, summary)
      values (v_inviter, case when v_inviter is null then 'system' else 'user' end::public.actor_kind,
              'videographer.invited', 'profile', new.id, new.id, new.full_name);
    end if;
  elsif new.is_active is distinct from old.is_active then
    perform public.log_activity(case when new.is_active then 'videographer.reactivated' else 'videographer.deactivated' end,
      'profile', new.id, case when new.role = 'videographer' then new.id end, new.full_name, '{}'::jsonb);
  end if;
  return null;
end;
$$;

create trigger profiles_audit
  after insert or update of is_active on public.profiles
  for each row execute function public.profiles_audit();

-- Deleting a task that already has submissions would lose history; say so plainly.
create or replace function public.tasks_guard_delete_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.submissions s where s.task_id = old.id) then
    raise exception 'This task already has submissions. Cancel it instead so its history is kept.'
      using errcode = '22023';
  end if;
  return old;
end;
$$;

create trigger tasks_guard_delete_history
  before delete on public.tasks
  for each row execute function public.tasks_guard_delete_history();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke execute on function
  public.ensure_plan(uuid, date),
  public.create_tasks(date, uuid[], jsonb, jsonb),
  public.duplicate_plan(uuid, date, date),
  public.set_videographer_clients(uuid, uuid[]),
  public.set_client_videographers(uuid, uuid[]),
  public.get_account_status()
from public, anon;

grant execute on function
  public.ensure_plan(uuid, date),
  public.create_tasks(date, uuid[], jsonb, jsonb),
  public.duplicate_plan(uuid, date, date),
  public.set_videographer_clients(uuid, uuid[]),
  public.set_client_videographers(uuid, uuid[]),
  public.get_account_status()
to authenticated, service_role;
