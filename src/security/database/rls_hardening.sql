-- RLS hardening for S.H.A.R.E.
-- Run in the Supabase SQL Editor with administrator visibility.

-- 1) Users must not approve, reject, or remove their own posts.
-- The API already authorizes moderation server-side; this trigger protects
-- direct Supabase Data API writes as well.
create or replace function public.prevent_non_admin_post_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.post_status is distinct from old.post_status
     and not exists (
       select 1
       from public.user_profile p
       where p.user_id = (select auth.uid())
         and lower(p.role) = 'admin'
     ) then
    raise exception 'Only administrators can change post status.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists posts_prevent_non_admin_status on public.posts;
create trigger posts_prevent_non_admin_status
before update of post_status on public.posts
for each row execute function public.prevent_non_admin_post_status_change();

-- 2) Likes may only be created for published posts.
drop policy if exists likes_insert_own on public.likes;
create policy likes_insert_own on public.likes
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.posts p
    where p.id = likes.post_id
      and p.post_status = 'published'
  )
);

-- 3) Comments may only be created for published posts.
drop policy if exists comments_insert_own on public.comments;
create policy comments_insert_own on public.comments
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and status = 'published'
  and exists (
    select 1 from public.posts p
    where p.id = comments.post_id
      and p.post_status = 'published'
  )
);

-- 4) Comments are immutable after creation; the application uses soft-delete.
drop policy if exists comments_update_own on public.comments;

-- 5) Courses are safe to read during authenticated profile setup.
-- Keep this authenticated-only unless signup needs an unauthenticated course list.
drop policy if exists courses_read_active on public.courses;
create policy courses_read_active on public.courses
for select to authenticated
using (is_active = true);

