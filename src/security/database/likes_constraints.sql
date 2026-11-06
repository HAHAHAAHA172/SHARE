-- Allow many users to like a post and each user to like many posts.
-- Only the (post_id, user_id) pair must be unique.

begin;

alter table public.likes
  drop constraint if exists likes_post_id_key;

alter table public.likes
  drop constraint if exists likes_user_id_key;

-- These statements also handle databases where the bad uniqueness was added as
-- a standalone index instead of a table constraint.
drop index if exists public.likes_post_id_key;
drop index if exists public.likes_user_id_key;

create unique index if not exists likes_post_user_unique
  on public.likes (post_id, user_id);

create index if not exists likes_post_idx
  on public.likes (post_id);

commit;

-- Verification: only likes_pkey and likes_post_user_unique should be unique.
select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'likes'
order by indexname;
