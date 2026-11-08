-- Run in Supabase SQL Editor for the existing private `post-files` bucket.
-- These policies let authenticated users upload/delete only files under their
-- own user-id folder, while direct reads require a published post whose owner
-- and id match the object's user-id/post-id path.

drop policy if exists "post_files_read_shared" on storage.objects;
drop policy if exists "post_files_insert_own" on storage.objects;
drop policy if exists "post_files_delete_own" on storage.objects;

create policy "post_files_read_shared"
on storage.objects for select
to authenticated
using (
  bucket_id = 'post-files'
  and exists (
    select 1
    from public.posts p
    where p.id::text = (storage.foldername(name))[2]
      and p.user_id::text = (storage.foldername(name))[1]
      and p.post_status = 'published'
  )
);

create policy "post_files_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'post-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "post_files_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'post-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
