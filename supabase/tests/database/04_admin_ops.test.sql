-- Phase 2 admin operations: plans, create_tasks (assign to many), duplicate_plan,
-- client assignment, account status, and the rules around deleting tasks.
begin;
select plan(26);

-- Fixtures ----------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000004', 'authenticated', 'authenticated',
   'o-admin@test.local', '{"role":"admin"}', '{"full_name":"Ops Admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-000000000004', 'authenticated', 'authenticated',
   'o-v1@test.local', '{"role":"videographer"}', '{"full_name":"Ops Vid One"}'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-4000-a000-000000000004', 'authenticated', 'authenticated',
   'o-v2@test.local', '{"role":"videographer"}', '{"full_name":"Ops Vid Two"}');
insert into public.clients (id, name) values
  ('c1000000-0000-4000-a000-000000000004', 'Ops Client One'),
  ('c2000000-0000-4000-a000-000000000004', 'Ops Client Two');
insert into public.task_categories (id, name, default_max_points) values
  ('ca000000-0000-4000-a000-000000000004', 'Ops Category', 15);

-- As the admin -------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000004","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.create_tasks('2032-05-01',
     array['bbbbbbbb-0000-4000-a000-000000000004', 'cccccccc-0000-4000-a000-000000000004',
           'bbbbbbbb-0000-4000-a000-000000000004']::uuid[],
     '{"client_id":"c1000000-0000-4000-a000-000000000004","category_id":"ca000000-0000-4000-a000-000000000004",
       "title":"Shared shoot","brief":"Same brief","due_date":"2032-05-31","priority":"high"}',
     '[{"kind":"link","url":"https://youtu.be/xyz","title":"Ref"},{"kind":"note","note":"Bring the gimbal"}]')),
  2, 'create_tasks makes one task per distinct videographer');
select is((select count(*)::integer from public.monthly_plans where month = '2032-05-01'
            and videographer_id in ('bbbbbbbb-0000-4000-a000-000000000004', 'cccccccc-0000-4000-a000-000000000004')
            and status = 'draft'),
  2, 'missing plans are created as drafts');
select is((select max_points from public.tasks where title = 'Shared shoot' limit 1), 15,
  'max points default to the category');
select is((select count(*)::integer from public.task_references r join public.tasks t on t.id = r.task_id
            where t.title = 'Shared shoot'),
  4, 'references are copied to every task');
select is((select priority::text from public.tasks where title = 'Shared shoot' limit 1), 'high', 'priority is kept');

select throws_ok($$select public.create_tasks('2032-05-01', array['bbbbbbbb-0000-4000-a000-000000000004']::uuid[],
    '{"client_id":"c1000000-0000-4000-a000-000000000004","category_id":"ca000000-0000-4000-a000-000000000004",
      "title":"Wrong month","due_date":"2032-06-02"}')$$,
  '22023', 'The due date must fall in May 2032', 'due date must be inside the plan month');
select throws_ok($$select public.create_tasks('2032-05-01', '{}'::uuid[],
    '{"client_id":"c1000000-0000-4000-a000-000000000004","category_id":"ca000000-0000-4000-a000-000000000004",
      "title":"Nobody","due_date":"2032-05-02"}')$$,
  '22023', 'Pick at least one videographer', 'needs at least one videographer');
select throws_ok($$select public.create_tasks('2032-05-01', array['bbbbbbbb-0000-4000-a000-000000000004']::uuid[],
    '{"client_id":"c1000000-0000-4000-a000-000000000004","category_id":"ca000000-0000-4000-a000-000000000004",
      "title":"File ref","due_date":"2032-05-02"}', '[{"kind":"file","storage_path":"x/y"}]')$$,
  '22023', 'Only link and note references can be added here', 'file references are uploaded separately');
select throws_ok($$select public.ensure_plan('aaaaaaaa-0000-4000-a000-000000000004', '2032-05-01')$$,
  '22023', 'Plans can only be created for active videographers', 'no plans for admins');

-- duplicate_plan
update public.monthly_plans set summary = 'May focus', goals = 'Ship it'
 where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000004' and month = '2032-05-01';
select public.create_tasks('2032-05-01', array['bbbbbbbb-0000-4000-a000-000000000004']::uuid[],
  '{"client_id":"c2000000-0000-4000-a000-000000000004","category_id":"ca000000-0000-4000-a000-000000000004",
    "title":"To be cancelled","due_date":"2032-05-10"}');
select public.cancel_task(id) from public.tasks where title = 'To be cancelled';

select is(
  (public.duplicate_plan('bbbbbbbb-0000-4000-a000-000000000004', '2032-05-01', '2032-06-01')) ->> 'copied',
  '1', 'duplicate_plan copies the non-cancelled tasks');
select is((select due_date from public.tasks
            where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000004' and month = '2032-06-01'),
  '2032-06-30'::date, 'day 31 is clamped to the last day of a 30-day month');
select is((select status::text from public.tasks
            where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000004' and month = '2032-06-01'),
  'assigned', 'copied tasks start fresh');
select is((select summary from public.monthly_plans
            where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000004' and month = '2032-06-01'),
  'May focus', 'summary is carried over');
select is((select count(*)::integer from public.task_references r join public.tasks t on t.id = r.task_id
            where t.videographer_id = 'bbbbbbbb-0000-4000-a000-000000000004' and t.month = '2032-06-01'),
  2, 'link and note references are carried over');
select throws_ok($$select public.duplicate_plan('bbbbbbbb-0000-4000-a000-000000000004', '2032-01-01', '2032-06-01')$$,
  'P0002', 'There is no plan for January 2032 to copy', 'copying from an empty month explains why');

-- client assignment
select is(public.set_videographer_clients('bbbbbbbb-0000-4000-a000-000000000004',
  array['c1000000-0000-4000-a000-000000000004', 'c2000000-0000-4000-a000-000000000004']::uuid[]), 2,
  'assign two clients');
select is(public.set_videographer_clients('bbbbbbbb-0000-4000-a000-000000000004',
  array['c2000000-0000-4000-a000-000000000004']::uuid[]), 1, 'replacing the list removes the others');
select is(public.set_client_videographers('c2000000-0000-4000-a000-000000000004',
  array['cccccccc-0000-4000-a000-000000000004']::uuid[]), 1, 'client crew can be replaced from the client side');
select ok(not exists (select 1 from public.videographer_clients
                       where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000004'),
  'and that removes the videographer that is no longer listed');

select ok((select count(*) from public.get_account_status()) >= 3, 'admin can read account status');

-- deleting tasks
select lives_ok($$delete from public.tasks where title = 'Shared shoot'
                    and videographer_id = 'cccccccc-0000-4000-a000-000000000004'$$,
  'a task without submissions can be deleted');
select ok(exists (select 1 from public.activity_log where action = 'task.deleted' and summary = 'Shared shoot'),
  'deletion is logged');

-- As a videographer: none of this is allowed ---------------------------------------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-000000000004","role":"authenticated"}', true);
select throws_ok($$select public.create_tasks('2032-05-01', array['bbbbbbbb-0000-4000-a000-000000000004']::uuid[],
    '{"client_id":"c1000000-0000-4000-a000-000000000004","category_id":"ca000000-0000-4000-a000-000000000004",
      "title":"Self-assigned","due_date":"2032-05-02"}')$$,
  '42501', null, 'videographers cannot create tasks');
select throws_ok($$select public.duplicate_plan('bbbbbbbb-0000-4000-a000-000000000004', '2032-05-01', '2032-07-01')$$,
  '42501', null, 'videographers cannot duplicate plans');
select throws_ok($$select public.set_videographer_clients('bbbbbbbb-0000-4000-a000-000000000004',
    array['c1000000-0000-4000-a000-000000000004']::uuid[])$$,
  '42501', null, 'videographers cannot assign themselves clients');
select throws_ok($$select * from public.get_account_status()$$, '42501', null,
  'videographers cannot read account status');

select * from finish();
rollback;
