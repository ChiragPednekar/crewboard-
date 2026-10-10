-- Company-only access (the default): strangers can't create accounts at all; the
-- allow-list, admin emails and the company's own Google domain can.
begin;
select plan(12);

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-4000-a000-00000000000b', 'authenticated', 'authenticated',
   'ca-admin@test.local', now(), '{"role":"admin"}', '{"full_name":"Access Admin"}');
update public.profiles set role = 'admin' where id = 'aaaaaaaa-0000-4000-a000-00000000000b';

select is((select signup_mode from public.app_settings where id), 'invite_only', 'new studios start invite-only');
select is(public.signup_requests_open(), false, 'so the login page offers no sign-up');

-- strangers are turned away, with or without Google ---------------------------------
select is(public.hook_before_user_created('{"user":{"email":"random@gmail.com","app_metadata":{"provider":"google"}}}'::jsonb) -> 'error' ->> 'http_code',
  '403', 'a random Google account cannot sign up');
select matches(public.hook_before_user_created('{"user":{"email":"random@gmail.com","app_metadata":{"provider":"google"}}}'::jsonb) -> 'error' ->> 'message',
  'Ask your studio admin', 'and is told who to ask');
select is(public.hook_before_user_created('{"user":{"email":"CaseCode01@gmail.com","app_metadata":{"provider":"google"}}}'::jsonb),
  '{}'::jsonb, 'the admin email still gets in');

-- company domain -------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"aaaaaaaa-0000-4000-a000-00000000000b","role":"authenticated"}', true);
select throws_ok($$update public.app_settings set company_domains = '{gmail.com}' where id$$, '22023', null,
  'a public email service cannot be the company domain');
select throws_ok($$update public.app_settings set company_domains = '{"not a domain"}' where id$$, '22023', null,
  'nor can nonsense');
update public.app_settings set company_domains = '{" @SunriseStudio.in ", sunrisestudio.in}' where id;
select is((select company_domains from public.app_settings where id), '{sunrisestudio.in}'::text[], 'domains are cleaned up and de-duplicated');
reset role;

select is(public.hook_before_user_created('{"user":{"email":"Meera@SunriseStudio.in","app_metadata":{"provider":"google"}}}'::jsonb),
  '{}'::jsonb, 'a Google account on the company domain may sign up');
select is(public.hook_before_user_created('{"user":{"email":"meera@sunrisestudio.in","app_metadata":{"provider":"email"}}}'::jsonb) -> 'error' ->> 'http_code',
  '403', 'but email/password sign-up still needs an invite');

insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data) values
  ('00000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-4000-a000-00000000000b', 'authenticated', 'authenticated',
   'meera@sunrisestudio.in', now(), '{"provider":"google"}', '{"full_name":"Meera Joshi"}');
select is((select approval_status || '/' || role::text || '/' || is_active::text from public.profiles where id = 'bbbbbbbb-0000-4000-a000-00000000000b'),
  'approved/videographer/true', 'and joins straight away as crew');
select ok(not exists (select 1 from public.notifications where user_id = 'aaaaaaaa-0000-4000-a000-00000000000b' and type = 'signup_request'),
  'without a request for the admin to handle');

select * from finish();
rollback;
