-- Storage buckets + policies.
-- Paths:  avatars/{user_id}/…      client-logos/{client_id}/…
--         task-refs/{task_id}/…    thumbnails/{task_id}/…

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',      'avatars',      true,  2097152,  array['image/jpeg', 'image/png', 'image/webp']),
  ('client-logos', 'client-logos', true,  2097152,  array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml']),
  ('task-refs',    'task-refs',    false, 52428800, array['image/jpeg', 'image/png', 'image/webp', 'image/gif',
                                                         'application/pdf', 'video/mp4', 'video/quicktime',
                                                         'text/plain', 'application/zip']),
  ('thumbnails',   'thumbnails',   false, 5242880,  array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Thumbnails of featured work are visible to everyone signed in (home page showcase).
create or replace function public.is_featured_task(p_task_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.featured_work f where f.task_id::text = p_task_id);
$$;
revoke execute on function public.is_featured_task(text) from public, anon;
grant execute on function public.is_featured_task(text) to authenticated;

-- Can the current user see this task? (tasks RLS applies inside the subquery)
create or replace function public.can_see_task(p_task_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.tasks t where t.id::text = p_task_id);
$$;

-- Is this an open task owned by the current user?
create or replace function public.owns_open_task(p_task_id text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
    where t.id::text = p_task_id
      and t.videographer_id = auth.uid()
      and t.status not in ('approved', 'cancelled')
  );
$$;

-- avatars ---------------------------------------------------------------------
create policy "avatars read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
create policy "avatars insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars'
    and ((select public.is_admin()) or (storage.foldername(name))[1] = (select auth.uid())::text));
create policy "avatars update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars'
    and ((select public.is_admin()) or (storage.foldername(name))[1] = (select auth.uid())::text));
create policy "avatars delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars'
    and ((select public.is_admin()) or (storage.foldername(name))[1] = (select auth.uid())::text));

-- client logos ----------------------------------------------------------------
create policy "client-logos read" on storage.objects for select to authenticated
  using (bucket_id = 'client-logos');
create policy "client-logos admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-logos' and (select public.is_admin()));
create policy "client-logos admin update" on storage.objects for update to authenticated
  using (bucket_id = 'client-logos' and (select public.is_admin()));
create policy "client-logos admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'client-logos' and (select public.is_admin()));

-- task references (admin uploads, owner reads) ---------------------------------
create policy "task-refs read" on storage.objects for select to authenticated
  using (bucket_id = 'task-refs'
    and ((select public.is_admin()) or public.can_see_task((storage.foldername(name))[1])));
create policy "task-refs admin insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'task-refs' and (select public.is_admin()));
create policy "task-refs admin update" on storage.objects for update to authenticated
  using (bucket_id = 'task-refs' and (select public.is_admin()));
create policy "task-refs admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'task-refs' and (select public.is_admin()));

-- submission thumbnails (owner uploads while open; history is never deleted by owners)
create policy "thumbnails read" on storage.objects for select to authenticated
  using (bucket_id = 'thumbnails'
    and ((select public.is_admin())
         or public.can_see_task((storage.foldername(name))[1])
         or public.is_featured_task((storage.foldername(name))[1])));
create policy "thumbnails insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'thumbnails'
    and ((select public.is_admin()) or public.owns_open_task((storage.foldername(name))[1])));
create policy "thumbnails admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'thumbnails' and (select public.is_admin()));

grant execute on function public.can_see_task(text), public.owns_open_task(text) to authenticated, service_role;
revoke execute on function public.can_see_task(text), public.owns_open_task(text) from public, anon;
