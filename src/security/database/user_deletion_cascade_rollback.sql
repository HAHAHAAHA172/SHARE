-- Roll back user_deletion_cascade.sql in Supabase.
-- Run in the SQL Editor with database-owner privileges.
-- This restores SET NULL for user ownership and moderation references.
-- Moderation references remain nullable so existing orphan audit rows survive.

begin;

do $$
declare
  item record;
begin
  for item in
    select con.conname, child_ns.nspname as child_schema,
           child_cls.relname as child_table, child_attr.attname as child_column,
           parent_ns.nspname as parent_schema, parent_cls.relname as parent_table,
           parent_attr.attname as parent_column
    from pg_constraint con
    join pg_class child_cls on child_cls.oid = con.conrelid
    join pg_namespace child_ns on child_ns.oid = child_cls.relnamespace
    join pg_class parent_cls on parent_cls.oid = con.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent_cls.relnamespace
    join pg_attribute child_attr on child_attr.attrelid = con.conrelid and child_attr.attnum = con.conkey[1]
    join pg_attribute parent_attr on parent_attr.attrelid = con.confrelid and parent_attr.attnum = con.confkey[1]
    where con.contype = 'f'
      and array_length(con.conkey, 1) = 1
      and child_ns.nspname = 'public'
      and child_cls.relname = 'moderation_actions'
      and (
        (parent_ns.nspname = 'public' and parent_cls.relname = 'posts')
        or (parent_ns.nspname = 'auth' and parent_cls.relname = 'users')
      )
  loop
    execute format('alter table %I.%I drop constraint %I', item.child_schema, item.child_table, item.conname);
  end loop;

  alter table public.moderation_actions
    add constraint moderation_actions_post_id_fkey
      foreign key (post_id) references public.posts(id) on delete set null,
    add constraint moderation_actions_admin_user_id_fkey
      foreign key (admin_user_id) references auth.users(id) on delete set null;
end;
$$;

do $$
declare
  item record;
begin
  for item in
    select con.conname, child_ns.nspname as child_schema,
           child_cls.relname as child_table, child_attr.attname as child_column,
           parent_ns.nspname as parent_schema, parent_cls.relname as parent_table,
           parent_attr.attname as parent_column
    from pg_constraint con
    join pg_class child_cls on child_cls.oid = con.conrelid
    join pg_namespace child_ns on child_ns.oid = child_cls.relnamespace
    join pg_class parent_cls on parent_cls.oid = con.confrelid
    join pg_namespace parent_ns on parent_ns.oid = parent_cls.relnamespace
    join pg_attribute child_attr on child_attr.attrelid = con.conrelid and child_attr.attnum = con.conkey[1]
    join pg_attribute parent_attr on parent_attr.attrelid = con.confrelid and parent_attr.attnum = con.confkey[1]
    where con.contype = 'f'
      and array_length(con.conkey, 1) = 1
      and child_ns.nspname = 'public'
      and child_attr.attname in ('user_id', 'owner_id')
      and (
        (parent_ns.nspname = 'public' and parent_cls.relname = 'user_profile' and parent_attr.attname = 'user_id')
        or (parent_ns.nspname = 'auth' and parent_cls.relname = 'users' and parent_attr.attname = 'id')
      )
  loop
    execute format('alter table %I.%I drop constraint %I', item.child_schema, item.child_table, item.conname);
    execute format(
      'alter table %I.%I add constraint %I foreign key (%I) references %I.%I (%I) on delete set null',
      item.child_schema, item.child_table, item.conname,
      item.child_column, item.parent_schema, item.parent_table, item.parent_column
    );
  end loop;
end;
$$;

commit;

-- Verify the restored actions. Existing orphan audit references are preserved.
select child_cls.relname as child_table, con.conname,
       pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class child_cls on child_cls.oid = con.conrelid
join pg_namespace child_ns on child_ns.oid = child_cls.relnamespace
where con.contype = 'f'
  and child_ns.nspname = 'public'
  and (
    child_cls.relname = 'moderation_actions'
    or pg_get_constraintdef(con.oid) ilike '%user_id%'
  )
order by child_table, con.conname;
