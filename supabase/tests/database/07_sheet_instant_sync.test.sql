-- Sheets: "Completed" without a link is accepted from a sheet (never from the app form),
-- and instant-sync tokens are admin-only, per tab, and stored only as a hash.
begin;
select plan(9);

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000007', 'authenticated', 'authenticated',
   'i-admin@test.local', '{"role":"admin"}', '{"full_name":"Instant Admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-000000000007', 'authenticated', 'authenticated',
   'i-v1@test.local', '{"role":"videographer"}', '{"full_name":"Instant Vid"}');
insert into public.clients (id, name) values ('c1000000-0000-4000-a000-000000000007', 'Instant Client');
insert into public.task_categories (id, name) values ('ca000000-0000-4000-a000-000000000007', 'Instant Category');
insert into public.monthly_plans (id, videographer_id, month, status) values
  ('d1000000-0000-4000-a000-000000000007', 'bbbbbbbb-0000-4000-a000-000000000007', '2035-01-01', 'draft');
insert into public.tasks (id, plan_id, client_id, category_id, title, due_date) values
  ('e1000000-0000-4000-a000-000000000007', 'd1000000-0000-4000-a000-000000000007', 'c1000000-0000-4000-a000-000000000007', 'ca000000-0000-4000-a000-000000000007', 'From sheet', '2035-01-10'),
  ('e2000000-0000-4000-a000-000000000007', 'd1000000-0000-4000-a000-000000000007', 'c1000000-0000-4000-a000-000000000007', 'ca000000-0000-4000-a000-000000000007', 'From app', '2035-01-12');
update public.monthly_plans set status = 'published' where id = 'd1000000-0000-4000-a000-000000000007';
insert into public.sheet_configs (id, videographer_id, spreadsheet_id, tab_name) values
  ('5c000000-0000-4000-a000-000000000007', 'bbbbbbbb-0000-4000-a000-000000000007', 'spreadsheetINSTANTAAAAAAAAA', 'Tasks');

-- Service context (the sync): Completed with no link -------------------------------
select lives_ok($$select public.submit_task('e1000000-0000-4000-a000-000000000007', '{}', null, null, 'sheet')$$,
  'a sheet can mark work Completed without a link');
select is((select status::text from public.tasks where id = 'e1000000-0000-4000-a000-000000000007'), 'submitted',
  'and the task is handed in for review');
select is((select cardinality(links) from public.submissions where task_id = 'e1000000-0000-4000-a000-000000000007'), 0,
  'with an empty link list');

-- As the videographer in the app: a link is still required ------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-000000000007","role":"authenticated"}', true);
select throws_ok($$select public.submit_task('e2000000-0000-4000-a000-000000000007', '{}')$$,
  '22023', 'Add at least one deliverable link', 'the app form still needs a link');
select throws_ok($$select * from public.issue_sheet_ping_tokens('spreadsheetINSTANTAAAAAAAAA')$$,
  '42501', null, 'videographers cannot create sheet scripts');

-- As the admin: tokens -------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000007","role":"authenticated"}', true);
create temp table issued on commit drop as select * from public.issue_sheet_ping_tokens('spreadsheetINSTANTAAAAAAAAA');
select is((select count(*)::integer from issued), 1, 'one token per tab');
select ok((select token ~ '^[0-9a-f]{64}$' from issued), 'tokens are 64 hex characters');
select is((select ping_token_hash from public.sheet_configs where id = '5c000000-0000-4000-a000-000000000007'),
          (select encode(sha256(convert_to(token, 'UTF8')), 'hex') from issued),
  'only the SHA-256 of the token is stored');
select throws_ok($$select * from public.issue_sheet_ping_tokens('spreadsheetUNKNOWNAAAAAAAAA')$$,
  'P0002', null, 'an unconnected spreadsheet has no tabs to issue for');

select * from finish();
rollback;
