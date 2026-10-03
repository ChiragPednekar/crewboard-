-- Sheets: "Completed" in a sheet is enough (no link needed), and instant sync —
-- an Apps Script trigger pings the `sheets` function on every edit with a per-tab token.

-- ---------------------------------------------------------------------------
-- A submission made from a sheet may have no link. The app's own form still
-- requires one (checked in submit_task below).
-- ---------------------------------------------------------------------------
alter table public.submissions drop constraint submissions_links_check;
alter table public.submissions add constraint submissions_links_check check (cardinality(links) <= 5);

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
  -- marking work Completed in a sheet doesn't need a link; the app's form does
  if cardinality(v_links) = 0 and p_source <> 'sheet' then
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

-- ---------------------------------------------------------------------------
-- Instant sync. Each tab gets its own token; only its SHA-256 is stored. A ping
-- can only ask for that one tab to be synced, so a leaked script is low-risk.
-- ---------------------------------------------------------------------------
alter table public.sheet_configs
  add column ping_token_hash   text unique,
  add column sync_requested_at timestamptz;

alter table public.sync_runs drop constraint sync_runs_trigger_check;
alter table public.sync_runs add constraint sync_runs_trigger_check check (trigger in ('cron', 'manual', 'sheet'));

-- New tokens for every tab in one spreadsheet (one script serves the whole file).
-- Issuing again replaces the old tokens, so a script pasted earlier stops working.
create or replace function public.issue_sheet_ping_tokens(p_spreadsheet_id text)
returns table (config_id uuid, tab_name text, token text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c record;
  v_token text;
begin
  if not public.is_admin() then
    raise exception 'Only admins can set up sheet scripts' using errcode = '42501';
  end if;
  for c in
    select sc.id, sc.tab_name from public.sheet_configs sc
     where sc.spreadsheet_id = p_spreadsheet_id
     order by sc.tab_name
  loop
    v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
    update public.sheet_configs
       set ping_token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
     where id = c.id;
    config_id := c.id;
    tab_name := c.tab_name;
    token := v_token;
    return next;
  end loop;
  if not found then
    raise exception 'No sheet is connected to that spreadsheet' using errcode = 'P0002';
  end if;
end;
$$;
revoke execute on function public.issue_sheet_ping_tokens(text) from public, anon;
grant execute on function public.issue_sheet_ping_tokens(text) to authenticated;
