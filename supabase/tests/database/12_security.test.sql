-- Hardening: what signed-out visitors can reach, http(s)-only links, the rate limiter.
begin;
select plan(10);

select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}') from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  '{}'::text[], 'every public table has row-level security');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('anon', p.oid, 'EXECUTE')),
  array['get_client_review', 'my_access', 'signup_requests_open', 'submit_client_review'],
  'signed-out visitors can call only the four functions made for them');
select ok(has_function_privilege('authenticated', 'public.is_privileged()', 'EXECUTE'), 'signed-in users keep the helpers RLS needs');

-- links ------------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-00000000000c', 'authenticated', 'authenticated',
   'sec-v1@test.local', '{"role":"videographer"}', '{"full_name":"Sec Vid"}');
insert into public.clients (id, name) values ('c1000000-0000-4000-a000-00000000000c', 'Sec Client');
insert into public.task_categories (id, name) values ('ca000000-0000-4000-a000-00000000000c', 'Sec Category');
insert into public.monthly_plans (id, videographer_id, month, status) values
  ('d1000000-0000-4000-a000-00000000000c', 'bbbbbbbb-0000-4000-a000-00000000000c', '2035-03-01', 'draft');
insert into public.tasks (id, plan_id, client_id, category_id, title, due_date) values
  ('e1000000-0000-4000-a000-00000000000c', 'd1000000-0000-4000-a000-00000000000c', 'c1000000-0000-4000-a000-00000000000c', 'ca000000-0000-4000-a000-00000000000c', 'Sec task', '2035-03-10');
update public.monthly_plans set status = 'published' where id = 'd1000000-0000-4000-a000-00000000000c';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-00000000000c","role":"authenticated"}', true);
select throws_ok($$select public.submit_task('e1000000-0000-4000-a000-00000000000c', array['javascript:alert(1)'])$$,
  '23514', null, 'a javascript: link is refused by the database');
select throws_ok($$select public.submit_task('e1000000-0000-4000-a000-00000000000c', array['https://ok.example/a b'])$$,
  '23514', null, 'so is a link with spaces');
select lives_ok($$select public.submit_task('e1000000-0000-4000-a000-00000000000c', array['https://youtu.be/x'])$$, 'a normal link is fine');

-- rate limiter -----------------------------------------------------------------------
select is(public.hit_rate_limit('test', 2, 60), true, 'first call allowed');
select is(public.hit_rate_limit('test', 2, 60), true, 'second call allowed');
select is(public.hit_rate_limit('test', 2, 60), false, 'third call in the window is refused');
select throws_ok($$select count(*) from public.rate_limit_hits$$, '42501', null, 'the counter table is private');

select * from finish();
rollback;
