-- Run in Supabase SQL Editor after setting at least one user_profile.role to 'admin'.
-- Keep admin authorization in the database; never trust a browser-supplied role.
create table if not exists public.moderation_actions (
  action_id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete restrict,
  admin_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null check (action in ('draft', 'published', 'removed')),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.moderation_actions enable row level security;
grant select, insert on public.moderation_actions to authenticated;

drop policy if exists moderation_actions_admin_read on public.moderation_actions;
create policy moderation_actions_admin_read on public.moderation_actions for select to authenticated
using (exists (select 1 from public.user_profile p where p.user_id = (select auth.uid()) and lower(p.role) = 'admin'));

drop policy if exists moderation_actions_admin_insert on public.moderation_actions;
create policy moderation_actions_admin_insert on public.moderation_actions for insert to authenticated
with check (admin_user_id = (select auth.uid()) and exists (select 1 from public.user_profile p where p.user_id = (select auth.uid()) and lower(p.role) = 'admin'));

alter table public.posts enable row level security;
alter table public.materials enable row level security;

drop policy if exists posts_admin_read on public.posts;
create policy posts_admin_read on public.posts for select to authenticated
using (exists (select 1 from public.user_profile p where p.user_id = (select auth.uid()) and lower(p.role) = 'admin'));

drop policy if exists posts_admin_update on public.posts;
create policy posts_admin_update on public.posts for update to authenticated
using (exists (select 1 from public.user_profile p where p.user_id = (select auth.uid()) and lower(p.role) = 'admin'))
with check (exists (select 1 from public.user_profile p where p.user_id = (select auth.uid()) and lower(p.role) = 'admin'));

drop policy if exists materials_admin_read on public.materials;
create policy materials_admin_read on public.materials for select to authenticated
using (exists (select 1 from public.user_profile p where p.user_id = (select auth.uid()) and lower(p.role) = 'admin'));
