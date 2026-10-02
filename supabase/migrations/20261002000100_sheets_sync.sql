-- Phase 6: Google Sheets sync support — run bookkeeping, task snapshots for the
-- sync service, config hygiene, and the pg_cron schedule (every 10 minutes).

-- ---------------------------------------------------------------------------
-- Runs: at most one at a time. A run stuck in "running" for 15 min is treated
-- as crashed so the next one can start.
-- ---------------------------------------------------------------------------
create or replace function public.begin_sync_run(p_trigger text, p_triggered_by uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_service_context() then
    raise exception 'Only the sync service can start a run' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtext('crewboard.sheets_sync'));

  update public.sync_runs
     set status = 'error', finished_at = now(), stats = stats || jsonb_build_object('error', 'Timed out')
   where status = 'running' and started_at < now() - interval '15 minutes';

  if exists (select 1 from public.sync_runs where status = 'running') then
    return null;
  end if;

  insert into public.sync_runs (trigger, triggered_by) values (p_trigger, p_triggered_by) returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.finish_sync_run(p_run_id uuid, p_status text, p_stats jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_service_context() then
    raise exception 'Only the sync service can finish a run' using errcode = '42501';
  end if;
  update public.sync_runs
     set status = p_status, stats = coalesce(p_stats, '{}'::jsonb), finished_at = now()
   where id = p_run_id;
  -- keep the logs small: runs older than 30 days (events cascade), processed outbox rows after 7
  delete from public.sync_runs where started_at < now() - interval '30 days';
  delete from public.sheet_outbox where processed_at < now() - interval '7 days';
end;
$$;

-- ---------------------------------------------------------------------------
-- Everything the sheet shows for a videographer's tasks, in one round trip.
-- Published plans only (drafts never reach the sheet).
-- ---------------------------------------------------------------------------
create or replace function public.sheet_task_snapshots(p_videographer_id uuid)
returns table (
  id               uuid,
  month            date,
  client           text,
  title            text,
  category         text,
  brief            text,
  refs             text[],
  due_date         date,
  status           public.task_status,
  status_changed_at timestamptz,
  max_points       integer,
  points_awarded   integer,
  notes            text,
  latest_links     text[],
  feedback         text,
  updated_at       timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    t.id, t.month, c.name, t.title, cat.name, t.brief,
    coalesce((
      select array_agg(
               case r.kind
                 when 'link' then coalesce(r.title || ': ', '') || r.url
                 when 'note' then 'Note: ' || r.note
                 else 'File: ' || coalesce(r.title, 'attachment') || ' (open in CrewBoard)'
               end
               order by r.sort_order, r.created_at)
        from public.task_references r where r.task_id = t.id
    ), '{}'),
    t.due_date, t.status, t.status_changed_at, t.max_points, t.points_awarded, t.videographer_notes,
    coalesce((select s.links from public.submissions s where s.task_id = t.id order by s.version desc limit 1), '{}'),
    (select case rv.decision when 'approved' then 'Approved: ' else 'Changes requested: ' end || coalesce(rv.feedback, '')
       from public.task_reviews rv where rv.task_id = t.id order by rv.reviewed_at desc limit 1),
    greatest(t.updated_at, t.status_changed_at)
  from public.tasks t
  join public.monthly_plans p on p.id = t.plan_id and p.status = 'published'
  join public.clients c on c.id = t.client_id
  join public.task_categories cat on cat.id = t.category_id
  where t.videographer_id = p_videographer_id
    and public.is_service_context()
  order by t.due_date, t.title;
$$;

revoke execute on function
  public.begin_sync_run(text, uuid),
  public.finish_sync_run(uuid, text, jsonb),
  public.sheet_task_snapshots(uuid)
from public, anon, authenticated;
grant execute on function
  public.begin_sync_run(text, uuid),
  public.finish_sync_run(uuid, text, jsonb),
  public.sheet_task_snapshots(uuid)
to service_role;

-- ---------------------------------------------------------------------------
-- Pointing a videographer at a different sheet/tab forgets the old row baselines,
-- so the new sheet is filled from the app instead of being read as edits.
-- ---------------------------------------------------------------------------
create or replace function public.sheet_configs_reset_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.spreadsheet_id is distinct from old.spreadsheet_id or new.tab_name is distinct from old.tab_name then
    delete from public.sheet_row_state where sheet_config_id = new.id;
    new.provisioned_at := null;
    new.last_status := null;
    new.last_error := null;
  end if;
  return new;
end;
$$;

create trigger sheet_configs_reset_state
  before update on public.sheet_configs
  for each row execute function public.sheet_configs_reset_state();

create or replace function public.sheet_configs_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_activity('sheet.connected', 'profile', new.videographer_id, new.videographer_id, new.tab_name, '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    perform public.log_activity('sheet.disconnected', 'profile', old.videographer_id, old.videographer_id, old.tab_name, '{}'::jsonb);
    return old;
  end if;
  return null;
end;
$$;

create trigger sheet_configs_audit
  after insert or delete on public.sheet_configs
  for each row execute function public.sheet_configs_audit();

-- Master-tab mode: one spreadsheet, so each tab name must be unique within it.
create unique index sheet_configs_tab_key on public.sheet_configs (spreadsheet_id, lower(tab_name));

-- ---------------------------------------------------------------------------
-- Schedule: pg_cron → pg_net POST to the `sheets` Edge Function every 10 minutes.
-- The URL and shared secret live in Vault (see SHEETS_SETUP.md); without them,
-- or with sync switched off in Settings, the job does nothing.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_sheets_sync()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  if not exists (select 1 from public.app_settings where id and sync_enabled) then
    return null;
  end if;
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'sheets_sync_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'sheets_sync_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
    body := jsonb_build_object('action', 'sync', 'trigger', 'cron'),
    timeout_milliseconds := 120000
  );
end;
$$;
revoke execute on function public.trigger_sheets_sync() from public, anon, authenticated;

select cron.schedule('crewboard-sheets-sync', '*/10 * * * *', 'select public.trigger_sheets_sync()');
