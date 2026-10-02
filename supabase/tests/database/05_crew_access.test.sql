-- Phase 3: a videographer sees the client behind each of their published tasks,
-- but nothing about clients from draft plans or other people's work.
begin;
select plan(5);

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-000000000005', 'authenticated', 'authenticated',
   'c-v1@test.local', '{"role":"videographer"}', '{"full_name":"Crew One"}'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-4000-a000-000000000005', 'authenticated', 'authenticated',
   'c-v2@test.local', '{"role":"videographer"}', '{"full_name":"Crew Two"}');
insert into public.clients (id, name) values
  ('c1000000-0000-4000-a000-000000000005', 'Linked Client'),
  ('c2000000-0000-4000-a000-000000000005', 'Published Task Client'),
  ('c3000000-0000-4000-a000-000000000005', 'Draft Task Client'),
  ('c4000000-0000-4000-a000-000000000005', 'Someone Else Client');
insert into public.videographer_clients (videographer_id, client_id) values
  ('bbbbbbbb-0000-4000-a000-000000000005', 'c1000000-0000-4000-a000-000000000005');
insert into public.task_categories (id, name) values ('ca000000-0000-4000-a000-000000000005', 'Crew Category');
insert into public.monthly_plans (id, videographer_id, month, status) values
  ('d1000000-0000-4000-a000-000000000005', 'bbbbbbbb-0000-4000-a000-000000000005', '2033-01-01', 'draft'),
  ('d2000000-0000-4000-a000-000000000005', 'bbbbbbbb-0000-4000-a000-000000000005', '2033-02-01', 'draft'),
  ('d3000000-0000-4000-a000-000000000005', 'cccccccc-0000-4000-a000-000000000005', '2033-01-01', 'draft');
insert into public.tasks (plan_id, client_id, category_id, title, due_date) values
  ('d1000000-0000-4000-a000-000000000005', 'c2000000-0000-4000-a000-000000000005', 'ca000000-0000-4000-a000-000000000005', 'Pub', '2033-01-10'),
  ('d2000000-0000-4000-a000-000000000005', 'c3000000-0000-4000-a000-000000000005', 'ca000000-0000-4000-a000-000000000005', 'Draft', '2033-02-10'),
  ('d3000000-0000-4000-a000-000000000005', 'c4000000-0000-4000-a000-000000000005', 'ca000000-0000-4000-a000-000000000005', 'Other', '2033-01-10');
update public.monthly_plans set status = 'published'
 where id in ('d1000000-0000-4000-a000-000000000005', 'd3000000-0000-4000-a000-000000000005');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-000000000005","role":"authenticated"}', true);

select ok(exists (select 1 from public.clients where id = 'c1000000-0000-4000-a000-000000000005'),
  'linked clients are visible');
select ok(exists (select 1 from public.clients where id = 'c2000000-0000-4000-a000-000000000005'),
  'the client of a published task is visible even when not linked');
select ok(not exists (select 1 from public.clients where id = 'c3000000-0000-4000-a000-000000000005'),
  'the client of a draft-plan task stays hidden');
select ok(not exists (select 1 from public.clients where id = 'c4000000-0000-4000-a000-000000000005'),
  'another videographer''s client stays hidden');
select is((select count(*)::integer from public.tasks), 1, 'only the published own task is visible');

select * from finish();
rollback;
