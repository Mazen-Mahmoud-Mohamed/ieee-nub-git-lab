-- Task 2: allow a single GitHub user authorization to verify PUBLIC forks.
-- This is additive for published v1 attempts: repository identity and scores remain pinned.
begin;

create table private.task2_oauth_tokens (
  student_id uuid primary key references auth.users(id) on delete cascade,
  access_ciphertext text not null check (length(access_ciphertext) between 20 and 6000),
  refresh_ciphertext text check (refresh_ciphertext is null or length(refresh_ciphertext) between 20 and 6000),
  access_expires_at timestamptz,
  refresh_expires_at timestamptz,
  updated_at timestamptz not null default now()
);

-- Only the service-role Edge Function can read ciphertext. Do not add this to
-- task2_connection(): that RPC is used to populate the student-facing status.
revoke all on private.task2_oauth_tokens from public, anon, authenticated;
grant select, insert, update, delete on private.task2_oauth_tokens to service_role;

create function public.task2_token_store(
  p_student uuid,
  p_access text,
  p_refresh text,
  p_access_expires timestamptz,
  p_refresh_expires timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from private.task2_connections
    where student_id = p_student and not revoked
  ) then raise exception 'GitHub identity must be connected before token storage'; end if;
  insert into private.task2_oauth_tokens (
    student_id, access_ciphertext, refresh_ciphertext, access_expires_at, refresh_expires_at
  ) values (p_student, p_access, p_refresh, p_access_expires, p_refresh_expires)
  on conflict (student_id) do update set
    access_ciphertext = excluded.access_ciphertext,
    refresh_ciphertext = excluded.refresh_ciphertext,
    access_expires_at = excluded.access_expires_at,
    refresh_expires_at = excluded.refresh_expires_at,
    updated_at = now();
end $$;

create function public.task2_token_read(p_student uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select to_jsonb(t) - 'student_id' from private.task2_oauth_tokens t
  where t.student_id = p_student
$$;

create function public.task2_token_delete(p_student uuid)
returns void language sql security definer set search_path = '' as $$
  delete from private.task2_oauth_tokens where student_id = p_student
$$;

revoke all on function public.task2_token_store(uuid,text,text,timestamptz,timestamptz),
  public.task2_token_read(uuid), public.task2_token_delete(uuid)
  from public, anon, authenticated;
grant execute on function public.task2_token_store(uuid,text,text,timestamptz,timestamptz),
  public.task2_token_read(uuid), public.task2_token_delete(uuid) to service_role;

-- The previous column is retained for old installations and webhook history,
-- but no longer required to verify a public repository.
alter table public.task2_repositories alter column installation_id drop not null;

create function private.task2_clear_revoked_token()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.revoked and not old.revoked then
    delete from private.task2_oauth_tokens where student_id = new.student_id;
  end if;
  return new;
end $$;
create trigger task2_clear_revoked_token
after update of revoked on private.task2_connections
for each row execute function private.task2_clear_revoked_token();

commit;
