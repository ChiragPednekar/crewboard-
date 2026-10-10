-- Audio files on submissions (MP3, plus WAV / M4A): a voice-over, music bed or an
-- audio-only deliverable. One file per version, stored privately at
-- submission-audio/{task_id}/… with the same access rules as thumbnails.
-- A submission now needs at least one link OR an audio file.

alter table public.submissions
  add column audio_path text,
  add column audio_name text check (audio_name is null or char_length(audio_name) <= 200);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submission-audio', 'submission-audio', false, 52428800,
  array['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/wave',
        'audio/mp4', 'audio/x-m4a', 'audio/aac']
)
on conflict (id) do nothing;

create policy "submission-audio read" on storage.objects for select to authenticated
  using (bucket_id = 'submission-audio'
    and ((select public.is_admin()) or public.can_see_task((storage.foldername(name))[1])));
create policy "submission-audio insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'submission-audio'
    and ((select public.is_admin()) or public.owns_open_task((storage.foldername(name))[1])));
create policy "submission-audio admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'submission-audio' and (select public.is_admin()));

-- submit_task gains p_audio_path / p_audio_name (appended, so existing callers keep working)
drop function public.submit_task(uuid, text[], text, text, public.submission_source, timestamptz);

create function public.submit_task(
  p_task_id        uuid,
  p_links          text[],
  p_notes          text default null,
  p_thumbnail_path text default null,
  p_source         public.submission_source default 'app',
  p_submitted_at   timestamptz default null,
  p_audio_path     text default null,
  p_audio_name     text default null
)
returns public.submissions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v       public.tasks;
  v_links text[];
  v_notes text := nullif(btrim(p_notes), '');
  s       public.submissions;
begin
  select * into v from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'Task not found' using errcode = 'P0002';
  end if;
  perform public.assert_task_actor(v, p_source);

  if v.status in ('approved', 'cancelled') then
    raise exception 'This task is % and can no longer be submitted', v.status using errcode = '22023';
  end if;
  if public.is_month_locked(v.videographer_id, v.month) then
    raise exception 'The % assessment is locked', public.format_month(v.month) using errcode = '55000';
  end if;

  select coalesce(array_agg(btrim(l) order by ord), '{}')
    into v_links
    from unnest(coalesce(p_links, '{}'::text[])) with ordinality as x(l, ord)
   where btrim(l) <> '';
  -- marking work Completed in a sheet doesn't need a link; the app needs a link or an audio file
  if cardinality(v_links) = 0 and p_audio_path is null and p_source <> 'sheet' then
    raise exception 'Add at least one deliverable link or an audio file' using errcode = '22023';
  elsif cardinality(v_links) > 5 then
    raise exception 'You can submit at most 5 links' using errcode = '22023';
  end if;
  if p_thumbnail_path is not null and p_thumbnail_path not like p_task_id::text || '/%' then
    raise exception 'Invalid thumbnail path' using errcode = '22023';
  end if;
  if p_audio_path is not null and p_audio_path not like p_task_id::text || '/%' then
    raise exception 'Invalid audio path' using errcode = '22023';
  end if;

  if p_source = 'sheet' then
    perform set_config('app.actor_kind', 'sheet', true);
  end if;

  insert into public.submissions (task_id, version, links, thumbnail_path, audio_path, audio_name, notes, source, submitted_by, submitted_at)
  values (
    p_task_id, 1, v_links, p_thumbnail_path, p_audio_path,
    case when p_audio_path is not null then left(nullif(btrim(p_audio_name), ''), 200) end,
    v_notes, p_source, v.videographer_id,
    case when public.is_service_context() and p_submitted_at is not null then p_submitted_at else now() end
  )
  returning * into s;

  update public.tasks
     set status = 'submitted',
         status_changed_via = p_source,
         videographer_notes = coalesce(v_notes, videographer_notes)
   where id = p_task_id;

  return s;
end;
$$;

revoke execute on function public.submit_task(uuid, text[], text, text, public.submission_source, timestamptz, text, text) from public, anon;
grant execute on function public.submit_task(uuid, text[], text, text, public.submission_source, timestamptz, text, text) to authenticated, service_role;
