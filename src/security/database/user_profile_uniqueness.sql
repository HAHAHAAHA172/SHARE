-- Run the duplicate checks first. Resolve any returned rows before creating indexes.
select lower(btrim(user_name)) as normalized_username, count(*)
from public.user_profile
group by lower(btrim(user_name))
having count(*) > 1;

select lower(btrim(full_name)) as normalized_full_name, count(*)
from public.user_profile
group by lower(btrim(full_name))
having count(*) > 1;

-- Enforce case-insensitive uniqueness at the database boundary.
create unique index if not exists user_profile_username_ci_key
  on public.user_profile (lower(btrim(user_name)));

create unique index if not exists user_profile_full_name_ci_key
  on public.user_profile (lower(btrim(full_name)));
