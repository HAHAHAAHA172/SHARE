-- Optional compatibility columns used by the S.H.A.R.E newsfeed.
-- Run this once in Supabase SQL Editor before deploying the updated server.
alter table public.posts add column if not exists subject text;
alter table public.posts add column if not exists author text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'posts_subject_check'
      and conrelid = 'public.posts'::regclass
  ) then
    alter table public.posts
      add constraint posts_subject_check
      check (subject is null or subject in ('DSA', 'OOP', 'Discrete Math', 'OS', 'Syllabi', 'General'));
  end if;
end $$;

create index if not exists posts_published_created_at_idx
  on public.posts (post_status, created_at desc);
