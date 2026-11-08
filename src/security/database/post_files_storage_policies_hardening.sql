-- Rerunnable hardening for an existing private `post-files` bucket.
-- Run in Supabase SQL Editor with database-owner privileges.
--
-- Direct Storage reads are limited to objects in the owner/post folder of a
-- published post. The server-side API still validates the post and material
-- record before serving an attachment.

drop policy if exists "post_files_read_shared" on storage.objects;

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

-- Verification: inspect the policy definition after applying it.
select policyname, cmd, qual
from pg_policies
where schemaname = 'storage'
  and tablename = 'objects'
  and policyname = 'post_files_read_shared';
