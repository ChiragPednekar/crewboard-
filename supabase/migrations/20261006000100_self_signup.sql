-- Self sign-up with admin approval.
--
-- Anyone can create an account with Google (Google has verified the address). The
-- account starts as "pending": it is inactive, and the custom access token hook below
-- issues its sessions with the `anon` database role, so RLS treats it exactly like a
-- signed-out visitor until an admin approves it. The app shows a waiting screen.
-- Email/password sign-up stays invite-only (the allow-list or an admin invite).

-- ---------------------------------------------------------------------------
-- Approval state
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column approval_status text not null default 'approved'
    check (approval_status in ('approved', 'pending', 'declined')),
  add column approval_decided_at timestamptz,
  add column approval_decided_by uuid references public.profiles (id) on delete set null;

create index profiles_pending_idx on public.profiles (created_at) where approval_status = 'pending';

-- Only admins change approval; turning an account back on also approves it, so the
-- existing Reactivate action works for declined requests too.
create or replace function public.profiles_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_privileged() then
    -- A videographer may only edit their own phone and avatar.
    if row(new.id, new.full_name, new.email, new.role, new.base_location, new.is_active, new.deactivated_at, new.approval_status)
       is distinct from
       row(old.id, old.full_name, old.email, old.role, old.base_location, old.is_active, old.deactivated_at, old.approval_status) then
      raise exception 'Only an admin can change these profile fields' using errcode = '42501';
    end if;
  end if;

  -- An admin cannot lock themselves out.
  if new.id = auth.uid() and (new.role <> old.role or (old.is_active and not new.is_active)) then
    raise exception 'You cannot change your own role or deactivate yourself' using errcode = '42501';
  end if;

  if new.is_active and not old.is_active then
    new.deactivated_at := null;
    if new.approval_status <> 'approved' then
      new.approval_status := 'approved';
      new.approval_decided_at := now();
      new.approval_decided_by := auth.uid();
    end if;
  elsif not new.is_active and old.is_active then
    new.deactivated_at := coalesce(new.deactivated_at, now());
  end if;
  return new;
end;
$$;

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
  -- anyone else may sign up with Google (verified address) and waits for approval
  if v_provider = 'google' then
    return '{}'::jsonb;
  end if;
  return jsonb_build_object('error', jsonb_build_object(
    'http_code', 403,
    'message', 'To create an account, use Sign up with Google. For an email login, ask your studio admin for an invite.'
  ));
end;
$$;

-- ---------------------------------------------------------------------------
-- New accounts: allow-listed / admin / invited people are approved; anyone else waits
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
             or nullif(new.raw_app_meta_data ->> 'role', '') is not null;

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

-- ---------------------------------------------------------------------------
-- Gate 2: sessions of accounts waiting for approval get no database access
-- ---------------------------------------------------------------------------
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_claims jsonb := event -> 'claims';
  v_status text;
begin
  select p.approval_status into v_status from public.profiles p where p.id = (event ->> 'user_id')::uuid;
  v_status := coalesce(v_status, 'approved');
  if v_status <> 'approved' then
    -- RLS then sees a signed-out visitor: no tables, no team functions
    v_claims := jsonb_set(v_claims, '{role}', '"anon"');
  end if;
  v_claims := jsonb_set(v_claims, '{crewboard_access}', to_jsonb(v_status));
  return jsonb_build_object('claims', v_claims);
end;
$$;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;

-- What the waiting screen shows: works for pending sessions (anon role) and normal ones.
create or replace function public.my_access()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'status', p.approval_status,
    'full_name', p.full_name,
    'email', p.email,
    'avatar_url', p.avatar_url,
    'requested_at', p.created_at
  )
  from public.profiles p
  where p.id = auth.uid();
$$;
revoke execute on function public.my_access() from public;
grant execute on function public.my_access() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Admin: approve or decline a sign-up
-- ---------------------------------------------------------------------------
create or replace function public.decide_signup(
  p_user_id    uuid,
  p_approve    boolean,
  p_role       text default 'videographer',
  p_client_ids uuid[] default '{}'
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.profiles;
  v_client uuid;
begin
  if not public.is_admin() then
    raise exception 'Only admins can approve sign-ups' using errcode = '42501';
  end if;
  select * into v from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'That account no longer exists' using errcode = 'P0002';
  end if;
  if v.approval_status = 'approved' then
    raise exception '% is already approved', v.full_name using errcode = '22023';
  end if;

  if p_approve then
    if p_role not in ('videographer', 'reviewer') then
      raise exception 'Pick videographer or reviewer' using errcode = '22023';
    end if;
    update public.profiles
       set approval_status = 'approved', approval_decided_at = now(), approval_decided_by = auth.uid(),
           is_active = true, role = p_role::public.user_role
     where id = p_user_id
    returning * into v;
    -- keep the allow-list the single record of who may sign in
    insert into public.allowed_emails (email, full_name, role, added_by, claimed_at, claimed_by)
    values (lower(btrim(v.email)), v.full_name, p_role, auth.uid(), now(), v.id)
    on conflict (email) do update set role = excluded.role, claimed_at = coalesce(public.allowed_emails.claimed_at, now()), claimed_by = v.id;
    if p_role = 'videographer' then
      foreach v_client in array coalesce(p_client_ids, '{}') loop
        insert into public.videographer_clients (videographer_id, client_id, assigned_by)
        select v.id, c.id, auth.uid() from public.clients c where c.id = v_client
        on conflict do nothing;
      end loop;
    end if;
    perform public.notify(v.id, 'signup_approved', 'Welcome to CrewBoard', 'Your account was approved. Your tasks appear here once your plan is published.', '/');
    perform public.log_activity('signup.approved', 'profile', v.id, v.id, v.full_name, jsonb_build_object('role', p_role));
  else
    update public.profiles
       set approval_status = 'declined', approval_decided_at = now(), approval_decided_by = auth.uid(), is_active = false
     where id = p_user_id
    returning * into v;
    perform public.log_activity('signup.declined', 'profile', v.id, v.id, v.full_name, '{}'::jsonb);
  end if;
  return v;
end;
$$;
revoke execute on function public.decide_signup(uuid, boolean, text, uuid[]) from public, anon;
grant execute on function public.decide_signup(uuid, boolean, text, uuid[]) to authenticated;

-- Activity: a sign-up is "requested", not "invited", and approving one isn't "reactivating"
-- (decide_signup logs the decision itself).
create or replace function public.profiles_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inviter uuid;
begin
  if tg_op = 'INSERT' then
    if new.approval_status = 'pending' then
      insert into public.activity_log (actor_id, actor_kind, action, entity_type, entity_id, videographer_id, summary)
      values (new.id, 'user', 'signup.requested', 'profile', new.id, null, new.full_name);
    elsif new.role = 'videographer' then
      -- Invites are created by the admin-users function (service role), so auth.uid() is
      -- empty here; it records the inviting admin in the new user's metadata instead.
      select p.id into v_inviter
        from auth.users u
        join public.profiles p on p.id = (u.raw_user_meta_data ->> 'invited_by')::uuid and p.role = 'admin'
       where u.id = new.id
         and (u.raw_user_meta_data ->> 'invited_by') ~ '^[0-9a-f-]{36}$';
      insert into public.activity_log (actor_id, actor_kind, action, entity_type, entity_id, videographer_id, summary)
      values (v_inviter, case when v_inviter is null then 'system' else 'user' end::public.actor_kind,
              'videographer.invited', 'profile', new.id, new.id, new.full_name);
    end if;
  elsif new.is_active is distinct from old.is_active and new.approval_status = old.approval_status then
    perform public.log_activity(case when new.is_active then 'videographer.reactivated' else 'videographer.deactivated' end,
      'profile', new.id, case when new.role = 'videographer' then new.id end, new.full_name, '{}'::jsonb);
  end if;
  return null;
end;
$$;
