-- Expansion: sign-up allow-list hook, reviewer role, review comments, client approval
-- links, leave, equipment, peer voting, badges, shoot dates.
begin;
select plan(49);

-- Fixtures ---------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000008', 'authenticated', 'authenticated',
   'x-admin@test.local', now(), '{"role":"admin"}', '{"full_name":"X Admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'dddddddd-0000-4000-a000-000000000008', 'authenticated', 'authenticated',
   'x-reviewer@test.local', now(), '{"role":"reviewer"}', '{"full_name":"X Reviewer"}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-000000000008', 'authenticated', 'authenticated',
   'x-v1@test.local', now(), '{"role":"videographer"}', '{"full_name":"X Vid One"}'),
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-4000-a000-000000000008', 'authenticated', 'authenticated',
   'x-v2@test.local', now(), '{"role":"videographer"}', '{"full_name":"X Vid Two"}');
insert into public.clients (id, name) values ('c1000000-0000-4000-a000-000000000008', 'X Client');
insert into public.task_categories (id, name, default_max_points) values ('ca000000-0000-4000-a000-000000000008', 'X Category', 10);
insert into public.monthly_plans (id, videographer_id, month) values
  ('d1000000-0000-4000-a000-000000000008', 'bbbbbbbb-0000-4000-a000-000000000008', public.month_start(public.today_ist())),
  ('d2000000-0000-4000-a000-000000000008', 'cccccccc-0000-4000-a000-000000000008', public.month_start(public.today_ist()));
insert into public.tasks (id, plan_id, client_id, category_id, title, due_date) values
  ('e1000000-0000-4000-a000-000000000008', 'd1000000-0000-4000-a000-000000000008', 'c1000000-0000-4000-a000-000000000008',
   'ca000000-0000-4000-a000-000000000008', 'X V1 task', public.month_start(public.today_ist()) + 20),
  ('e2000000-0000-4000-a000-000000000008', 'd2000000-0000-4000-a000-000000000008', 'c1000000-0000-4000-a000-000000000008',
   'ca000000-0000-4000-a000-000000000008', 'X V2 task', public.month_start(public.today_ist()) + 20);
update public.monthly_plans set status = 'published' where id in ('d1000000-0000-4000-a000-000000000008', 'd2000000-0000-4000-a000-000000000008');
select public.submit_task('e1000000-0000-4000-a000-000000000008', array['https://www.youtube.com/watch?v=aqz-KE-bpKQ']);

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
-- Sign-up gate (Before User Created hook) and allow-list
-- ===========================================================================
select ok(public.hook_before_user_created('{"user":{"email":"stranger@gmail.com"}}') ? 'error',
  'hook rejects an email that is not on the team');
select is(public.hook_before_user_created('{"user":{"email":"CaseCode01@gmail.com"}}'), '{}'::jsonb,
  'hook allows the admin address (case-insensitive)');
insert into public.allowed_emails (email, full_name, phone, client_ids) values
  ('new.crew@test.local', 'New Crew Member', '+91 90000 11111', array['c1000000-0000-4000-a000-000000000008'::uuid]);
insert into public.allowed_emails (email, role) values ('new.reviewer@test.local', 'reviewer'), ('late.reviewer@test.local', 'reviewer');
select is(public.hook_before_user_created('{"user":{"email":"new.crew@test.local"}}'), '{}'::jsonb,
  'hook allows an allow-listed email');

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-0000-4000-a000-000000000001', 'authenticated', 'authenticated',
   'new.crew@test.local', now(), '{"name":"Google Name","picture":"https://lh3.googleusercontent.com/p"}'),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-0000-4000-a000-000000000002', 'authenticated', 'authenticated',
   'new.reviewer@test.local', now(), '{}'),
  ('00000000-0000-0000-0000-000000000000', 'eeeeeeee-0000-4000-a000-000000000003', 'authenticated', 'authenticated',
   'late.reviewer@test.local', null, '{}');
select results_eq(
  $$select role::text, full_name, phone, avatar_url is not null from public.profiles where id = 'eeeeeeee-0000-4000-a000-000000000001'$$,
  $$values ('videographer', 'New Crew Member', '+91 90000 11111', true)$$,
  'allow-listed sign-in gets the admin''s name/phone, Google photo, crew role');
select is((select count(*)::int from public.videographer_clients where videographer_id = 'eeeeeeee-0000-4000-a000-000000000001'), 1,
  'allow-listed clients are assigned on first sign-in');
select isnt((select claimed_at from public.allowed_emails where email = 'new.crew@test.local'), null, 'allow-list entry is marked claimed');
select is((select role::text from public.profiles where id = 'eeeeeeee-0000-4000-a000-000000000002'), 'reviewer', 'verified reviewer address becomes reviewer');
select is((select role::text from public.profiles where id = 'eeeeeeee-0000-4000-a000-000000000003'), 'videographer', 'unverified reviewer address starts as videographer');
update auth.users set email_confirmed_at = now() where id = 'eeeeeeee-0000-4000-a000-000000000003';
select is((select role::text from public.profiles where id = 'eeeeeeee-0000-4000-a000-000000000003'), 'reviewer', '… and becomes reviewer once confirmed');

-- notification dispatch secret: generated in the database, checkable only by the service role
select ok(exists (select 1 from vault.secrets where name = 'notify_dispatch_secret'), 'dispatch secret is generated by the migration');
select ok(not has_function_privilege('authenticated', 'public.check_dispatch_secret(text)', 'execute'), 'signed-in users cannot probe the dispatch secret');

-- shoot date sanity
select throws_ok($$update public.tasks set shoot_date = '2001-01-01' where id = 'e1000000-0000-4000-a000-000000000008'$$,
  '23514', null, 'shoot date far outside the plan month is rejected');

-- ===========================================================================
-- Reviewer
-- ===========================================================================
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"dddddddd-0000-4000-a000-000000000008","role":"authenticated"}', true);
select is((select count(*)::int from public.tasks where id::text like 'e_000000-0000-4000-a000-000000000008'), 2, 'reviewer sees every videographer''s tasks');
select is((select count(*)::int from public.submissions where task_id = 'e1000000-0000-4000-a000-000000000008'), 1, 'reviewer sees submissions');
select is(public.test_affected($$update public.tasks set title = 'x' where id = 'e2000000-0000-4000-a000-000000000008'$$), 0, 'reviewer cannot edit tasks directly');
select is((select count(*)::int from public.monthly_assessments), 0, 'reviewer cannot read assessments');
select throws_ok($$select public.compute_assessment('bbbbbbbb-0000-4000-a000-000000000008', public.month_start(public.today_ist()))$$,
  '42501', null, 'reviewer cannot compute assessments');
select throws_ok($$insert into public.allowed_emails (email) values ('sneaky@test.local')$$, '42501', null, 'reviewer cannot add people');
select lives_ok($$select public.review_task('e1000000-0000-4000-a000-000000000008', 'approved', 9, 5, 'Lovely')$$, 'reviewer can approve submitted work');
select is((select status::text from public.tasks where id = 'e1000000-0000-4000-a000-000000000008'), 'approved', 'task is approved by the reviewer');

-- ===========================================================================
-- Review comments
-- ===========================================================================
select lives_ok($$insert into public.review_comments (task_id, author_id, at_seconds, body)
  values ('e1000000-0000-4000-a000-000000000008', 'dddddddd-0000-4000-a000-000000000008', 42, 'Logo missing here')$$,
  'staff can leave a timestamped comment');

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-a000-000000000008","role":"authenticated"}', true);
select is((select count(*)::int from public.review_comments), 0, 'another videographer cannot read the comments');
select throws_ok($$insert into public.review_comments (task_id, author_id, body)
  values ('e1000000-0000-4000-a000-000000000008', 'cccccccc-0000-4000-a000-000000000008', 'drive-by')$$,
  '42501', null, 'another videographer cannot comment on the task');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-000000000008","role":"authenticated"}', true);
select is((select body from public.review_comments where task_id = 'e1000000-0000-4000-a000-000000000008'), 'Logo missing here', 'owner reads the comment');
select ok(exists (select 1 from public.notifications where type = 'comment' and body like 'at 0:42%'), 'owner was notified with the timecode');
select lives_ok($$insert into public.review_comments (task_id, author_id, body)
  values ('e1000000-0000-4000-a000-000000000008', 'bbbbbbbb-0000-4000-a000-000000000008', 'Fixed in v2')$$, 'owner can reply');
select lives_ok($$select public.set_comment_resolved(id, true) from public.review_comments where at_seconds = 42$$, 'owner can resolve a comment');

-- ===========================================================================
-- Leave
-- ===========================================================================
select lives_ok($$insert into public.leave_requests (videographer_id, start_date, end_date, reason)
  values ('bbbbbbbb-0000-4000-a000-000000000008', public.today_ist() + 3, public.today_ist() + 4, 'Family function')$$,
  'videographer requests leave');
select throws_ok($$insert into public.leave_requests (videographer_id, start_date, end_date, status)
  values ('bbbbbbbb-0000-4000-a000-000000000008', public.today_ist() + 9, public.today_ist() + 9, 'approved')$$,
  '42501', null, 'videographer cannot self-approve leave');
select throws_ok($$select public.decide_leave(id, 'approved') from public.leave_requests$$, '42501', null, 'videographer cannot decide leave');

select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-a000-000000000008","role":"authenticated"}', true);
select is((select count(*)::int from public.leave_requests), 0, 'another videographer cannot see the leave request');

-- ===========================================================================
-- Admin: leave decision, equipment, client links
-- ===========================================================================
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000008","role":"authenticated"}', true);
select is((select (public.decide_leave(id, 'approved', 'Enjoy')).status from public.leave_requests
            where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000008'), 'approved', 'admin approves leave');

insert into public.equipment (id, name, category) values ('f1000000-0000-4000-a000-000000000008', 'Sony FX3 #1', 'camera');
select lives_ok($$select public.checkout_equipment('f1000000-0000-4000-a000-000000000008', 'bbbbbbbb-0000-4000-a000-000000000008', public.today_ist() + 7)$$,
  'admin checks a camera out');
select throws_ok($$select public.checkout_equipment('f1000000-0000-4000-a000-000000000008', 'cccccccc-0000-4000-a000-000000000008')$$,
  '22023', null, 'a checked-out item cannot be checked out again');

insert into public.client_review_links (id, task_id, created_by, client_contact)
values ('fa000000-0000-4000-a000-000000000008', 'e1000000-0000-4000-a000-000000000008', 'aaaaaaaa-0000-4000-a000-000000000008', 'Dr. Iyer');

select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-000000000008","role":"authenticated"}', true);
select is((select count(*)::int from public.equipment), 1, 'holder sees their gear');
select is(public.test_affected($$update public.equipment set name = 'mine now'$$), 0, 'holder cannot edit equipment');
select ok(exists (select 1 from public.notifications where type = 'leave_decision'), 'videographer was told about the leave decision');
select is((select count(*)::int from public.client_review_links), 0, 'videographers cannot see client links');

-- ===========================================================================
-- Client approval (anonymous)
-- ===========================================================================
reset role;
select set_config('test.token', token, true) from public.client_review_links where id = 'fa000000-0000-4000-a000-000000000008';
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select is(public.get_client_review('nope') ->> 'state', 'invalid', 'a bad token reveals nothing');
select is(public.get_client_review(current_setting('test.token')) ->> 'state', 'open', 'client opens the link without an account');
select is(public.get_client_review(current_setting('test.token')) ->> 'title', 'X V1 task', 'client sees the deliverable title');
select is(public.submit_client_review(current_setting('test.token'), 'approved', 5, 'Perfect', 'Dr. Iyer') ->> 'state', 'responded',
  'client approves with a rating');
select throws_ok(format($$select public.submit_client_review(%L, 'changes', 2, 'actually no')$$, current_setting('test.token')),
  '22023', null, 'a link can only be answered once');
select throws_ok($$select * from public.client_review_links$$, '42501', null, 'anon cannot read the links table');

-- ===========================================================================
-- Voting, badges, ratings
-- ===========================================================================
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-a000-000000000008","role":"authenticated"}', true);
select lives_ok($$select public.cast_vote(public.today_ist(), 'e1000000-0000-4000-a000-000000000008')$$, 'crew can vote for someone else''s approved work');
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-000000000008","role":"authenticated"}', true);
select throws_ok($$select public.cast_vote(public.today_ist(), 'e1000000-0000-4000-a000-000000000008')$$, '22023', null, 'nobody can vote for their own work');
select results_eq(
  $$select votes, is_mine from public.get_vote_candidates(public.today_ist()) where task_id = 'e1000000-0000-4000-a000-000000000008'$$,
  $$values (1, true)$$, 'vote counts are visible');
select is((public.get_badges('bbbbbbbb-0000-4000-a000-000000000008') ->> 'five_star')::int, 1, 'a 5-star approval counts toward badges');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000008","role":"authenticated"}', true);
select results_eq(
  $$select reviews, avg_rating from public.get_client_ratings(public.today_ist()) where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000008'$$,
  $$values (1, 5.00::numeric)$$, 'client ratings roll up per videographer for the assessment');

select * from finish();
rollback;
