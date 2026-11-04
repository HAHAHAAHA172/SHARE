create table if not exists public.notifications (
  notification_id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  post_id uuid references public.posts(id) on delete cascade,
  type text not null check (type in ('post_pending','post_approved','post_rejected','like','comment')),
  title text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
grant select, update on public.notifications to authenticated;
drop policy if exists notifications_read_own on public.notifications;
create policy notifications_read_own on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
drop policy if exists notifications_mark_own on public.notifications;
create policy notifications_mark_own on public.notifications for update to authenticated using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));

create or replace function public.create_share_notification(
  recipient uuid, actor uuid, post uuid, kind text, notification_title text, notification_body text
) returns void language plpgsql security definer set search_path = public
as $$ begin
  if recipient is null or (actor is not null and recipient = actor) then return; end if;
  insert into public.notifications(recipient_id, actor_id, post_id, type, title, body)
  values (recipient, actor, post, kind, notification_title, notification_body);
end; $$;
revoke all on function public.create_share_notification(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

create or replace function public.notify_post_status() returns trigger language plpgsql security definer set search_path = public
as $$ begin
  if new.post_status = 'pending' and (tg_op = 'INSERT' or old.post_status is distinct from new.post_status) then
    perform public.create_share_notification(new.user_id, null, new.id, 'post_pending', 'Post received', 'Your post is pending administrator approval.');
  elsif new.post_status = 'published' and (tg_op = 'UPDATE' and old.post_status is distinct from new.post_status) then
    perform public.create_share_notification(new.user_id, null, new.id, 'post_approved', 'Post approved', 'Your post is now visible in the newsfeed.');
  elsif new.post_status = 'removed' and (tg_op = 'UPDATE' and old.post_status is distinct from new.post_status) then
    perform public.create_share_notification(new.user_id, null, new.id, 'post_rejected', 'Post removed', 'An administrator removed your post.');
  end if; return new;
end; $$;
drop trigger if exists posts_notify_status on public.posts;
create trigger posts_notify_status after insert or update of post_status on public.posts for each row execute function public.notify_post_status();

create or replace function public.notify_social_activity() returns trigger language plpgsql security definer set search_path = public
as $$ declare owner_id uuid; post_title text; begin
  select user_id, title into owner_id, post_title from public.posts where id = new.post_id;
  if tg_table_name = 'likes' then
    perform public.create_share_notification(owner_id, new.user_id, new.post_id, 'like', 'New reaction', 'Someone liked your post: ' || coalesce(post_title, 'your post') || '.');
  else
    perform public.create_share_notification(owner_id, new.user_id, new.post_id, 'comment', 'New comment', 'Someone commented on your post: ' || coalesce(post_title, 'your post') || '.');
  end if; return new;
end; $$;
drop trigger if exists likes_notify_owner on public.likes;
create trigger likes_notify_owner after insert on public.likes for each row execute function public.notify_social_activity();
drop trigger if exists comments_notify_owner on public.comments;
create trigger comments_notify_owner after insert on public.comments for each row execute function public.notify_social_activity();
