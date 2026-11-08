-- Supporting indexes for the feed, social counts, notifications, and attachment lookups.
-- Run once in the Supabase SQL Editor. Each statement is safe to rerun.

create index if not exists posts_published_subject_created_at_idx
  on public.posts (subject, created_at desc)
  where post_status = 'published';

-- Include the unique tie-breaker used by feed pagination. The unfiltered feed
-- also needs an index whose first column is its ordering column.
create index if not exists posts_published_created_at_id_idx
  on public.posts (created_at desc, id desc)
  where post_status = 'published';

create index if not exists posts_published_subject_created_at_id_idx
  on public.posts (subject, created_at desc, id desc)
  where post_status = 'published';

create index if not exists likes_user_post_idx
  on public.likes (user_id, post_id);

create index if not exists comments_published_post_idx
  on public.comments (post_id)
  where status = 'published';

create index if not exists comments_published_post_created_at_id_idx
  on public.comments (post_id, created_at, comment_id)
  where status = 'published';

create index if not exists notifications_recipient_created_at_idx
  on public.notifications (recipient_id, created_at desc);

create index if not exists materials_post_idx
  on public.materials (post_id);
