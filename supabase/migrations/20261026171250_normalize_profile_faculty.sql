-- Preserve department text, academic identity, and all existing assessment evidence.
-- This also supports an installation that already has a faculty column from a prior rollout.
alter table public.profiles add column if not exists faculty text;

-- Remove only CHECK constraints involving faculty, so an old enum-like CHECK cannot block
-- the requested rename. Leave every other profile constraint and RLS policy unchanged.
do $$ declare constraint_row record;begin
 for constraint_row in
  select c.conname from pg_constraint c join pg_attribute a
   on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
  where c.conrelid='public.profiles'::regclass and c.contype='c' and a.attname='faculty' and cardinality(c.conkey)=1
 loop execute format('alter table public.profiles drop constraint %I',constraint_row.conname);end loop;
end $$;

alter table public.profiles alter column faculty drop default;
alter table public.profiles alter column faculty type text using faculty::text;

update public.profiles set faculty=case
 when lower(trim(faculty)) in ('computers_information','computers & information','computer science','computer_science') then 'computer_science'
 when lower(trim(faculty))='engineering' then 'engineering'
 else faculty end
where faculty is not null;

-- Infer only unambiguous legacy choices; never assign a faculty to an unrelated department.
update public.profiles set faculty=case
 when lower(trim(department))='engineering' then 'engineering'
 when lower(trim(department)) in ('computers_information','computers & information','computer science','computer_science') then 'computer_science'
 else null end
where faculty is null;

-- Null is retained solely for old profiles whose faculty cannot safely be inferred.
-- NOT VALID preserves any unexpected legacy data; PostgreSQL still checks all new writes.
alter table public.profiles add constraint profiles_faculty_allowed
 check(faculty is null or faculty in ('engineering','computer_science')) not valid;
do $$begin
 if not exists(select 1 from public.profiles where faculty is not null and faculty not in ('engineering','computer_science')) then
  alter table public.profiles validate constraint profiles_faculty_allowed;
 end if;
end $$;

create function private.require_valid_faculty() returns trigger language plpgsql set search_path='' as $$begin
 if new.faculty is null or new.faculty not in ('engineering','computer_science') then raise exception 'Select Engineering or Computer Science.';end if;return new;
end $$;
revoke all on function private.require_valid_faculty() from public,anon,authenticated;
create trigger profile_faculty_required before insert or update of faculty on public.profiles
 for each row execute function private.require_valid_faculty();
