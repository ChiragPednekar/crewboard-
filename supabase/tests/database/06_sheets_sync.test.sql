-- Phase 6: sync bookkeeping is service-only, one run at a time, snapshots cover
-- published plans only, and re-pointing a config forgets old row baselines.
begin;
select plan(11);

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000006', 'authenticated', 'authenticated',
   's-admin@test.local', '{"role":"admin"}', '{"full_name":"Sync Admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-000000000006', 'authenticated', 'authenticated',
   's-v1@test.local', '{"role":"videographer"}', '{"full_name":"Sync Vid"}');
insert into public.clients (id, name) values ('c1000000-0000-4000-a000-000000000006', 'Sync Client');
insert into public.task_categories (id, name) values ('ca000000-0000-4000-a000-000000000006', 'Sync Category');
insert into public.monthly_plans (id, videographer_id, month, status) values
  ('d1000000-0000-4000-a000-000000000006', 'bbbbbbbb-0000-4000-a000-000000000006', '2034-01-01', 'draft'),
  ('d2000000-0000-4000-a000-000000000006', 'bbbbbbbb-0000-4000-a000-000000000006', '2034-02-01', 'draft');
insert into public.tasks (id, plan_id, client_id, category_id, title, due_date) values
  ('e1000000-0000-4000-a000-000000000006', 'd1000000-0000-4000-a000-000000000006', 'c1000000-0000-4000-a000-000000000006', 'ca000000-0000-4000-a000-000000000006', 'Published one', '2034-01-10'),
  ('e2000000-0000-4000-a000-000000000006', 'd2000000-0000-4000-a000-000000000006', 'c1000000-0000-4000-a000-000000000006', 'ca000000-0000-4000-a000-000000000006', 'Draft one', '2034-02-10');
insert into public.task_references (task_id, kind, url, title) values
  ('e1000000-0000-4000-a000-000000000006', 'link', 'https://youtu.be/ref', 'Mood');
update public.monthly_plans set status = 'published' where id = 'd1000000-0000-4000-a000-000000000006';

insert into public.sheet_configs (id, videographer_id, spreadsheet_id, tab_name) values
  ('5c000000-0000-4000-a000-000000000006', 'bbbbbbbb-0000-4000-a000-000000000006', 'spreadsheetAAAAAAAAAAAAAAAA', 'Tasks');
insert into public.sheet_row_state (task_id, sheet_config_id, last_status) values
  ('e1000000-0000-4000-a000-000000000006', '5c000000-0000-4000-a000-000000000006', 'Assigned');

-- Service context (no end-user JWT) -------------------------------------------------
delete from public.sync_runs;
select isnt(public.begin_sync_run('manual', null), null, 'a run can start');
select is(public.begin_sync_run('cron', null), null, 'a second run waits while one is running');
update public.sync_runs set started_at = now() - interval '20 minutes';
select isnt(public.begin_sync_run('cron', null), null, 'a run stuck for 15+ minutes is abandoned');
select is((select count(*)::integer from public.sync_runs where status = 'error'), 1, 'and marked as an error');

select is((select array_agg(title) from public.sheet_task_snapshots('bbbbbbbb-0000-4000-a000-000000000006')), array['Published one'],
  'snapshots only include tasks from published plans');
select is((select refs from public.sheet_task_snapshots('bbbbbbbb-0000-4000-a000-000000000006')), array['Mood: https://youtu.be/ref'],
  'references are formatted for the sheet');

update public.sheet_configs set tab_name = 'Renamed' where id = '5c000000-0000-4000-a000-000000000006';
select is((select count(*)::integer from public.sheet_row_state where sheet_config_id = '5c000000-0000-4000-a000-000000000006'), 0,
  'pointing a config at another tab forgets the old row baselines');
select throws_ok($$insert into public.sheet_configs (videographer_id, spreadsheet_id, tab_name)
                   select 'aaaaaaaa-0000-4000-a000-000000000006', 'spreadsheetAAAAAAAAAAAAAAAA', 'renamed'$$,
  '23505', null, 'two people cannot share a tab in the same spreadsheet');

-- As a signed-in admin: the service functions are off limits ---------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000006","role":"authenticated"}', true);
select throws_ok($$select public.begin_sync_run('manual', null)$$, '42501', null, 'admins cannot start runs directly');
select throws_ok($$select * from public.sheet_task_snapshots('bbbbbbbb-0000-4000-a000-000000000006')$$, '42501', null,
  'snapshots are service-only');
select throws_ok($$select public.trigger_sheets_sync()$$, '42501', null, 'the cron trigger is service-only');

select * from finish();
rollback;
