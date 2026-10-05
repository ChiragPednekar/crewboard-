-- CrewBoard expansion: reviewer role, crew allow-list (sign-up gate), shoot dates & calendar,
-- leave requests, equipment, timestamped review comments, client approval links,
-- push + WhatsApp notification dispatch, badges, yearly leaderboard and peer voting.

-- ===========================================================================
-- Staff helpers (reviewer = can review work, not manage the studio)
-- ===========================================================================
create or replace function public.is_reviewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text = 'reviewer' and p.is_active
  );
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role::text in ('admin', 'reviewer') and p.is_active
  );
$$;
revoke execute on function public.is_reviewer(), public.is_staff() from public, anon;
grant execute on function public.is_reviewer(), public.is_staff() to authenticated, service_role;

-- Reviewers read everything they need to review (writes stay admin-only or go through RPCs).
create policy profiles_reviewer_select on public.profiles for select to authenticated
  using ((select public.is_reviewer()));
create policy clients_reviewer_select on public.clients for select to authenticated
  using ((select public.is_reviewer()));
create policy vc_reviewer_select on public.videographer_clients for select to authenticated
  using ((select public.is_reviewer()));
create policy plans_reviewer_select on public.monthly_plans for select to authenticated
  using ((select public.is_reviewer()));
create policy tasks_reviewer_select on public.tasks for select to authenticated
  using ((select public.is_reviewer()));
create policy refs_reviewer_select on public.task_references for select to authenticated
  using ((select public.is_reviewer()));
create policy submissions_reviewer_select on public.submissions for select to authenticated
  using ((select public.is_reviewer()));
create policy reviews_reviewer_select on public.task_reviews for select to authenticated
  using ((select public.is_reviewer()));

-- Reviewers also hear about new submissions and comments.
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
  where p.is_active
    and (p.role = 'admin'
         or (p.role::text = 'reviewer' and p_type in ('submission_received', 'comment', 'client_feedback')));
$$;
revoke execute on function public.notify_admins(text, text, text, text) from public, anon, authenticated;

-- review_task: admins and reviewers.
create or replace function public.review_task(
  p_task_id  uuid,
  p_decision public.review_decision,
  p_points   integer default null,
  p_rating   integer default null,
  p_feedback text default null
)
returns public.task_reviews
language plpgsql
security definer
set search_path = ''
as $$
declare
  v        public.tasks;
  v_sub_id uuid;
  r        public.task_reviews;
  v_fb     text := nullif(btrim(p_feedback), '');
begin
  if not public.is_staff() then
    raise exception 'Only admins and reviewers can review tasks' using errcode = '42501';
  end if;
  select * into v from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if public.is_month_locked(v.videographer_id, v.month) then
    raise exception 'The % assessment is locked; unlock it first', public.format_month(v.month) using errcode = '55000';
  end if;

  select s.id into v_sub_id
    from public.submissions s where s.task_id = p_task_id
   order by s.version desc limit 1;

  if p_decision = 'approved' then
    if v.status not in ('submitted', 'revision_requested', 'approved') or v_sub_id is null then
      raise exception 'Only submitted work can be approved' using errcode = '22023';
    end if;
    if p_points is null or p_points < 0 or p_points > v.max_points then
      raise exception 'Points must be between 0 and %', v.max_points using errcode = '22023';
    end if;
    if p_rating is null or p_rating not between 1 and 5 then
      raise exception 'Quality rating must be 1–5' using errcode = '22023';
    end if;
  else
    if v.status not in ('submitted', 'approved') then
      raise exception 'Only submitted or approved work can be sent back' using errcode = '22023';
    end if;
    if v_fb is null then
      raise exception 'Tell the videographer what needs to change' using errcode = '22023';
    end if;
  end if;

  insert into public.task_reviews (task_id, submission_id, reviewer_id, decision, points_awarded, quality_rating, feedback)
  values (
    p_task_id, v_sub_id, auth.uid(), p_decision,
    case when p_decision = 'approved' then p_points end,
    case when p_decision = 'approved' then p_rating end,
    v_fb
  )
  returning * into r;

  if p_decision = 'approved' then
    update public.tasks
       set status = 'approved', points_awarded = p_points, quality_rating = p_rating, status_changed_via = 'app'
     where id = p_task_id;
  else
    update public.tasks
       set status = 'revision_requested', status_changed_via = 'app'
     where id = p_task_id;
    delete from public.featured_work where task_id = p_task_id;
  end if;
  return r;
end;
$$;

-- Status machine: a reviewer approving through review_task may make the admin-only moves.
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
    if not public.task_transition_allowed(old.status, new.status, public.is_privileged() or public.is_reviewer()) then
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

-- ===========================================================================
-- Crew allow-list: only listed emails (or the admin list) can create an account.
-- Enforced by the "Before User Created" auth hook below.
-- ===========================================================================
create table public.allowed_emails (
  email         text primary key check (email = lower(btrim(email)) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  full_name     text check (full_name is null or char_length(btrim(full_name)) between 2 and 120),
  phone         text check (phone is null or phone ~ '^[0-9+() -]{6,20}$'),
  base_location text check (base_location is null or char_length(base_location) <= 120),
  role          text not null default 'videographer' check (role in ('videographer', 'reviewer')),
  client_ids    uuid[] not null default '{}',
  added_by      uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  claimed_at    timestamptz,
  claimed_by    uuid references public.profiles (id) on delete set null
);
alter table public.allowed_emails enable row level security;
create policy allowed_emails_admin_all on public.allowed_emails for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant select, insert, update, delete on public.allowed_emails to authenticated;
grant all on public.allowed_emails to service_role;

-- Everyone who already has an account stays allowed (e.g. after a re-invite).
insert into public.allowed_emails (email, full_name, claimed_at, claimed_by)
select lower(p.email), p.full_name, now(), p.id from public.profiles p
on conflict (email) do nothing;

create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(event -> 'user' ->> 'email'));
begin
  if v_email is not null and v_email <> '' and (
       exists (select 1 from public.admin_emails a where a.email = v_email)
    or exists (select 1 from public.allowed_emails a where a.email = v_email)
  ) then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This email isn''t on the CrewBoard team yet. Ask your studio admin to add you, then try again.'
  ));
end;
$$;
revoke execute on function public.hook_before_user_created(jsonb) from public, anon, authenticated;
grant execute on function public.hook_before_user_created(jsonb) to supabase_auth_admin;

-- New account: admin list → admin; allow-list → its role, name, phone, clients.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed public.allowed_emails;
  v_role    public.user_role;
  v_client  uuid;
begin
  select * into v_allowed from public.allowed_emails where email = lower(btrim(new.email));

  v_role := case
    when public.is_admin_email(new.email, new.email_confirmed_at) then 'admin'::public.user_role
    -- the reviewer role needs a verified address; videographer is the safe default
    when v_allowed.email is not null and new.email_confirmed_at is not null then v_allowed.role::public.user_role
    else coalesce(nullif(new.raw_app_meta_data ->> 'role', '')::public.user_role, 'videographer')
  end;

  insert into public.profiles (id, email, full_name, role, phone, base_location, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      v_allowed.full_name,
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      new.email
    ),
    v_role,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''), v_allowed.phone),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'base_location'), ''), v_allowed.base_location),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
    )
  )
  on conflict (id) do nothing;

  if v_allowed.email is not null then
    if v_role = 'videographer' then
      foreach v_client in array v_allowed.client_ids loop
        insert into public.videographer_clients (videographer_id, client_id)
        select new.id, c.id from public.clients c where c.id = v_client
        on conflict do nothing;
      end loop;
    end if;
    update public.allowed_emails set claimed_at = now(), claimed_by = new.id where email = v_allowed.email;
  end if;
  return new;
end;
$$;

create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin_email(new.email, new.email_confirmed_at) then
    update public.profiles set role = 'admin' where id = new.id and role <> 'admin';
  elsif exists (select 1 from public.allowed_emails a where a.email = lower(btrim(new.email)) and a.role = 'reviewer') then
    update public.profiles set role = 'reviewer'::text::public.user_role where id = new.id and role::text = 'videographer';
  end if;
  return new;
end;
$$;

-- ===========================================================================
-- Shoot dates (when the camera rolls, separate from the delivery due date)
-- ===========================================================================
alter table public.tasks add column shoot_date date;
alter table public.tasks add constraint tasks_shoot_date_sane
  check (shoot_date is null or shoot_date between month - 62 and month + 92);
create index tasks_shoot_date_idx on public.tasks (shoot_date) where shoot_date is not null;

-- ===========================================================================
-- Leave & availability
-- ===========================================================================
create table public.leave_requests (
  id              uuid primary key default gen_random_uuid(),
  videographer_id uuid not null references public.profiles (id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  kind            text not null default 'leave' check (kind in ('leave', 'sick', 'unavailable')),
  reason          text check (reason is null or char_length(reason) <= 500),
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by     uuid references public.profiles (id) on delete set null,
  reviewed_at     timestamptz,
  review_note     text check (review_note is null or char_length(review_note) <= 500),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint leave_requests_range check (end_date >= start_date and end_date - start_date <= 92)
);
create index leave_requests_videographer_idx on public.leave_requests (videographer_id, start_date);
create index leave_requests_dates_idx on public.leave_requests (start_date, end_date) where status = 'approved';
create trigger leave_requests_updated_at before update on public.leave_requests
  for each row execute function public.set_updated_at();

alter table public.leave_requests enable row level security;
create policy leave_select on public.leave_requests for select to authenticated
  using (videographer_id = (select auth.uid()) or (select public.is_staff()));
create policy leave_insert_own on public.leave_requests for insert to authenticated
  with check (
    videographer_id = (select auth.uid())
    and status = 'pending' and reviewed_by is null and reviewed_at is null and review_note is null
  );
create policy leave_delete_own_pending on public.leave_requests for delete to authenticated
  using (videographer_id = (select auth.uid()) and status = 'pending');
grant select, insert, delete on public.leave_requests to authenticated;
grant all on public.leave_requests to service_role;

create or replace function public.leave_requests_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  select full_name into v_name from public.profiles where id = new.videographer_id;
  perform public.notify_admins('leave_request', coalesce(v_name, 'Someone') || ' asked for ' || new.kind,
    to_char(new.start_date, 'DD Mon') || case when new.end_date <> new.start_date then ' – ' || to_char(new.end_date, 'DD Mon') else '' end,
    '/admin/leave');
  perform public.log_activity('leave.requested', 'leave_request', new.id, new.videographer_id,
    to_char(new.start_date, 'DD Mon') || ' – ' || to_char(new.end_date, 'DD Mon'), jsonb_build_object('kind', new.kind));
  return null;
end;
$$;
create trigger leave_requests_after_insert after insert on public.leave_requests
  for each row execute function public.leave_requests_after_insert();

create or replace function public.decide_leave(p_id uuid, p_decision text, p_note text default null)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.leave_requests;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve leave' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Choose approve or reject' using errcode = '22023';
  end if;
  update public.leave_requests
     set status = p_decision, reviewed_by = auth.uid(), reviewed_at = now(), review_note = nullif(btrim(p_note), '')
   where id = p_id and status = 'pending'
  returning * into v;
  if not found then
    raise exception 'This request has already been handled' using errcode = '22023';
  end if;
  perform public.notify(v.videographer_id, 'leave_decision',
    'Your ' || v.kind || ' request was ' || p_decision,
    to_char(v.start_date, 'DD Mon') || ' – ' || to_char(v.end_date, 'DD Mon')
      || coalesce(' · ' || nullif(btrim(p_note), ''), ''),
    '/me/leave');
  perform public.log_activity('leave.' || p_decision, 'leave_request', v.id, v.videographer_id,
    to_char(v.start_date, 'DD Mon') || ' – ' || to_char(v.end_date, 'DD Mon'), '{}'::jsonb);
  return v;
end;
$$;

create or replace function public.cancel_leave(p_id uuid)
returns public.leave_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.leave_requests;
begin
  update public.leave_requests
     set status = 'cancelled'
   where id = p_id
     and status in ('pending', 'approved')
     and end_date >= public.today_ist()
     and (videographer_id = auth.uid() or public.is_admin())
  returning * into v;
  if not found then
    raise exception 'This request can no longer be cancelled' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- ===========================================================================
-- Equipment
-- ===========================================================================
create table public.equipment (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(btrim(name)) between 2 and 120),
  category       text not null default 'camera'
                 check (category in ('camera', 'lens', 'audio', 'lighting', 'gimbal', 'drone', 'storage', 'other')),
  serial_no      text check (serial_no is null or char_length(serial_no) <= 80),
  notes          text check (notes is null or char_length(notes) <= 1000),
  status         text not null default 'available' check (status in ('available', 'checked_out', 'maintenance', 'retired')),
  holder_id      uuid references public.profiles (id) on delete set null,
  checked_out_at timestamptz,
  due_back       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint equipment_holder_consistent check ((status = 'checked_out') = (holder_id is not null))
);
create index equipment_holder_idx on public.equipment (holder_id) where holder_id is not null;
create trigger equipment_updated_at before update on public.equipment
  for each row execute function public.set_updated_at();

create table public.equipment_log (
  id              bigint generated always as identity primary key,
  equipment_id    uuid not null references public.equipment (id) on delete cascade,
  action          text not null check (action in ('created', 'check_out', 'return', 'maintenance', 'available', 'retired')),
  videographer_id uuid references public.profiles (id) on delete set null,
  actor_id        uuid references public.profiles (id) on delete set null,
  note            text check (note is null or char_length(note) <= 500),
  created_at      timestamptz not null default now()
);
create index equipment_log_item_idx on public.equipment_log (equipment_id, created_at desc);

alter table public.equipment enable row level security;
alter table public.equipment_log enable row level security;
create policy equipment_select on public.equipment for select to authenticated
  using ((select public.is_staff()) or holder_id = (select auth.uid()));
create policy equipment_admin_insert on public.equipment for insert to authenticated
  with check ((select public.is_admin()) and status = 'available' and holder_id is null);
create policy equipment_admin_update on public.equipment for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy equipment_admin_delete on public.equipment for delete to authenticated
  using ((select public.is_admin()) and status <> 'checked_out');
create policy equipment_log_select on public.equipment_log for select to authenticated
  using ((select public.is_admin()) or videographer_id = (select auth.uid()));
grant select, insert, update, delete on public.equipment to authenticated;
grant select on public.equipment_log to authenticated;
grant all on public.equipment, public.equipment_log to service_role;

create or replace function public.checkout_equipment(p_id uuid, p_videographer_id uuid, p_due_back date default null, p_note text default null)
returns public.equipment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.equipment;
begin
  if not public.is_admin() then
    raise exception 'Only admins can check out equipment' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_videographer_id and is_active) then
    raise exception 'Pick an active crew member' using errcode = '22023';
  end if;
  update public.equipment
     set status = 'checked_out', holder_id = p_videographer_id, checked_out_at = now(), due_back = p_due_back
   where id = p_id and status = 'available'
  returning * into v;
  if not found then
    raise exception 'This item isn''t available right now' using errcode = '22023';
  end if;
  insert into public.equipment_log (equipment_id, action, videographer_id, actor_id, note)
  values (v.id, 'check_out', p_videographer_id, auth.uid(), nullif(btrim(p_note), ''));
  perform public.notify(p_videographer_id, 'gear_checkout', 'Gear checked out to you: ' || v.name,
    case when p_due_back is not null then 'Due back ' || to_char(p_due_back, 'DD Mon') else null end, '/me/gear');
  return v;
end;
$$;

create or replace function public.return_equipment(p_id uuid, p_note text default null)
returns public.equipment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v      public.equipment;
  v_prev uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can check equipment back in' using errcode = '42501';
  end if;
  select holder_id into v_prev from public.equipment where id = p_id;
  update public.equipment
     set status = 'available', holder_id = null, checked_out_at = null, due_back = null
   where id = p_id and status = 'checked_out'
  returning * into v;
  if not found then
    raise exception 'This item isn''t checked out' using errcode = '22023';
  end if;
  insert into public.equipment_log (equipment_id, action, videographer_id, actor_id, note)
  values (v.id, 'return', v_prev, auth.uid(), nullif(btrim(p_note), ''));
  return v;
end;
$$;

create or replace function public.set_equipment_status(p_id uuid, p_status text, p_note text default null)
returns public.equipment
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.equipment;
begin
  if not public.is_admin() then
    raise exception 'Only admins can change equipment' using errcode = '42501';
  end if;
  if p_status not in ('available', 'maintenance', 'retired') then
    raise exception 'Unknown status' using errcode = '22023';
  end if;
  update public.equipment set status = p_status
   where id = p_id and status <> 'checked_out'
  returning * into v;
  if not found then
    raise exception 'Check the item back in first' using errcode = '22023';
  end if;
  insert into public.equipment_log (equipment_id, action, actor_id, note)
  values (v.id, p_status, auth.uid(), nullif(btrim(p_note), ''));
  return v;
end;
$$;

-- ===========================================================================
-- Timestamped review comments ("at 0:42 — logo missing")
-- ===========================================================================
create table public.review_comments (
  id            uuid primary key default gen_random_uuid(),
  task_id       uuid not null references public.tasks (id) on delete cascade,
  submission_id uuid references public.submissions (id) on delete set null,
  author_id     uuid references public.profiles (id) on delete set null,
  at_seconds    numeric(9, 2) check (at_seconds is null or at_seconds between 0 and 86400),
  body          text not null check (char_length(btrim(body)) between 1 and 2000),
  -- copied at insert: videographers can't read other profiles, but should see who wrote a note
  author_name   text,
  author_staff  boolean not null default false,
  resolved_at   timestamptz,
  resolved_by   uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index review_comments_task_idx on public.review_comments (task_id, created_at);

alter table public.review_comments enable row level security;
create policy comments_select on public.review_comments for select to authenticated
  using (
    (select public.is_staff())
    or exists (select 1 from public.tasks t where t.id = review_comments.task_id)  -- tasks RLS applies
  );
create policy comments_insert on public.review_comments for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and resolved_at is null and resolved_by is null
    and (
      (select public.is_staff())
      or exists (select 1 from public.tasks t where t.id = review_comments.task_id and t.videographer_id = (select auth.uid()))
    )
  );
create policy comments_delete on public.review_comments for delete to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));
grant select, insert, delete on public.review_comments to authenticated;
grant all on public.review_comments to service_role;

create or replace function public.format_timecode(p_seconds numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_seconds is null then null
    when p_seconds >= 3600 then to_char(floor(p_seconds / 3600), 'FM9') || ':' || to_char(floor(mod(p_seconds, 3600) / 60), 'FM00') || ':' || to_char(floor(mod(p_seconds, 60)), 'FM00')
    else to_char(floor(p_seconds / 60), 'FM90') || ':' || to_char(floor(mod(p_seconds, 60)), 'FM00') end;
$$;

create or replace function public.review_comments_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select p.full_name, p.role::text in ('admin', 'reviewer')
    into new.author_name, new.author_staff
    from public.profiles p where p.id = new.author_id;
  new.author_staff := coalesce(new.author_staff, false);
  return new;
end;
$$;
create trigger review_comments_before_insert before insert on public.review_comments
  for each row execute function public.review_comments_before_insert();

create or replace function public.review_comments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task  public.tasks;
  v_staff boolean;
  v_name  text;
begin
  select * into v_task from public.tasks where id = new.task_id;
  select p.role::text in ('admin', 'reviewer'), p.full_name into v_staff, v_name from public.profiles p where p.id = new.author_id;
  if coalesce(v_staff, false) then
    perform public.notify(v_task.videographer_id, 'comment', 'New note on ' || v_task.title,
      coalesce('at ' || public.format_timecode(new.at_seconds) || ' · ', '') || left(new.body, 140),
      '/me/tasks/' || v_task.id);
  else
    perform public.notify_admins('comment', coalesce(v_name, 'The videographer') || ' replied on ' || v_task.title,
      left(new.body, 140), '/admin/review/' || v_task.id);
  end if;
  return null;
end;
$$;
create trigger review_comments_after_insert after insert on public.review_comments
  for each row execute function public.review_comments_after_insert();

create or replace function public.set_comment_resolved(p_id uuid, p_resolved boolean)
returns public.review_comments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.review_comments;
begin
  update public.review_comments c
     set resolved_at = case when p_resolved then now() end,
         resolved_by = case when p_resolved then auth.uid() end
   where c.id = p_id
     and (public.is_staff()
          or exists (select 1 from public.tasks t where t.id = c.task_id and t.videographer_id = auth.uid()))
  returning * into v;
  if not found then
    raise exception 'Comment not found' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

-- ===========================================================================
-- Client approval links (the client reviews a deliverable without an account)
-- ===========================================================================
create table public.client_review_links (
  id             uuid primary key default gen_random_uuid(),
  token          text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  task_id        uuid not null references public.tasks (id) on delete cascade,
  submission_id  uuid references public.submissions (id) on delete set null,
  client_contact text check (client_contact is null or char_length(client_contact) <= 120),
  created_by     uuid references public.profiles (id) on delete set null,
  expires_at     timestamptz not null default now() + interval '14 days',
  revoked_at     timestamptz,
  responded_at   timestamptz,
  decision       text check (decision is null or decision in ('approved', 'changes')),
  rating         smallint check (rating is null or rating between 1 and 5),
  comment        text check (comment is null or char_length(comment) <= 2000),
  responder_name text check (responder_name is null or char_length(responder_name) <= 120),
  created_at     timestamptz not null default now()
);
create index client_review_links_task_idx on public.client_review_links (task_id, created_at desc);

alter table public.client_review_links enable row level security;
create policy crl_staff_select on public.client_review_links for select to authenticated
  using ((select public.is_staff()));
create policy crl_staff_insert on public.client_review_links for insert to authenticated
  with check ((select public.is_staff()) and created_by = (select auth.uid()) and responded_at is null and decision is null);
create policy crl_staff_update on public.client_review_links for update to authenticated
  using ((select public.is_staff())) with check ((select public.is_staff()));
grant select, insert, update on public.client_review_links to authenticated;
grant all on public.client_review_links to service_role;

-- Public read for the person holding the link (anon allowed). Returns only what the client needs.
create or replace function public.get_client_review(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  l public.client_review_links;
  t public.tasks;
  s public.submissions;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    return jsonb_build_object('state', 'invalid');
  end if;
  select * into l from public.client_review_links where token = p_token;
  if not found then
    return jsonb_build_object('state', 'invalid');
  end if;
  select * into t from public.tasks where id = l.task_id;
  select * into s from public.submissions
   where id = l.submission_id
      or (l.submission_id is null and task_id = l.task_id)
   order by version desc limit 1;
  return jsonb_build_object(
    'state', case when l.revoked_at is not null then 'revoked'
                  when l.responded_at is not null then 'responded'
                  when l.expires_at < now() then 'expired'
                  else 'open' end,
    'title', t.title,
    'client', (select c.name from public.clients c where c.id = t.client_id),
    'client_logo', (select c.logo_url from public.clients c where c.id = t.client_id),
    'category', (select c.name from public.task_categories c where c.id = t.category_id),
    'videographer', (select split_part(p.full_name, ' ', 1) from public.profiles p where p.id = t.videographer_id),
    'links', coalesce(to_jsonb(s.links), '[]'::jsonb),
    'version', s.version,
    'submitted_at', s.submitted_at,
    'expires_at', l.expires_at,
    'decision', l.decision,
    'rating', l.rating,
    'comment', l.comment,
    'responder_name', l.responder_name,
    'responded_at', l.responded_at
  );
end;
$$;

create or replace function public.submit_client_review(
  p_token text, p_decision text, p_rating integer, p_comment text default null, p_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  l public.client_review_links;
  t public.tasks;
begin
  if p_token is null or p_token !~ '^[0-9a-f]{48}$' then
    raise exception 'This link isn''t valid' using errcode = 'P0002';
  end if;
  if p_decision not in ('approved', 'changes') then
    raise exception 'Choose approve or request changes' using errcode = '22023';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception 'Pick a rating from 1 to 5' using errcode = '22023';
  end if;
  if p_decision = 'changes' and coalesce(btrim(p_comment), '') = '' then
    raise exception 'Tell us what you''d like changed' using errcode = '22023';
  end if;

  update public.client_review_links
     set responded_at = now(), decision = p_decision, rating = p_rating,
         comment = nullif(left(btrim(p_comment), 2000), ''), responder_name = nullif(left(btrim(p_name), 120), '')
   where token = p_token and responded_at is null and revoked_at is null and expires_at >= now()
  returning * into l;
  if not found then
    raise exception 'This link has expired or was already used' using errcode = '22023';
  end if;

  select * into t from public.tasks where id = l.task_id;
  perform public.notify_admins('client_feedback',
    'Client ' || case when p_decision = 'approved' then 'approved ' else 'asked for changes on ' end || t.title,
    p_rating || '★' || coalesce(' · ' || left(nullif(btrim(p_comment), ''), 120), ''),
    '/admin/review/' || t.id);
  perform public.notify(t.videographer_id, 'client_feedback',
    'The client ' || case when p_decision = 'approved' then 'approved ' else 'asked for changes on ' end || t.title,
    p_rating || '★' || coalesce(' · ' || left(nullif(btrim(p_comment), ''), 120), ''),
    '/me/tasks/' || t.id);
  perform public.log_activity('client.feedback', 'task', t.id, t.videographer_id, t.title,
    jsonb_build_object('decision', p_decision, 'rating', p_rating));
  return public.get_client_review(p_token);
end;
$$;
revoke execute on function public.get_client_review(text), public.submit_client_review(text, text, integer, text, text) from public;
grant execute on function public.get_client_review(text), public.submit_client_review(text, text, integer, text, text) to anon, authenticated, service_role;

-- Average client rating per videographer for a month (feeds the discretionary score).
create or replace function public.get_client_ratings(p_month date)
returns table (videographer_id uuid, reviews integer, avg_rating numeric, approvals integer)
language sql
stable
security definer
set search_path = ''
as $$
  select t.videographer_id, count(*)::integer, round(avg(l.rating), 2), (count(*) filter (where l.decision = 'approved'))::integer
    from public.client_review_links l
    join public.tasks t on t.id = l.task_id
   where l.responded_at is not null
     and t.month = public.month_start(p_month)
     and public.is_staff()
   group by t.videographer_id;
$$;

-- ===========================================================================
-- Notifications: push subscriptions, WhatsApp preferences, dispatch
-- ===========================================================================
alter table public.profiles
  add column whatsapp_opt_in boolean not null default false,
  add column whatsapp_number text check (whatsapp_number is null or whatsapp_number ~ '^\+?[0-9]{10,15}$');

create table public.push_subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  endpoint     text not null unique check (endpoint ~ '^https://'),
  p256dh       text not null,
  auth         text not null,
  user_agent   text,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy push_select_own on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_delete_own on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, delete on public.push_subscriptions to authenticated;
grant all on public.push_subscriptions to service_role;

-- One browser endpoint belongs to whoever subscribed last on that device.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end;
$$;

alter table public.notifications
  add column push_sent_at timestamptz,
  add column whatsapp_status text check (whatsapp_status is null or char_length(whatsapp_status) <= 200);

-- Every notification is handed to the notify-dispatch Edge Function (push + WhatsApp).
-- The shared secret is generated here, inside the database, so nobody has to copy it
-- anywhere: the function verifies callers with check_dispatch_secret() (service role only).
-- Only the function URL must be added to Vault as 'notify_dispatch_url' (see README);
-- until then dispatch is a no-op.
do $do$
begin
  if not exists (select 1 from vault.secrets where name = 'notify_dispatch_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'notify_dispatch_secret');
  end if;
end;
$do$;

create or replace function public.check_dispatch_secret(p_secret text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_secret is not null and length(p_secret) >= 32 and exists (
    select 1 from vault.decrypted_secrets where name = 'notify_dispatch_secret' and decrypted_secret = p_secret
  );
$$;
revoke execute on function public.check_dispatch_secret(text) from public, anon, authenticated;
grant execute on function public.check_dispatch_secret(text) to service_role;
create extension if not exists pg_net with schema extensions;
create or replace function public.dispatch_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'notify_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'notify_dispatch_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', v_secret),
    body := jsonb_build_object('notification_id', new.id),
    timeout_milliseconds := 10000
  );
  return null;
exception when others then
  -- never block the action that produced the notification
  return null;
end;
$$;
create trigger notifications_dispatch after insert on public.notifications
  for each row execute function public.dispatch_notification();

-- ===========================================================================
-- Motivation: badges, yearly leaderboard, peer voting for best work
-- ===========================================================================
create or replace function public.get_badges(p_videographer_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_streak  integer := 0;
  r         record;
begin
  if auth.uid() is null and not public.is_service_context() then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  for r in
    select t.first_submitted_at < public.due_deadline(t.due_date) as on_time
      from public.tasks t
      join public.monthly_plans p on p.id = t.plan_id and p.status = 'published'
     where t.videographer_id = p_videographer_id
       and t.status <> 'cancelled'
       and t.first_submitted_at is not null
     order by t.first_submitted_at desc
  loop
    exit when not r.on_time;
    v_streak := v_streak + 1;
  end loop;

  return jsonb_build_object(
    'on_time_streak', v_streak,
    'five_star', (select count(*) from public.tasks t
                   where t.videographer_id = p_videographer_id and t.status = 'approved' and t.quality_rating = 5),
    'perfect_months', (select count(*) from public.monthly_assessments a
                        where a.videographer_id = p_videographer_id and a.status = 'published'
                          and a.assigned_count > 0 and a.completion_pct = 1 and a.punctuality_pct = 1),
    'top_performer', (select count(*) from public.monthly_assessments a
                       where a.videographer_id = p_videographer_id and a.status = 'published'
                         and public.is_month_final(a.month)
                         and a.total_score = (select max(b.total_score) from public.monthly_assessments b
                                               where b.month = a.month and b.status = 'published')),
    'best_work', (select count(*) from public.featured_work f join public.tasks t on t.id = f.task_id
                   where f.rank = 1 and t.videographer_id = p_videographer_id)
  );
end;
$$;

create or replace function public.get_yearly_leaderboard(p_year integer)
returns table (
  videographer_id uuid,
  full_name       text,
  avatar_url      text,
  rank            integer,
  total_score     numeric,
  months          integer,
  avg_score       numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.videographer_id, p.full_name, p.avatar_url,
         (rank() over (order by sum(a.total_score) desc))::integer,
         sum(a.total_score)::numeric, count(*)::integer, round(avg(a.total_score), 2)
    from public.monthly_assessments a
    join public.profiles p on p.id = a.videographer_id
   where a.status = 'published'
     and extract(year from a.month) = p_year
     and (auth.uid() is not null or public.is_service_context())
   group by a.videographer_id, p.full_name, p.avatar_url
   order by sum(a.total_score) desc, p.full_name;
$$;

create table public.best_work_votes (
  month      date not null check (extract(day from month) = 1),
  voter_id   uuid not null references public.profiles (id) on delete cascade,
  task_id    uuid not null references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (month, voter_id)
);
create index best_work_votes_task_idx on public.best_work_votes (task_id);
alter table public.best_work_votes enable row level security;
create policy votes_select_own on public.best_work_votes for select to authenticated
  using (voter_id = (select auth.uid()) or (select public.is_admin()));
grant select on public.best_work_votes to authenticated;
grant all on public.best_work_votes to service_role;

-- Voting is open for the current month and the one before (India time).
create or replace function public.voting_open(p_month date)
returns boolean
language sql
stable
set search_path = ''
as $$
  select public.month_start(p_month) between (public.month_start(public.today_ist()) - interval '1 month')::date
                                         and public.month_start(public.today_ist());
$$;

create or replace function public.get_vote_candidates(p_month date)
returns table (
  task_id           uuid,
  title             text,
  client_name       text,
  category          text,
  videographer_id   uuid,
  videographer_name text,
  avatar_url        text,
  links             text[],
  votes             integer,
  my_vote           boolean,
  is_mine           boolean,
  voting_open       boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.title, cl.name, c.name, p.id, p.full_name, p.avatar_url,
         (select s.links from public.submissions s where s.task_id = t.id order by s.version desc limit 1),
         (select count(*) from public.best_work_votes v where v.task_id = t.id and v.month = t.month)::integer,
         exists (select 1 from public.best_work_votes v where v.task_id = t.id and v.month = t.month and v.voter_id = auth.uid()),
         t.videographer_id = auth.uid(),
         public.voting_open(t.month)
    from public.tasks t
    join public.monthly_plans pl on pl.id = t.plan_id and pl.status = 'published'
    join public.clients cl on cl.id = t.client_id
    join public.task_categories c on c.id = t.category_id
    join public.profiles p on p.id = t.videographer_id
   where t.month = public.month_start(p_month)
     and t.status = 'approved'
     and (auth.uid() is not null or public.is_service_context())
   order by 9 desc, t.approved_at desc;
$$;

create or replace function public.cast_vote(p_month date, p_task_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := public.month_start(p_month);
  t       public.tasks;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Sign in to vote' using errcode = '42501';
  end if;
  if not public.voting_open(v_month) then
    raise exception 'Voting for % is closed', public.format_month(v_month) using errcode = '22023';
  end if;
  select * into t from public.tasks where id = p_task_id;
  if not found or t.status <> 'approved' or t.month <> v_month then
    raise exception 'You can only vote for approved work from %', public.format_month(v_month) using errcode = '22023';
  end if;
  if t.videographer_id = auth.uid() then
    raise exception 'You can''t vote for your own work' using errcode = '22023';
  end if;
  insert into public.best_work_votes (month, voter_id, task_id)
  values (v_month, auth.uid(), p_task_id)
  on conflict (month, voter_id) do update set task_id = excluded.task_id, created_at = now();
end;
$$;

create or replace function public.clear_vote(p_month date)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.best_work_votes where month = public.month_start(p_month) and voter_id = auth.uid();
$$;

-- Thumbnails of vote candidates are visible to the whole crew (like featured work).
create or replace function public.is_vote_candidate(p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
     where t.id::text = p_task_id and t.status = 'approved' and public.voting_open(t.month)
  );
$$;
create policy "thumbnails read vote candidates" on storage.objects for select to authenticated
  using (bucket_id = 'thumbnails' and public.is_vote_candidate((storage.foldername(name))[1]));

-- ===========================================================================
-- Grants for the new RPCs (signed-in users; each checks its own rules)
-- ===========================================================================
revoke execute on function
  public.decide_leave(uuid, text, text),
  public.cancel_leave(uuid),
  public.checkout_equipment(uuid, uuid, date, text),
  public.return_equipment(uuid, text),
  public.set_equipment_status(uuid, text, text),
  public.set_comment_resolved(uuid, boolean),
  public.get_client_ratings(date),
  public.save_push_subscription(text, text, text, text),
  public.get_badges(uuid),
  public.get_yearly_leaderboard(integer),
  public.get_vote_candidates(date),
  public.cast_vote(date, uuid),
  public.clear_vote(date),
  public.is_vote_candidate(text),
  public.voting_open(date)
from public, anon;
grant execute on function
  public.decide_leave(uuid, text, text),
  public.cancel_leave(uuid),
  public.checkout_equipment(uuid, uuid, date, text),
  public.return_equipment(uuid, text),
  public.set_equipment_status(uuid, text, text),
  public.set_comment_resolved(uuid, boolean),
  public.get_client_ratings(date),
  public.save_push_subscription(text, text, text, text),
  public.get_badges(uuid),
  public.get_yearly_leaderboard(integer),
  public.get_vote_candidates(date),
  public.cast_vote(date, uuid),
  public.clear_vote(date),
  public.is_vote_candidate(text),
  public.voting_open(date),
  public.format_timecode(numeric)
to authenticated, service_role;
revoke execute on function
  public.leave_requests_after_insert(),
  public.review_comments_before_insert(),
  public.review_comments_after_insert(),
  public.dispatch_notification()
from public, anon, authenticated;
