-- File paths stored in rows must be a single file directly inside their own task's
-- folder: no sub-folders, no "..", no other task's folder.
alter table public.submissions
  add constraint submissions_thumbnail_path_check
    check (thumbnail_path is null or thumbnail_path ~ ('^' || task_id::text || '/[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,5}$')),
  add constraint submissions_audio_path_check
    check (audio_path is null or audio_path ~ ('^' || task_id::text || '/[A-Za-z0-9_-]+\.[A-Za-z0-9]{1,5}$'));

alter table public.task_references
  add constraint task_references_storage_path_check
    check (storage_path is null or (storage_path ~ ('^' || task_id::text || '/[A-Za-z0-9._-]+$') and storage_path !~ '\.\.'));
