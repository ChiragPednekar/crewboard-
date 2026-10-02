-- CrewBoard RPCs. Every workflow mutation goes through one of these so that the
-- app and the Google Sheet sync share exactly the same rules.

-- ---------------------------------------------------------------------------
-- Internal: may the caller act on this task as its videographer?
-- (owner of a published plan, active account) — or the sync service.
-- ---------------------------------------------------------------------------
create or replace function public.assert_task_actor(p_task public.tasks, p_source public.submission_source)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_source = 'sheet' and not public.is_service_context() then
    raise exception 'Only the sync service can act as the sheet' using errcode = '42501';
  end if;
  if public.is_service_context() then
    return;
  end if;
  -- Same error for "not yours" and "doesn't exist": never leak other people's task ids.
  if p_task.videographer_id is distinct from auth.uid()
     or not exists (select 1 from public.monthly_plans p where p.id = p_task.plan_id and p.status = 'published')
  then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles where id = auth.uid() and is_active) then
    raise exception 'Your account is deactivated' using errcode = '42501';
  end if;
end;
$$;
revoke execute on function public.assert_task_actor(public.tasks, public.submission_source) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Videographer progress: assigned ⇄ in_progress (revision_requested → in_progress)
-- ---------------------------------------------------------------------------
create or replace function public.set_task_progress(
  p_task_id uuid,
  p_status  public.task_status,
  p_source  public.submission_source default 'app'
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.tasks;
begin
  if p_status not in ('assigned', 'in_progress') then
    raise exception 'Use submit_task to submit work' using errcode = '22023';
  end if;
  select * into v from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  perform public.assert_task_actor(v, p_source);
  if v.status = p_status then
    return v;
  end if;
  if p_source = 'sheet' then
    perform set_config('app.actor_kind', 'sheet', true);
  end if;
  update public.tasks
     set status = p_status, status_changed_via = p_source
   where id = p_task_id
  returning * into v;
  return v;
end;
$$;

create or replace function public.start_task(p_task_id uuid)
returns public.tasks
language sql
security definer
set search_path = ''
as $$ select public.set_task_progress(p_task_id, 'in_progress', 'app') $$;

-- ---------------------------------------------------------------------------
-- Submit (or resubmit) deliverables. Creates a new submission version.
-- ---------------------------------------------------------------------------
create or replace function public.submit_task(
  p_task_id        uuid,
  p_links          text[],
  p_notes          text default null,
  p_thumbnail_path text default null,
  p_source         public.submission_source default 'app',
  p_submitted_at   timestamptz default null
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.tasks;
  v_links text[];
  v_notes text := nullif(btrim(p_notes), '');
  s       public.submissions;
begin
  select * into v from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  perform public.assert_task_actor(v, p_source);

  if v.status in ('approved', 'cancelled') then
    raise exception 'This task is % and can no longer be submitted', v.status using errcode = '22023';
  end if;
  if public.is_month_locked(v.videographer_id, v.month) then
    raise exception 'The % assessment is locked', public.format_month(v.month) using errcode = '55000';
  end if;

  select coalesce(array_agg(btrim(l) order by ord), '{}')
    into v_links
    from unnest(coalesce(p_links, '{}'::text[])) with ordinality as x(l, ord)
   where btrim(l) <> '';
  if cardinality(v_links) = 0 then
    raise exception 'Add at least one deliverable link' using errcode = '22023';
  elsif cardinality(v_links) > 5 then
    raise exception 'You can submit at most 5 links' using errcode = '22023';
  end if;
  if p_thumbnail_path is not null and p_thumbnail_path not like p_task_id::text || '/%' then
    raise exception 'Invalid thumbnail path' using errcode = '22023';
  end if;

  if p_source = 'sheet' then
    perform set_config('app.actor_kind', 'sheet', true);
  end if;

  insert into public.submissions (task_id, version, links, thumbnail_path, notes, source, submitted_by, submitted_at)
  values (
    p_task_id, 1, v_links, p_thumbnail_path, v_notes, p_source, v.videographer_id,
    case when public.is_service_context() and p_submitted_at is not null then p_submitted_at else now() end
  )
  returning * into s;

  update public.tasks
     set status = 'submitted',
         status_changed_via = p_source,
         videographer_notes = coalesce(v_notes, videographer_notes)
   where id = p_task_id;

  return s;
end;
$$;

-- Notes-only update (app or sheet) without creating a submission.
create or replace function public.update_task_notes(
  p_task_id uuid,
  p_notes   text,
  p_source  public.submission_source default 'app'
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.tasks;
begin
  select * into v from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  perform public.assert_task_actor(v, p_source);
  if v.status in ('approved', 'cancelled') then
    raise exception 'Notes are closed on % tasks', v.status using errcode = '22023';
  end if;
  if p_source = 'sheet' then
    perform set_config('app.actor_kind', 'sheet', true);
  end if;
  update public.tasks
     set videographer_notes = nullif(btrim(p_notes), '')
   where id = p_task_id
  returning * into v;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Admin review: approve with points + rating, or request a revision.
-- Approving an already-approved task re-scores it.
-- ---------------------------------------------------------------------------
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
  if not public.is_admin() then
    raise exception 'Only admins can review tasks' using errcode = '42501';
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

create or replace function public.cancel_task(p_task_id uuid, p_reason text default null)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.tasks;
begin
  if not public.is_admin() then
    raise exception 'Only admins can cancel tasks' using errcode = '42501';
  end if;
  update public.tasks set status = 'cancelled', status_changed_via = 'app'
   where id = p_task_id
  returning * into v;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  delete from public.featured_work where task_id = p_task_id;
  if nullif(btrim(p_reason), '') is not null then
    perform public.log_activity('task.cancel_reason', 'task', v.id, v.videographer_id, v.title,
      jsonb_build_object('reason', btrim(p_reason)));
  end if;
  return v;
end;
$$;

create or replace function public.restore_task(p_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.tasks;
begin
  if not public.is_admin() then
    raise exception 'Only admins can restore tasks' using errcode = '42501';
  end if;
  update public.tasks set status = 'assigned', status_changed_via = 'app'
   where id = p_task_id and status = 'cancelled'
  returning * into v;
  if not found then
    raise exception 'Only cancelled tasks can be restored' using errcode = '22023';
  end if;
  return v;
end;
$$;

create or replace function public.publish_plan(p_plan_id uuid)
returns public.monthly_plans
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.monthly_plans;
begin
  if not public.is_admin() then
    raise exception 'Only admins can publish plans' using errcode = '42501';
  end if;
  if not exists (select 1 from public.tasks where plan_id = p_plan_id and status <> 'cancelled') then
    raise exception 'Add at least one task before publishing' using errcode = '22023';
  end if;
  update public.monthly_plans set status = 'published'
   where id = p_plan_id
  returning * into v;
  if not found then
    raise exception 'Plan not found' using errcode = 'P0002';
  end if;
  return v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Assessments
-- ---------------------------------------------------------------------------
create or replace function public.compute_assessment(p_videographer_id uuid, p_month date)
returns public.monthly_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := public.month_start(p_month);
  m       record;
  a       public.monthly_assessments;
begin
  if not public.is_privileged() then
    raise exception 'Only admins can compute assessments' using errcode = '42501';
  end if;

  select * into m from public.calc_month_metrics(p_videographer_id, v_month);

  insert into public.monthly_assessments as ma (
    videographer_id, month,
    assigned_count, approved_count, submitted_count, on_time_count, points_awarded_sum, max_points_sum,
    points_pct, completion_pct, punctuality_pct, weights, computed_at
  )
  values (
    p_videographer_id, v_month,
    m.assigned_count, m.approved_count, m.submitted_count, m.on_time_count, m.points_awarded_sum, m.max_points_sum,
    public.safe_ratio(m.points_awarded_sum, m.max_points_sum),
    public.safe_ratio(m.approved_count, m.assigned_count),
    public.safe_ratio(m.on_time_count, m.submitted_count),
    public.current_weights(),
    now()
  )
  on conflict (videographer_id, month) do update set
    assigned_count     = excluded.assigned_count,
    approved_count     = excluded.approved_count,
    submitted_count    = excluded.submitted_count,
    on_time_count      = excluded.on_time_count,
    points_awarded_sum = excluded.points_awarded_sum,
    max_points_sum     = excluded.max_points_sum,
    points_pct         = excluded.points_pct,
    completion_pct     = excluded.completion_pct,
    punctuality_pct    = excluded.punctuality_pct,
    -- drafts follow the current settings; published scores keep their snapshot
    weights            = case when ma.status = 'draft' then excluded.weights else ma.weights end,
    computed_at        = now()
  where not ma.is_locked
  returning * into a;

  if not found then
    select * into a from public.monthly_assessments
     where videographer_id = p_videographer_id and month = v_month;
  end if;
  return a;
end;
$$;

-- Compute (or refresh) drafts for every videographer who has work that month.
create or replace function public.compute_month_assessments(p_month date)
returns setof public.monthly_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month date := public.month_start(p_month);
  v_id    uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can compute assessments' using errcode = '42501';
  end if;
  for v_id in
    select distinct t.videographer_id
      from public.tasks t
      join public.monthly_plans p on p.id = t.plan_id and p.status = 'published'
     where t.month = v_month
  loop
    return next public.compute_assessment(v_id, v_month);
  end loop;
end;
$$;

create or replace function public.publish_assessment(p_assessment_id uuid)
returns public.monthly_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  a           public.monthly_assessments;
  v_republish boolean;
begin
  if not public.is_admin() then
    raise exception 'Only admins can publish assessments' using errcode = '42501';
  end if;
  select * into a from public.monthly_assessments where id = p_assessment_id for update;
  if not found then
    raise exception 'Assessment not found' using errcode = 'P0002';
  end if;
  if a.is_locked then
    raise exception 'This assessment is already published and locked' using errcode = '22023';
  end if;
  v_republish := a.status = 'published';

  -- refresh the metrics one last time, then freeze
  a := public.compute_assessment(a.videographer_id, a.month);
  if a.discretionary_score is null then
    raise exception 'Add the discretionary score (0–10) before publishing' using errcode = '22023';
  end if;

  update public.monthly_assessments
     set status = 'published', is_locked = true, published_at = now(), published_by = auth.uid()
   where id = a.id
  returning * into a;

  perform public.notify(a.videographer_id, 'assessment_published',
    case when v_republish then 'Your ' || public.format_month(a.month) || ' assessment was updated'
         else 'Your ' || public.format_month(a.month) || ' assessment is published' end,
    'Score ' || to_char(a.total_score, 'FM990.00'),
    '/me/points?month=' || to_char(a.month, 'YYYY-MM'));
  perform public.log_activity(
    case when v_republish then 'assessment.republished' else 'assessment.published' end,
    'monthly_assessment', a.id, a.videographer_id, public.format_month(a.month),
    jsonb_build_object('total_score', a.total_score));
  return a;
end;
$$;

create or replace function public.unlock_assessment(p_assessment_id uuid, p_reason text)
returns public.monthly_assessments
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.monthly_assessments;
begin
  if not public.is_admin() then
    raise exception 'Only admins can unlock assessments' using errcode = '42501';
  end if;
  if char_length(coalesce(btrim(p_reason), '')) < 5 then
    raise exception 'Give a reason (at least 5 characters) for unlocking' using errcode = '22023';
  end if;
  select * into a from public.monthly_assessments where id = p_assessment_id for update;
  if not found then
    raise exception 'Assessment not found' using errcode = 'P0002';
  end if;
  if not a.is_locked then
    raise exception 'This assessment is not locked' using errcode = '22023';
  end if;

  insert into public.assessment_unlocks (assessment_id, unlocked_by, reason)
  values (a.id, auth.uid(), btrim(p_reason));
  update public.monthly_assessments set is_locked = false where id = a.id returning * into a;
  perform public.log_activity('assessment.unlocked', 'monthly_assessment', a.id, a.videographer_id,
    public.format_month(a.month), jsonb_build_object('reason', btrim(p_reason)));
  return a;
end;
$$;

-- ---------------------------------------------------------------------------
-- Featured work: replace the month's picks atomically.
-- p_picks: [{ "task_id": uuid, "rank": 1, "reason": "..." }, ...]
-- ---------------------------------------------------------------------------
create or replace function public.set_featured_work(p_month date, p_picks jsonb)
returns setof public.featured_work
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_month    date := public.month_start(p_month);
  v_prev_top uuid;
  v_new_top  public.tasks;
begin
  if not public.is_admin() then
    raise exception 'Only admins can choose featured work' using errcode = '42501';
  end if;
  if jsonb_typeof(coalesce(p_picks, '[]'::jsonb)) <> 'array' then
    raise exception 'Picks must be a list' using errcode = '22023';
  end if;

  select task_id into v_prev_top from public.featured_work where month = v_month and rank = 1;
  delete from public.featured_work where month = v_month;

  insert into public.featured_work (month, task_id, rank, reason, chosen_by)
  select v_month, (x ->> 'task_id')::uuid, (x ->> 'rank')::smallint, nullif(btrim(x ->> 'reason'), ''), auth.uid()
    from jsonb_array_elements(coalesce(p_picks, '[]'::jsonb)) as x;

  select t.* into v_new_top
    from public.featured_work f join public.tasks t on t.id = f.task_id
   where f.month = v_month and f.rank = 1;
  if v_new_top.id is not null and v_new_top.id is distinct from v_prev_top then
    perform public.notify(v_new_top.videographer_id, 'best_work',
      'Your work was picked as Best Work of ' || public.format_month(v_month) || '!',
      v_new_top.title, '/');
  end if;
  perform public.log_activity('featured.updated', 'featured_work', null, null, public.format_month(v_month),
    jsonb_build_object('count', jsonb_array_length(coalesce(p_picks, '[]'::jsonb))));

  return query select * from public.featured_work where month = v_month order by rank;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null
     and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Home page: cross-user data with a fixed, safe column set.
-- ---------------------------------------------------------------------------

-- A month is final once every videographer with work that month has a published assessment.
create or replace function public.is_month_final(p_month date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with crew as (
    select distinct t.videographer_id
      from public.tasks t
      join public.monthly_plans p on p.id = t.plan_id and p.status = 'published'
     where t.month = public.month_start(p_month) and t.status <> 'cancelled'
  )
  select exists (select 1 from crew)
     and not exists (
       select 1 from crew c
        where not exists (
          select 1 from public.monthly_assessments a
           where a.videographer_id = c.videographer_id
             and a.month = public.month_start(p_month)
             and a.status = 'published'
        )
     );
$$;

create or replace function public.get_leaderboard(p_month date)
returns table (
  videographer_id uuid,
  full_name       text,
  avatar_url      text,
  rank            integer,
  total_score     numeric,
  tasks_completed integer,
  tasks_assigned  integer,
  is_provisional  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_month date := public.month_start(p_month);
begin
  if auth.uid() is null and not public.is_service_context() then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if public.is_month_final(v_month) then
    return query
      select a.videographer_id, p.full_name, p.avatar_url,
             (rank() over (order by a.total_score desc))::integer,
             a.total_score::numeric, a.approved_count, a.assigned_count, false
        from public.monthly_assessments a
        join public.profiles p on p.id = a.videographer_id
       where a.month = v_month and a.status = 'published'
       order by a.total_score desc, a.approved_count desc, a.punctuality_pct desc, p.full_name;
  else
    return query
      with s as (
        select t.videographer_id as vid,
               coalesce(sum(t.points_awarded) filter (where t.status = 'approved'), 0)::numeric as pts,
               (count(*) filter (where t.status = 'approved'))::integer as done,
               count(*)::integer as assigned
          from public.tasks t
          join public.monthly_plans pl on pl.id = t.plan_id and pl.status = 'published'
         where t.month = v_month and t.status <> 'cancelled'
         group by t.videographer_id
      )
      select s.vid, p.full_name, p.avatar_url,
             (rank() over (order by s.pts desc))::integer,
             s.pts, s.done, s.assigned, true
        from s
        join public.profiles p on p.id = s.vid
       where p.is_active
       order by s.pts desc, s.done desc, p.full_name;
  end if;
end;
$$;

create or replace function public.get_top_performer(p_month date)
returns table (
  videographer_id uuid,
  full_name       text,
  avatar_url      text,
  total_score     numeric,
  tasks_completed integer,
  tasks_assigned  integer,
  public_note     text,
  is_provisional  boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.videographer_id, l.full_name, l.avatar_url, l.total_score, l.tasks_completed, l.tasks_assigned,
         case when not l.is_provisional then a.public_note end,
         l.is_provisional
    from public.get_leaderboard(p_month) l
    left join public.monthly_assessments a
      on a.videographer_id = l.videographer_id
     and a.month = public.month_start(p_month)
     and a.status = 'published'
   where l.total_score > 0
   order by l.total_score desc, l.tasks_completed desc, l.full_name
   limit 1;
$$;

create or replace function public.get_featured_work(p_month date)
returns table (
  rank                    smallint,
  reason                  text,
  task_id                 uuid,
  title                   text,
  category                text,
  client_name             text,
  client_logo_url         text,
  videographer_id         uuid,
  videographer_name       text,
  videographer_avatar_url text,
  links                   text[],
  thumbnail_path          text,
  quality_rating          smallint,
  approved_at             timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.rank, f.reason, t.id, t.title, c.name, cl.name, cl.logo_url,
         p.id, p.full_name, p.avatar_url, s.links, s.thumbnail_path, t.quality_rating, t.approved_at
    from public.featured_work f
    join public.tasks t on t.id = f.task_id
    join public.task_categories c on c.id = t.category_id
    join public.clients cl on cl.id = t.client_id
    join public.profiles p on p.id = t.videographer_id
    left join lateral (
      select sub.links, sub.thumbnail_path
        from public.submissions sub
       where sub.task_id = t.id
       order by sub.version desc
       limit 1
    ) s on true
   where f.month = public.month_start(p_month)
     and (auth.uid() is not null or public.is_service_context())
   order by f.rank;
$$;

create or replace function public.get_team_stats(p_month date)
returns table (
  videos_delivered integer,
  clients_served   integer,
  on_time_pct      numeric,
  tasks_assigned   integer,
  crew_count       integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (count(*) filter (where t.status = 'approved'))::integer,
    (count(distinct t.client_id) filter (where t.status = 'approved'))::integer,
    public.safe_ratio(
      count(*) filter (where t.first_submitted_at is not null and t.first_submitted_at < public.due_deadline(t.due_date)),
      count(*) filter (where t.first_submitted_at is not null)),
    count(*)::integer,
    (count(distinct t.videographer_id))::integer
  from public.tasks t
  join public.monthly_plans p on p.id = t.plan_id and p.status = 'published'
  where t.month = public.month_start(p_month)
    and t.status <> 'cancelled'
    and (auth.uid() is not null or public.is_service_context());
$$;

-- Months that have any published plan (for month pickers), newest first.
create or replace function public.available_months()
returns setof date
language sql
stable
security definer
set search_path = ''
as $$
  select distinct p.month
    from public.monthly_plans p
   where p.status = 'published'
     and (auth.uid() is not null or public.is_service_context())
   order by p.month desc;
$$;

-- ---------------------------------------------------------------------------
-- Grants: RPCs are for signed-in users only (each checks its own role rules).
-- ---------------------------------------------------------------------------
revoke execute on function
  public.set_task_progress(uuid, public.task_status, public.submission_source),
  public.start_task(uuid),
  public.submit_task(uuid, text[], text, text, public.submission_source, timestamptz),
  public.update_task_notes(uuid, text, public.submission_source),
  public.review_task(uuid, public.review_decision, integer, integer, text),
  public.cancel_task(uuid, text),
  public.restore_task(uuid),
  public.publish_plan(uuid),
  public.compute_assessment(uuid, date),
  public.compute_month_assessments(date),
  public.publish_assessment(uuid),
  public.unlock_assessment(uuid, text),
  public.set_featured_work(date, jsonb),
  public.mark_notifications_read(uuid[]),
  public.is_month_final(date),
  public.get_leaderboard(date),
  public.get_top_performer(date),
  public.get_featured_work(date),
  public.get_team_stats(date),
  public.available_months()
from public, anon;

grant execute on function
  public.set_task_progress(uuid, public.task_status, public.submission_source),
  public.start_task(uuid),
  public.submit_task(uuid, text[], text, text, public.submission_source, timestamptz),
  public.update_task_notes(uuid, text, public.submission_source),
  public.review_task(uuid, public.review_decision, integer, integer, text),
  public.cancel_task(uuid, text),
  public.restore_task(uuid),
  public.publish_plan(uuid),
  public.compute_assessment(uuid, date),
  public.compute_month_assessments(date),
  public.publish_assessment(uuid),
  public.unlock_assessment(uuid, text),
  public.set_featured_work(date, jsonb),
  public.mark_notifications_read(uuid[]),
  public.is_month_final(date),
  public.get_leaderboard(date),
  public.get_top_performer(date),
  public.get_featured_work(date),
  public.get_team_stats(date),
  public.available_months()
to authenticated, service_role;
