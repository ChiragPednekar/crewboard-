-- Self sign-up: Google accounts that aren't on the allow-list wait for approval with no
-- database access; email sign-ups stay invite-only; only admins approve or decline.
begin;
select plan(20);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-a000-000000000009', 'authenticated', 'authenticated',
   'su-admin@test.local', now(), '{"role":"admin"}', '{"full_name":"Signup Admin"}');
update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-4000-a000-000000000009';

-- the gate on creating accounts ---------------------------------------------------
select is(public.hook_before_user_created('{"user":{"email":"stranger@gmail.com","app_metadata":{"provider":"google"}}}'::jsonb),
  '{}'::jsonb, 'anyone may sign up with Google');
select is(public.hook_before_user_created('{"user":{"email":"stranger@gmail.com","app_metadata":{"provider":"email"}}}'::jsonb) -> 'error' ->> 'http_code',
  '403', 'email sign-up without an invite is refused');
insert into public.allowed_emails (email, full_name) values ('listed@test.local', 'Listed Person');
select is(public.hook_before_user_created('{"user":{"email":"Listed@test.local","app_metadata":{"provider":"email"}}}'::jsonb),
  '{}'::jsonb, 'allow-listed addresses may use email sign-up');

-- a stranger signs up with Google ---------------------------------------------------
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-000000000009', 'authenticated', 'authenticated',
   'stranger@gmail.com', now(), '{"provider":"google","providers":["google"]}', '{"full_name":"New Stranger","picture":"https://lh3.example/a.png"}');
select is((select approval_status from public.profiles where id = 'bbbbbbbb-0000-4000-a000-000000000009'), 'pending', 'their account waits for approval');
select is((select is_active from public.profiles where id = 'bbbbbbbb-0000-4000-a000-000000000009'), false, 'and is inactive');
select is((select role::text from public.profiles where id = 'bbbbbbbb-0000-4000-a000-000000000009'), 'videographer', 'as a videographer');
select ok(exists (select 1 from public.notifications where user_id = 'aaaaaaaa-0000-4000-a000-000000000009' and type = 'signup_request'),
  'admins are told about the request');

-- an allow-listed person is approved straight away
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'cccccccc-0000-4000-a000-000000000009', 'authenticated', 'authenticated',
   'listed@test.local', now(), '{"provider":"google"}', '{"full_name":"Listed Person"}');
select is((select approval_status from public.profiles where id = 'cccccccc-0000-4000-a000-000000000009'), 'approved', 'allow-listed sign-ups skip the queue');

-- sessions -------------------------------------------------------------------------
select is(public.custom_access_token_hook('{"user_id":"bbbbbbbb-0000-4000-a000-000000000009","claims":{"role":"authenticated","sub":"bbbbbbbb-0000-4000-a000-000000000009"}}'::jsonb) -> 'claims' ->> 'role',
  'anon', 'a pending session gets no database role');
select is(public.custom_access_token_hook('{"user_id":"cccccccc-0000-4000-a000-000000000009","claims":{"role":"authenticated","sub":"cccccccc-0000-4000-a000-000000000009"}}'::jsonb) -> 'claims' ->> 'role',
  'authenticated', 'an approved session is untouched');

set local role anon;
select set_config('request.jwt.claims', '{"sub":"bbbbbbbb-0000-4000-a000-000000000009","role":"anon"}', true);
select is(public.my_access() ->> 'status', 'pending', 'the waiting screen can read its own status');
select throws_ok($$select count(*) from public.profiles$$, '42501', null, 'but nothing else');
select throws_ok($$select public.decide_signup('bbbbbbbb-0000-4000-a000-000000000009', true)$$, '42501', null, 'and cannot approve itself');

-- deciding -------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"cccccccc-0000-4000-a000-000000000009","role":"authenticated"}', true);
select throws_ok($$select public.decide_signup('bbbbbbbb-0000-4000-a000-000000000009', true)$$, '42501', null, 'crew cannot approve sign-ups');
select ok(not exists (select 1 from public.profiles where id = 'bbbbbbbb-0000-4000-a000-000000000009'), 'crew cannot even see pending people');

select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-000000000009","role":"authenticated"}', true);
select is((public.decide_signup('bbbbbbbb-0000-4000-a000-000000000009', false)).approval_status, 'declined', 'an admin can decline');
select is((public.decide_signup('bbbbbbbb-0000-4000-a000-000000000009', true, 'reviewer')).approval_status, 'approved', 'and approve after all');
select is((select role::text || '/' || is_active::text from public.profiles where id = 'bbbbbbbb-0000-4000-a000-000000000009'), 'reviewer/true',
  'with the role the admin chose, and active');
select throws_ok($$select public.decide_signup('bbbbbbbb-0000-4000-a000-000000000009', true)$$, '22023', null, 'approving twice explains itself');
reset role;
select ok(exists (select 1 from public.notifications where user_id = 'bbbbbbbb-0000-4000-a000-000000000009' and type = 'signup_approved'),
  'they are welcomed');

select * from finish();
rollback;
