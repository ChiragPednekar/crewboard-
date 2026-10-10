-- Company-only access.
--
-- By default CrewBoard is invite-only again: an account can be created only by someone
-- the studio has listed (admin emails, the allow-list, an admin invite) or, if the admin
-- sets one, anyone signing in with Google on the company's own email domain. Everyone
-- else is turned away at sign-up, so strangers can't flood the admin with requests.
-- Open sign-up requests (anyone with Google waits for approval) stay available as an
-- opt-in setting.

alter table public.app_settings
  add column signup_mode text not null default 'invite_only'
    check (signup_mode in ('invite_only', 'requests')),
  add column company_domains text[] not null default '{}';

-- Webmail domains would let anyone in, so they can't be a company domain.
create or replace function public.is_public_email_domain(p_domain text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(p_domain) = any (array[
    'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.in', 'yahoo.co.in', 'ymail.com', 'rocketmail.com',
    'outlook.com', 'outlook.in', 'hotmail.com', 'hotmail.co.in', 'live.com', 'live.in', 'msn.com',
    'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
    'zoho.com', 'zohomail.in', 'rediffmail.com', 'gmx.com', 'gmx.net', 'mail.com', 'yandex.com', 'tutanota.com'
  ]);
$$;

-- Normalise and check the company domains whenever settings change.
create or replace function public.app_settings_access_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  d text;
  v_clean text[] := '{}';
begin
  foreach d in array coalesce(new.company_domains, '{}') loop
    d := lower(btrim(regexp_replace(d, '^.*@', '')));
    continue when d = '';
    if d !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$' then
      raise exception '"%" isn''t a valid email domain', d using errcode = '22023';
    end if;
    if public.is_public_email_domain(d) then
      raise exception '% is a public email service — anyone could join with it. Use your company''s own domain, or add people one by one.', d
        using errcode = '22023';
    end if;
    if not d = any (v_clean) then
      v_clean := v_clean || d;
    end if;
  end loop;
  if cardinality(v_clean) > 10 then
    raise exception 'Add at most 10 company domains' using errcode = '22023';
  end if;
  new.company_domains := v_clean;
  return new;
end;
$$;

create trigger app_settings_access_guard
  before insert or update of company_domains on public.app_settings
  for each row execute function public.app_settings_access_guard();

-- Is this a verified address on one of the company's domains?
create or replace function public.is_company_email(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    split_part(lower(btrim(p_email)), '@', 2) = any (s.company_domains),
    false
  )
  from public.app_settings s
  where s.id;
$$;
revoke execute on function public.is_company_email(text) from public, anon, authenticated;

-- For the login page (signed out): may a stranger request an account?
create or replace function public.signup_requests_open()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select signup_mode = 'requests' from public.app_settings where id), false);
$$;
revoke execute on function public.signup_requests_open() from public;
grant execute on function public.signup_requests_open() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Gate 1: who may create an account at all
-- ---------------------------------------------------------------------------
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_email    text := lower(btrim(event -> 'user' ->> 'email'));
  v_provider text := coalesce(event -> 'user' -> 'app_metadata' ->> 'provider', 'email');
begin
  if v_email is null or v_email = '' then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'An email address is required.'));
  end if;
  -- the admin list, the allow-list and admin invites go straight in
  if exists (select 1 from public.admin_emails a where a.email = v_email)
     or exists (select 1 from public.allowed_emails a where a.email = v_email) then
    return '{}'::jsonb;
  end if;
  if v_provider = 'google' then
    -- Google has verified the address: the company's own domain joins directly
    if public.is_company_email(v_email) then
      return '{}'::jsonb;
    end if;
    -- open requests only when the admin has switched them on
    if public.signup_requests_open() then
      return '{}'::jsonb;
    end if;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'This account isn''t on your studio''s CrewBoard team. Ask your studio admin to add your email, then try again.'
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- New accounts: listed, invited and company-domain people are approved; anyone else waits
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed  public.allowed_emails;
  v_role     public.user_role;
  v_client   uuid;
  v_approved boolean;
  v_name     text;
begin
  select * into v_allowed from public.allowed_emails where email = lower(btrim(new.email));

  v_role := case
    when public.is_admin_email(new.email, new.email_confirmed_at) then 'admin'::public.user_role
    -- the reviewer role needs a verified address; videographer is the safe default
    when v_allowed.email is not null and new.email_confirmed_at is not null then v_allowed.role::public.user_role
    else coalesce(nullif(new.raw_app_meta_data ->> 'role', '')::public.user_role, 'videographer')
  end;

  v_approved := v_role = 'admin'
             or v_allowed.email is not null
             -- app_metadata can only be written by the service role (admin invites)
             or nullif(new.raw_app_meta_data ->> 'role', '') is not null
             -- a verified address on the company's own domain
             or (new.email_confirmed_at is not null and public.is_company_email(new.email));

  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    v_allowed.full_name,
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    new.email
  );

  insert into public.profiles (id, email, full_name, role, phone, base_location, avatar_url, is_active, deactivated_at, approval_status)
  values (
    new.id,
    new.email,
    v_name,
    v_role,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''), v_allowed.phone),
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'base_location'), ''), v_allowed.base_location),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
    ),
    v_approved,
    case when v_approved then null else now() end,
    case when v_approved then 'approved' else 'pending' end
  )
  on conflict (id) do nothing;

  if v_allowed.email is not null then
    if v_role = 'videographer' then
      foreach v_client in array v_allowed.client_ids loop
        insert into public.videographer_clients (videographer_id, client_id)
        select new.id, c.id from public.clients c where c.id = v_client
        on conflict do nothing;
      end loop;
    end if;
    update public.allowed_emails set claimed_at = now(), claimed_by = new.id where email = v_allowed.email;
  end if;

  if not v_approved then
    perform public.notify_admins(
      'signup_request',
      v_name || ' wants to join CrewBoard',
      new.email || ' signed up with Google. Approve or decline them in Videographers.',
      '/admin/videographers'
    );
  end if;
  return new;
end;
$$;
