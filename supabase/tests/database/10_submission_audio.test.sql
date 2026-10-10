-- Audio on submissions: an audio file can stand in for links, paths must belong to the
-- task, and only the task's owner (or an admin) can upload into submission-audio.
begin;
select plan(9);

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-00000000000a', 'authenticated', 'authenticated',
   'a-v1@test.local', '{"role":"videographer"}', '{"full_name":"Audio Vid"}'),
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-00000000010a', 'authenticated', 'authenticated',
   'a-v2@test.local', '{"role":"videographer"}', '{"full_name":"Other Vid"}');
insert into public.clients (id, name) values ('c1000000-0000-4000-a000-00000000000a', 'Audio Client');
insert into public.task_categories (id, name) values ('ca000000-0000-4000-a000-00000000000a', 'Audio Category');
insert into public.monthly_plans (id, videographer_id, month, status) values
  ('d1000000-0000-4000-a000-00000000000a', 'bbbbbbbb-0000-4000-a000-00000000000a', '2035-02-01', 'draft');
insert into public.tasks (id, plan_id, client_id, category_id, title, due_date) values
  ('e1000000-0000-4000-a000-00000000000a', 'd1000000-0000-4000-a000-00000000000a', 'c1000000-0000-4000-a000-00000000000a', 'ca000000-0000-4000-a000-00000000000a', 'Voice-over', '2035-02-10'),
  ('e2000000-0000-4000-a000-00000000000a', 'd1000000-0000-4000-a000-00000000000a', 'c1000000-0000-4000-a000-00000000000a', 'ca000000-0000-4000-a000-00000000000a', 'Film with music', '2035-02-12');
update public.monthly_plans set status = 'published' where id = 'd1000000-0000-4000-a000-00000000000a';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-00000000000a","role":"authenticated"}', true);

-- storage: owner may upload into their own open task's folder ----------------------
select lives_ok($$insert into storage.objects (bucket_id, name) values ('submission-audio', 'e1000000-0000-4000-a000-00000000000a/vo.mp3')$$,
  'the owner can upload audio for their task');

-- audio alone is enough ------------------------------------------------------------
select lives_ok($$select public.submit_task('e1000000-0000-4000-a000-00000000000a', '{}', null, null, 'app', null,
                    'e1000000-0000-4000-a000-00000000000a/vo.mp3', '  Final VO.mp3 ')$$,
  'an audio file can be submitted without a link');
select results_eq($$select audio_path, audio_name, cardinality(links) from public.submissions where task_id = 'e1000000-0000-4000-a000-00000000000a'$$,
  $$values ('e1000000-0000-4000-a000-00000000000a/vo.mp3'::text, 'Final VO.mp3'::text, 0)$$,
  'the audio path and trimmed file name are stored');
select is((select status::text from public.tasks where id = 'e1000000-0000-4000-a000-00000000000a'), 'submitted',
  'and the task is handed in');

-- links + audio together; a path from another task is refused ----------------------
select throws_ok($$select public.submit_task('e2000000-0000-4000-a000-00000000000a', '{https://youtu.be/x}', null, null, 'app', null,
                    'e1000000-0000-4000-a000-00000000000a/vo.mp3', 'vo.mp3')$$,
  '22023', 'Invalid audio path', 'audio must live under its own task');
select lives_ok($$select public.submit_task('e2000000-0000-4000-a000-00000000000a', '{https://youtu.be/x}', null, null, 'app', null,
                    'e2000000-0000-4000-a000-00000000000a/music.mp3', 'music.mp3')$$,
  'links and audio can go together');
select is((select audio_name from public.submissions where task_id = 'e2000000-0000-4000-a000-00000000000a'), 'music.mp3',
  'with its name');

-- another videographer can neither upload into nor read this task's audio -----------
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-00000000010a","role":"authenticated"}', true);
select throws_ok($$insert into storage.objects (bucket_id, name) values ('submission-audio', 'e2000000-0000-4000-a000-00000000000a/sneaky.mp3')$$,
  '42501', null, 'someone else cannot upload into the task');
select is((select count(*)::int from storage.objects where bucket_id = 'submission-audio'), 0,
  'and cannot see its audio');

select * from finish();
rollback;
