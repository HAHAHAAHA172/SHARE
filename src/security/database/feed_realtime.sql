-- Feed Postgres Changes setup for S.H.A.R.E.
-- Run in the Supabase SQL Editor as the database/publication owner.
-- Safe to rerun. Existing policies, grants, and replica identities are preserved.
-- Review SELECT policies separately: enabling replication does not grant access.
-- https://supabase.com/docs/guides/realtime/postgres-changes

begin;

do $$
declare
  feed_table text;
begin
  -- Fail closed before changing the publication if any prerequisite is missing.
  foreach feed_table in array array['posts', 'likes', 'comments'] loop
    if not exists (
      select 1
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname = feed_table
        and c.relkind in ('r', 'p')
        and c.relrowsecurity
    ) then
      raise exception 'public.% must exist with RLS enabled before enabling feed Realtime.', feed_table;
    end if;
  end loop;

  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;

  -- Do not silently change publication-wide settings used by other features.
  if exists (
    select 1 from pg_publication
    where pubname = 'supabase_realtime'
      and not (pubinsert and pubupdate and pubdelete)
  ) then
    raise exception 'supabase_realtime must publish INSERT, UPDATE, and DELETE events. Review its settings before rerunning.';
  end if;

  foreach feed_table in array array['posts', 'likes', 'comments'] loop
    -- This view also recognizes FOR ALL TABLES / FOR TABLES IN SCHEMA coverage.
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = feed_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', feed_table);
    end if;
  end loop;
end;
$$;

commit;

-- Expect three rows with realtime_enabled and rls_enabled both true.
-- Keep the policy audit in verify.sql as a separate authorization check.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       exists (
         select 1 from pg_publication_tables p
         where p.pubname = 'supabase_realtime'
           and p.schemaname = n.nspname
           and p.tablename = c.relname
       ) as realtime_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('posts', 'likes', 'comments')
  and c.relkind in ('r', 'p')
order by c.relname;

-- Client caveats:
-- UPDATE delivery depends on SELECT access to the resulting row. A status change
-- that hides a row under RLS may not emit an event to that viewer; periodically
-- refetch authorized data and refetch on focus/reconnect to remove stale items.
-- Do not depend on DELETE filters with the default replica identity; RLS cannot
-- authorize the deleted row. This script does not enable FULL replica identity.
-- Treat events as invalidation signals and refetch through the authorized API;
-- do not render event payloads as trusted, complete feed data.
-- REPLICA IDENTITY FULL is unnecessary for invalidation. Do not assume old
-- records include a post_id; invalidate all relevant feed data for DELETE events.
