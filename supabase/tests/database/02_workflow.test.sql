-- Workflow rules: status machine, submissions, reviews, punctuality,
-- assessment publish/lock/unlock, featured work.
begin;
select plan(39);

-- Fixtures --------------------------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000002', 'authenticated', 'authenticated',
   'w-admin@test.local', '{"role":"admin"}', '{"full_name":"Workflow Admin"}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-000000000002', 'authenticated', 'authenticated',
   'w-v1@test.local', '{"role":"videographer"}', '{"full_name":"Workflow Vid"}');
insert into public.clients (id, name) values ('c1000000-0000-4000-a000-000000000002', 'Workflow Client');
insert into public.task_categories (id, name, default_max_points) values
  ('ca000000-0000-4000-a000-000000000002', 'Workflow Category', 20);
insert into public.monthly_plans (id, videographer_id, month) values
  ('d1000000-0000-4000-a000-000000000002', 'bbbbbbbb-0000-4000-a000-000000000002', '2031-03-01');
-- A: on-time path, B: late path, C: to be cancelled
insert into public.tasks (id, plan_id, client_id, category_id, title, due_date) values
  ('ea000000-0000-4000-a000-000000000002', 'd1000000-0000-4000-a000-000000000002',
   'c1000000-0000-4000-a000-000000000002', 'ca000000-0000-4000-a000-000000000002', 'Task A', '2031-03-10'),
  ('eb000000-0000-4000-a000-000000000002', 'd1000000-0000-4000-a000-000000000002',
   'c1000000-0000-4000-a000-000000000002', 'ca000000-0000-4000-a000-000000000002', 'Task B', '2031-03-12'),
  ('ec000000-0000-4000-a000-000000000002', 'd1000000-0000-4000-a000-000000000002',
   'c1000000-0000-4000-a000-000000000002', 'ca000000-0000-4000-a000-000000000002', 'Task C', '2031-03-15');

select is((select max_points from public.tasks where id = 'ea000000-0000-4000-a000-000000000002'), 20,
  'max_points defaults from the category');
select is((select month from public.tasks where id = 'ea000000-0000-4000-a000-000000000002'), '2031-03-01'::date,
  'task month is copied from its plan');

-- Transition table (pure function) ---------------------------------------------
select ok(public.task_transition_allowed('assigned', 'in_progress', false), 'videographer: assigned → in progress');
select ok(public.task_transition_allowed('revision_requested', 'submitted', false), 'videographer: revision → submitted');
select ok(not public.task_transition_allowed('submitted', 'approved', false), 'videographer cannot approve');
select ok(not public.task_transition_allowed('assigned', 'approved', true), 'even admin cannot approve unsubmitted work');
select ok(public.task_transition_allowed('approved', 'revision_requested', true), 'admin can reopen approved work');
select ok(not public.task_transition_allowed('cancelled', 'submitted', true), 'cancelled tasks only restore to assigned');

update public.monthly_plans set status = 'published' where id = 'd1000000-0000-4000-a000-000000000002';

-- Videographer flow -------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-000000000002","role":"authenticated"}', true);

select is((public.start_task('ea000000-0000-4000-a000-000000000002')).status, 'in_progress'::public.task_status,
  'start_task moves to in progress');
select throws_ok($$select public.submit_task('ea000000-0000-4000-a000-000000000002', array['   ', ''])$$,
  '22023', 'Add at least one deliverable link', 'blank links are rejected');
select throws_ok($$select public.submit_task('ea000000-0000-4000-a000-000000000002', array['ftp://nope'])$$,
  '23514', null, 'non-http links are rejected');
select throws_ok($$select public.submit_task('ea000000-0000-4000-a000-000000000002',
    array['https://a.example/1','https://a.example/2','https://a.example/3','https://a.example/4','https://a.example/5','https://a.example/6'])$$,
  '22023', 'You can submit at most 5 links', 'more than 5 links are rejected');
select is((public.submit_task('ea000000-0000-4000-a000-000000000002', array['https://youtu.be/abc'], 'v1')).version, 1,
  'first submission is version 1');
select is((public.submit_task('ea000000-0000-4000-a000-000000000002', array['https://youtu.be/def'], 'v2')).version, 2,
  'resubmitting keeps history as version 2');
select isnt((select first_submitted_at from public.tasks where id = 'ea000000-0000-4000-a000-000000000002'), null,
  'first submission time is recorded on the task (used for punctuality)');
select is((select videographer_notes from public.tasks where id = 'ea000000-0000-4000-a000-000000000002'), 'v2',
  'latest submission notes become the task notes');

-- Admin review -------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.review_task('ea000000-0000-4000-a000-000000000002', 'approved', 21, 4, null)$$,
  '22023', 'Points must be between 0 and 20', 'points above max are rejected');
select throws_ok($$select public.review_task('ea000000-0000-4000-a000-000000000002', 'approved', 15, 6, null)$$,
  '22023', null, 'rating outside 1–5 is rejected');
select throws_ok($$select public.review_task('ea000000-0000-4000-a000-000000000002', 'revision_requested', null, null, '  ')$$,
  '22023', 'Tell the videographer what needs to change', 'revision needs feedback');
select throws_ok($$select public.review_task('eb000000-0000-4000-a000-000000000002', 'approved', 10, 4, null)$$,
  '22023', 'Only submitted work can be approved', 'cannot approve work that was never submitted');

select lives_ok($$select public.review_task('ea000000-0000-4000-a000-000000000002', 'revision_requested', null, null, 'Fix the audio')$$,
  'admin requests a revision');
select is((select status from public.tasks where id = 'ea000000-0000-4000-a000-000000000002'), 'revision_requested'::public.task_status,
  'task is now revision requested');
select is((select count(*)::int from public.notifications
            where user_id = 'bbbbbbbb-0000-4000-a000-000000000002' and type = 'revision_requested'), 0,
  'admin cannot read the videographer''s notification (RLS) …');

-- back as videographer: sees feedback + notification, resubmits
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.notifications where type = 'revision_requested'), 1,
  '… but the videographer got it');
select is((select feedback from public.task_reviews where task_id = 'ea000000-0000-4000-a000-000000000002'), 'Fix the audio',
  'videographer can read feedback on their task');
select lives_ok($$select public.submit_task('ea000000-0000-4000-a000-000000000002', array['https://youtu.be/fixed'])$$,
  'videographer resubmits after revision');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000002","role":"authenticated"}', true);
select lives_ok($$select public.review_task('ea000000-0000-4000-a000-000000000002', 'approved', 18, 5, 'Great')$$,
  'admin approves with points');
select is((select points_awarded from public.tasks where id = 'ea000000-0000-4000-a000-000000000002'), 18,
  'points recorded on the task');

-- Task B is submitted late (as the sync service, backdated past the IST deadline)
reset role;
select set_config('request.jwt.claims', '', true);
select is((public.submit_task('eb000000-0000-4000-a000-000000000002', array['https://vimeo.com/1'], null, null, 'sheet',
            '2031-03-12 18:31:00+00'::timestamptz)).is_on_time, false,
  'submitted 00:01 IST the day after the due date → late');
select is((select s.source from public.submissions s where s.task_id = 'eb000000-0000-4000-a000-000000000002'), 'sheet'::public.submission_source,
  'sheet submissions are tagged with their source');
select is((select is_on_time from public.submissions where task_id = 'ea000000-0000-4000-a000-000000000002' and version = 1), true,
  'submission before the deadline is on time');

-- Featured work + assessment lock ----------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.set_featured_work('2031-03-01', '[{"task_id":"eb000000-0000-4000-a000-000000000002","rank":1}]'::jsonb)$$,
  '23514', null, 'only approved tasks can be featured');
select lives_ok($$select public.cancel_task('ec000000-0000-4000-a000-000000000002', 'Client postponed')$$, 'admin cancels a task');

select public.compute_assessment('bbbbbbbb-0000-4000-a000-000000000002', '2031-03-01');
select throws_ok($$select public.publish_assessment(id) from public.monthly_assessments
                    where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000002'$$,
  '22023', 'Add the discretionary score (0–10) before publishing', 'publishing requires the discretionary score');
update public.monthly_assessments set discretionary_score = 7 where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000002';
select is((select (public.publish_assessment(id)).is_locked from public.monthly_assessments
            where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000002'), true,
  'publishing locks the assessment');
-- metrics: 2 counted tasks (C cancelled), A approved, both submitted, A on time
select results_eq(
  $$select assigned_count, approved_count, submitted_count, on_time_count, points_awarded_sum, max_points_sum
      from public.monthly_assessments where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000002'$$,
  $$values (2, 1, 2, 1, 18, 40)$$,
  'assessment metrics exclude cancelled tasks and use first-submission punctuality');
select throws_ok($$update public.monthly_assessments set discretionary_score = 10
                    where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000002'$$,
  '55000', null, 'a locked assessment cannot be edited');
select throws_ok($$select public.review_task('eb000000-0000-4000-a000-000000000002', 'approved', 5, 3, null)$$,
  '55000', null, 'tasks in a locked month cannot be reviewed');
select throws_ok($$select public.unlock_assessment(id, 'no') from public.monthly_assessments
                    where videographer_id = 'bbbbbbbb-0000-4000-a000-000000000002'$$,
  '22023', null, 'unlocking needs a real reason');

select * from finish();
rollback;
