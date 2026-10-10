-- Security hardening.
--
-- 1. Signed-out visitors (anon) may call only the four functions built for them;
--    everything else in public (helpers, triggers, score calculators) is closed to them,
--    and new functions start closed too.
-- 2. Submission links must be http(s) in the database itself, not only in the app.
-- 3. A per-user rate limiter the Edge Functions use.

-- 1. anon function access ------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.prorettype = 'trigger'::regtype as is_trigger
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       and p.proname not in ('get_client_review', 'submit_client_review', 'my_access', 'signup_requests_open')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    if not f.is_trigger then
      execute format('grant execute on function %s to authenticated, service_role', f.sig);
    end if;
  end loop;
end;
$$;

-- (PUBLIC's EXECUTE default is global, so it's revoked globally; anon's is per schema)
alter default privileges revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- 2. links ---------------------------------------------------------------------------
create or replace function public.all_http_urls(p_links text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(bool_and(l ~* '^https?://[^[:space:]]+$' and char_length(l) <= 2048), true)
  from unnest(p_links) as l;
$$;
revoke execute on function public.all_http_urls(text[]) from public, anon;
grant execute on function public.all_http_urls(text[]) to authenticated, service_role;

alter table public.submissions
  add constraint submissions_links_http check (public.all_http_urls(links));

-- 3. rate limiting -------------------------------------------------------------------
create table public.rate_limit_hits (
  user_id uuid not null references auth.users (id) on delete cascade,
  bucket  text not null check (char_length(bucket) <= 40),
  hit_at  timestamptz not null default now()
);
create index rate_limit_hits_idx on public.rate_limit_hits (user_id, bucket, hit_at);
alter table public.rate_limit_hits enable row level security; -- no policies: only the function below touches it
revoke all on public.rate_limit_hits from anon, authenticated;

-- true = go ahead (and the call is counted); false = over the limit for this window
create or replace function public.hit_rate_limit(p_bucket text, p_max integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_n   integer;
begin
  if v_uid is null then
    return false;
  end if;
  if p_max not between 1 and 1000 or p_window_seconds not between 1 and 86400 or char_length(p_bucket) not between 1 and 40 then
    raise exception 'Invalid rate limit' using errcode = '22023';
  end if;
  delete from public.rate_limit_hits
   where user_id = v_uid and bucket = p_bucket and hit_at < now() - make_interval(secs => p_window_seconds);
  select count(*) into v_n from public.rate_limit_hits where user_id = v_uid and bucket = p_bucket;
  if v_n >= p_max then
    return false;
  end if;
  insert into public.rate_limit_hits (user_id, bucket) values (v_uid, p_bucket);
  return true;
end;
$$;
revoke execute on function public.hit_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.hit_rate_limit(text, integer, integer) to authenticated, service_role;
