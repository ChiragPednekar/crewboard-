-- Google sign-in: anyone who signs in becomes a videographer (crew), except addresses
-- on the admin allow-list, which become admins. Admin is only granted for a *verified*
-- address (Google accounts are verified on creation; email sign-ups once confirmed),
-- so nobody can claim an admin address by registering it first.

create table public.admin_emails (
  email      text primary key check (email = lower(btrim(email)) and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  added_at   timestamptz not null default now()
);
alter table public.admin_emails enable row level security;
create policy admin_emails_admin_select on public.admin_emails for select to authenticated
  using ((select public.is_admin()));
revoke insert, update, delete on public.admin_emails from authenticated;

insert into public.admin_emails (email) values ('casecode01@gmail.com');

create or replace function public.is_admin_email(p_email text, p_confirmed_at timestamptz)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_confirmed_at is not null
     and exists (select 1 from public.admin_emails a where a.email = lower(btrim(p_email)));
$$;
revoke execute on function public.is_admin_email(text, timestamptz) from public, anon, authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role, phone, base_location, avatar_url)
  values (
    new.id,
    new.email,
    -- invited users carry full_name; Google provides full_name/name
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      new.email
    ),
    case
      when public.is_admin_email(new.email, new.email_confirmed_at) then 'admin'::public.user_role
      -- app_metadata can only be set by the service role
      else coalesce(nullif(new.raw_app_meta_data ->> 'role', '')::public.user_role, 'videographer')
    end,
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'base_location'), ''),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- An allow-listed address that confirms later (email sign-up) is promoted then.
create or replace function public.handle_user_confirmed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.is_admin_email(new.email, new.email_confirmed_at) then
    update public.profiles set role = 'admin' where id = new.id and role <> 'admin';
  end if;
  return new;
end;
$$;

create trigger on_auth_user_confirmed
  after update of email_confirmed_at, email on auth.users
  for each row
  when (new.email_confirmed_at is not null)
  execute function public.handle_user_confirmed();

-- If the admin address already has an account, promote it now.
update public.profiles p
   set role = 'admin'
  from auth.users u
 where u.id = p.id
   and public.is_admin_email(u.email, u.email_confirmed_at)
   and p.role <> 'admin';
