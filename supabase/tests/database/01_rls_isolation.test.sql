-- RLS isolation: a videographer can never read or change another videographer's
-- data, nor reach admin-only operations, regardless of what the UI does.
--
-- Fixture ids
--   admin  aaaaaaaa-0000-4000-a000-000000000001
--   V1     bbbbbbbb-0000-4000-a000-000000000001   (client C1, plan P1 published, plan P3 draft)
--   V2     cccccccc-0000-4000-a000-000000000001   (client C2, plan P2 published)
--   T1 (V1, published)  e1000000-0000-4000-a000-000000000001
--   T2 (V2, published)  e2000000-0000-4000-a000-000000000001
--   T3 (V1, draft plan) e3000000-0000-4000-a000-000000000001
begin;
select plan(46);

-- ---------------------------------------------------------------------------
-- Fixtures (as the DB owner). Far-future months avoid clashing with seed data.
-- ---------------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   't-admin@test.local', '{"role":"admin"}', '{"full_name":"Test Admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   't-v1@test.local', '{"role":"videographer"}', '{"full_name":"Vid One"}'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   't-v2@test.local', '{"role":"videographer"}', '{"full_name":"Vid Two"}');

insert into public.clients (id, name, type) values
  ('c1000000-0000-4000-a000-000000000001', 'Test Client One', 'hospital'),
  ('c2000000-0000-4000-a000-000000000001', 'Test Client Two', 'brand');
insert into public.videographer_clients (videographer_id, client_id) values
  ('bbbbbbbb-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000001'),
  ('cccccccc-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000001');
insert into public.task_categories (id, name, default_max_points) values
  ('ca000000-0000-4000-a000-000000000001', 'Test Category', 10);

insert into public.monthly_plans (id, videographer_id, month) values
  ('d1000000-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000001', '2030-01-01'),
  ('d2000000-0000-4000-a000-000000000001', 'cccccccc-0000-4000-a000-000000000001', '2030-01-01'),
  ('d3000000-0000-4000-a000-000000000001', 'bbbbbbbb-0000-4000-a000-000000000001', '2030-02-01');

insert into public.tasks (id, plan_id, client_id, category_id, title, due_date) values
  ('e1000000-0000-4000-a000-000000000001', 'd1000000-0000-4000-a000-000000000001',
   'c1000000-0000-4000-a000-000000000001', 'ca000000-0000-4000-a000-000000000001', 'V1 task', '2030-01-20'),
  ('e2000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000001',
   'c2000000-0000-4000-a000-000000000001', 'ca000000-0000-4000-a000-000000000001', 'V2 task', '2030-01-20'),
  ('e3000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
   'c1000000-0000-4000-a000-000000000001', 'ca000000-0000-4000-a000-000000000001', 'V1 draft task', '2030-02-20');

insert into public.task_references (task_id, kind, url) values
  ('e1000000-0000-4000-a000-000000000001', 'link', 'https://example.com/ref-v1'),
  ('e2000000-0000-4000-a000-000000000001', 'link', 'https://example.com/ref-v2');

update public.monthly_plans set status = 'published'
 where id in ('d1000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000001');

-- V2 submits (via the sync service path) and the admin requests a revision.
select public.submit_task('e2000000-0000-4000-a000-000000000001', array['https://example.com/v2-cut'], 'private V2 note');
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000001","role":"authenticated"}', true);
select public.review_task('e2000000-0000-4000-a000-000000000001', 'revision_requested', null, null, 'V2-only feedback');
-- V2 assessment published, V1 assessment still a draft
select public.compute_assessment('cccccccc-0000-4000-a000-000000000001', '2030-01-01');
update public.monthly_assessments set discretionary_score = 8, admin_remarks = 'V2 private remark'
 where videographer_id = 'cccccccc-0000-4000-a000-000000000001';
select public.publish_assessment(id) from public.monthly_assessments
 where videographer_id = 'cccccccc-0000-4000-a000-000000000001';
select public.compute_assessment('bbbbbbbb-0000-4000-a000-000000000001', '2030-01-01');
select set_config('request.jwt.claims', '', true);

-- Counts rows touched by a statement, as the current role (RLS applies).
create function public.test_affected(p_sql text) returns integer
language plpgsql security invoker as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.test_affected(text) to authenticated;

-- ===========================================================================
-- As videographer V1
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-000000000001","role":"authenticated"}', true);

select is((select count(*)::int from public.tasks), 1, 'V1 sees exactly one task (their own, published)');
select is((select count(*)::int from public.tasks where id = 'e2000000-0000-4000-a000-000000000001'), 0, 'V1 cannot see V2''s task');
select is((select count(*)::int from public.tasks where id = 'e3000000-0000-4000-a000-000000000001'), 0, 'V1 cannot see tasks of a draft plan');
select is((select count(*)::int from public.monthly_plans), 1, 'V1 sees only their own published plan');
select is((select count(*)::int from public.task_references), 1, 'V1 sees only references on their own task');
select is((select count(*)::int from public.submissions), 0, 'V1 cannot see V2''s submissions');
select is((select count(*)::int from public.task_reviews), 0, 'V1 cannot see V2''s reviews/feedback');
select is((select count(*)::int from public.monthly_assessments), 0, 'V1 cannot see V2''s assessment nor their own draft');
select is((select count(*)::int from public.notifications where user_id <> 'bbbbbbbb-0000-4000-a000-000000000001'), 0, 'V1 cannot see others'' notifications');
select ok((select count(*) from public.notifications) >= 1, 'V1 sees their own notifications');
select is((select count(*)::int from public.profiles), 1, 'V1 sees only their own profile');
select is((select count(*)::int from public.clients), 1, 'V1 sees only clients assigned to them');
select is((select count(*)::int from public.videographer_clients), 1, 'V1 sees only their own client links');
select is((select count(*)::int from public.activity_log where videographer_id is distinct from 'bbbbbbbb-0000-4000-a000-000000000001'), 0, 'V1 cannot read others'' activity');
select is((select count(*)::int from public.featured_work), 0, 'featured_work is admin-only (others use get_featured_work)');
select is((select count(*)::int from public.sheet_configs), 0, 'sheet configs are admin-only');
select is((select count(*)::int from public.sync_events), 0, 'sync events are admin-only');

select is(public.test_affected($$update public.tasks set title = 'hacked' where id = 'e2000000-0000-4000-a000-000000000001'$$), 0, 'V1 cannot update V2''s task');
select is(public.test_affected($$update public.tasks set status = 'approved', points_awarded = 10 where id = 'e1000000-0000-4000-a000-000000000001'$$), 0, 'V1 cannot approve their own task directly');
select is(public.test_affected($$delete from public.tasks where id = 'e2000000-0000-4000-a000-000000000001'$$), 0, 'V1 cannot delete V2''s task');
select is(public.test_affected($$update public.monthly_assessments set discretionary_score = 10$$), 0, 'V1 cannot edit any assessment');
select is(public.test_affected($$update public.clients set name = 'hacked'$$), 0, 'V1 cannot edit clients');

select throws_ok($$insert into public.tasks (plan_id, client_id, category_id, title, due_date)
  values ('d1000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000001',
          'ca000000-0000-4000-a000-000000000001', 'self-assigned', '2030-01-25')$$,
  '42501', null, 'V1 cannot create tasks');
select throws_ok($$insert into public.submissions (task_id, version, links)
  values ('e1000000-0000-4000-a000-000000000001', 1, array['https://example.com/x'])$$,
  '42501', null, 'V1 cannot insert submissions directly (RPC only)');
select throws_ok($$insert into public.notifications (user_id, type, title)
  values ('cccccccc-0000-4000-a000-000000000001', 'x', 'spam')$$,
  '42501', null, 'V1 cannot write notifications');
select throws_ok($$select public.notify('cccccccc-0000-4000-a000-000000000001', 'x', 'spam', null, null)$$,
  '42501', null, 'internal notify() is not callable');
select throws_ok($$select public.log_activity('fake', 'task', null, null, 'forged', '{}')$$,
  '42501', null, 'internal log_activity() is not callable');
select throws_ok($$update public.profiles set role = 'admin' where id = 'bbbbbbbb-0000-4000-a000-000000000001'$$,
  '42501', null, 'V1 cannot promote themselves to admin');
select throws_ok($$update public.profiles set full_name = 'Renamed' where id = 'bbbbbbbb-0000-4000-a000-000000000001'$$,
  '42501', null, 'V1 cannot rename themselves (admin-managed field)');
select lives_ok($$update public.profiles set phone = '+91 90000 00000' where id = 'bbbbbbbb-0000-4000-a000-000000000001'$$,
  'V1 can update their own phone');

select throws_ok($$select public.submit_task('e2000000-0000-4000-a000-000000000001', array['https://evil.example/x'])$$,
  'P0002', 'Task not found', 'V1 cannot submit to V2''s task (and learns nothing about it)');
select throws_ok($$select public.submit_task('e3000000-0000-4000-a000-000000000001', array['https://example.com/x'])$$,
  'P0002', 'Task not found', 'V1 cannot submit to a draft-plan task');
select throws_ok($$select public.start_task('e2000000-0000-4000-a000-000000000001')$$,
  'P0002', 'Task not found', 'V1 cannot start V2''s task');
select throws_ok($$select public.submit_task('e1000000-0000-4000-a000-000000000001', array['https://example.com/x'], null, null, 'sheet')$$,
  '42501', null, 'V1 cannot impersonate the sheet sync');
select throws_ok($$select public.review_task('e1000000-0000-4000-a000-000000000001', 'approved', 5, 5, null)$$,
  '42501', null, 'V1 cannot review tasks');
select throws_ok($$select public.compute_assessment('bbbbbbbb-0000-4000-a000-000000000001', '2030-01-01')$$,
  '42501', null, 'V1 cannot compute assessments');
select throws_ok($$select public.set_featured_work('2030-01-01', '[]'::jsonb)$$,
  '42501', null, 'V1 cannot choose featured work');

select lives_ok($$select public.submit_task('e1000000-0000-4000-a000-000000000001', array['https://drive.google.com/file/d/abc/view'], 'done')$$,
  'V1 can submit their own task');
select is((select status from public.tasks where id = 'e1000000-0000-4000-a000-000000000001'), 'submitted'::public.task_status,
  'own task is now submitted');
select is((select count(*)::int from public.submissions), 1, 'V1 now sees exactly their own submission');
select isnt_empty($$select * from public.get_leaderboard('2030-01-01')$$, 'V1 can read the leaderboard via RPC');

-- ===========================================================================
-- As videographer V2: published assessment is visible to its owner only
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.monthly_assessments), 1, 'V2 sees their own published assessment');
select is((select count(*)::int from public.submissions where task_id = 'e1000000-0000-4000-a000-000000000001'), 0,
  'V2 cannot see V1''s submission');

-- ===========================================================================
-- As admin: sees everything
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.tasks
            where id in ('e1000000-0000-4000-a000-000000000001', 'e2000000-0000-4000-a000-000000000001', 'e3000000-0000-4000-a000-000000000001')),
  3, 'admin sees all tasks including drafts');

-- ===========================================================================
-- Anonymous: nothing
-- ===========================================================================
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.tasks$$, '42501', null, 'anon cannot read tasks');
select throws_ok($$select * from public.get_leaderboard('2030-01-01')$$, '42501', null, 'anon cannot call the leaderboard');

select * from finish();
rollback;
