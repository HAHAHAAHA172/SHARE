-- Durable, cross-device saved posts. Run once in the Supabase SQL Editor.
create table if not exists public.saved_posts (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists saved_posts_post_id_idx on public.saved_posts (post_id);
create index if not exists saved_posts_user_created_idx on public.saved_posts (user_id, created_at desc);

alter table public.saved_posts enable row level security;
alter table public.saved_posts force row level security;
revoke all on public.saved_posts from anon;
grant select, insert, delete on public.saved_posts to authenticated;

drop policy if exists saved_posts_select_own on public.saved_posts;
create policy saved_posts_select_own on public.saved_posts
for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists saved_posts_insert_own on public.saved_posts;
create policy saved_posts_insert_own on public.saved_posts
for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.posts p
    where p.id = post_id and p.post_status = 'published'
  )
);

drop policy if exists saved_posts_delete_own on public.saved_posts;
create policy saved_posts_delete_own on public.saved_posts
for delete to authenticated
using (user_id = (select auth.uid()));
