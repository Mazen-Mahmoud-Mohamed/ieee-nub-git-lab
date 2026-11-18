-- Generator input. Apply only the generated migration.
create table private.task2_template(id boolean primary key default true check(id), document jsonb not null, answer_keys jsonb not null default '{}');
insert into private.task2_template(document) values(/* TASK2_TEMPLATE */);
create function public.task2_template() returns jsonb language plpgsql stable security definer set search_path='' as $$
declare d jsonb;k jsonb;questions jsonb:='[]';q jsonb;
begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 select document,answer_keys into d,k from private.task2_template where id;
 for q in select value from jsonb_array_elements(d->'questions') loop
  if jsonb_typeof(k->(q->>'id')->'correctAnswers') is distinct from 'array' or jsonb_array_length(k->(q->>'id')->'correctAnswers')=0 then raise exception 'Import the private Task 2 answer keys before preparing its draft';end if;
  questions:=questions||jsonb_build_array(q||(k->(q->>'id')));
 end loop;
 return jsonb_set(d,'{questions}',questions);
end $$;
revoke all on function public.task2_template() from public,anon;
grant execute on function public.task2_template() to authenticated;
create function private.validate_task2_source() returns trigger language plpgsql set search_path='' as $$
declare d jsonb:=new.document;selected_task jsonb;c jsonb;expected jsonb;practical numeric;theory numeric;
begin
 if d ? 'practicalSource' and d->>'practicalSource' is distinct from 'github-task2-v1' then raise exception 'Unknown practical source';end if;
 if d->>'practicalSource' is distinct from 'github-task2-v1' then
  if tg_table_name='assessment_versions' and d->>'courseSlot'='task2' then raise exception 'New Task 2 versions require real GitHub integration';end if;
  if exists(select 1 from jsonb_array_elements(d->'sections') s cross join lateral jsonb_array_elements(s->'tasks') t cross join lateral jsonb_array_elements(t->'rules') r where r->>'type'='github') then raise exception 'GitHub rules require the GitHub source';end if;
  return new;
 end if;
 if d->>'courseSlot' is distinct from 'task2' or d->>'type' is distinct from 'assignment' then raise exception 'GitHub source is only for Task 2 coursework';end if;
 if tg_table_name='assessment_drafts' then return new;end if;
 select document into expected from private.task2_template where id;
 select coalesce(sum((t->>'points')::numeric),0) into practical from jsonb_array_elements(d->'sections') s cross join lateral jsonb_array_elements(s->'tasks') t;
 select coalesce(sum((q->>'points')::numeric),0) into theory from jsonb_array_elements(d->'questions') q;
 if practical<>100 or theory<>50 or jsonb_array_length(d->'questions')<>15 or exists(select 1 from jsonb_array_elements(d->'questions') q where (q->>'manual')::boolean or q->>'kind' not in ('single','multiple','boolean','choice-complete','fill-blank')) or (select count(*) from jsonb_array_elements(d->'sections') s cross join lateral jsonb_array_elements(s->'tasks') t)<>14 then raise exception 'Task 2 requires 14 GitHub criteria totaling 100 and 15 objective questions totaling 50';end if;
 for c in select value from jsonb_array_elements(expected->'sections'->0->'tasks') loop
  select task into selected_task from jsonb_array_elements(d->'sections') s cross join lateral jsonb_array_elements(s->'tasks') task where task->>'id'=c->>'id';
  if selected_task is null or selected_task->'rules'<>c->'rules' or selected_task->'points'<>c->'points' or selected_task->'requirementWeights'<>c->'requirementWeights' or selected_task->'bonus'<>'false'::jsonb then raise exception 'Task 2 rubric contract mismatch';end if;
 end loop;
 return new;
end $$;
create trigger task2_source_draft before insert or update on public.assessment_drafts for each row execute function private.validate_task2_source();
create trigger task2_source_version before insert or update on public.assessment_versions for each row execute function private.validate_task2_source();
create table private.task2_connections(student_id uuid primary key references auth.users(id), github_id bigint unique not null check(github_id>0), login text not null,revoked boolean not null default false,connected_at timestamptz not null default now());
create table private.task2_oauth_states(state_hash text primary key,verifier_hash text not null,student_id uuid not null references auth.users(id),attempt_id uuid not null references public.attempts(id),purpose text not null check(purpose in ('oauth','install')),expires_at timestamptz not null default now()+interval '10 minutes',used_at timestamptz);
create table private.task2_rates(student_id uuid not null references auth.users(id),action text not null,window_at timestamptz not null,requests int not null,primary key(student_id,action));
create table private.task2_webhooks(delivery_id text primary key,body_hash text unique not null,received_at timestamptz not null default now());
create table public.task2_repositories(attempt_id uuid primary key references public.attempts(id),student_id uuid not null references auth.users(id),repository_id bigint not null,full_name text not null,github_id bigint not null,installation_id bigint not null,status text not null default 'verified' check(status in ('verified','revoked')),stale boolean not null default false,verified_at timestamptz not null default now());
create table public.task2_checks(id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts(id),student_id uuid not null references auth.users(id),repository_id bigint,assignment_version int not null,policy_version text not null check(policy_version='github-task2-v1'),evidence jsonb not null,outcomes jsonb not null,created_at timestamptz not null default now());
create index task2_checks_attempt on public.task2_checks(attempt_id,created_at desc,id);
alter table public.task2_repositories enable row level security;
alter table public.task2_checks enable row level security;
revoke all on public.task2_repositories,public.task2_checks from public,anon,authenticated;
grant select on public.task2_repositories,public.task2_checks to authenticated;
grant all on public.task2_repositories,public.task2_checks to service_role;
create policy task2_repositories_read on public.task2_repositories for select to authenticated using(student_id=auth.uid() or public.is_instructor());
create policy task2_checks_read on public.task2_checks for select to authenticated using(student_id=auth.uid() or public.is_instructor());
create function public.task2_rate(p_student uuid,p_action text) returns boolean language plpgsql security definer set search_path='' as $$
declare count int;limit_count int:=case when p_action='check' then 3 when p_action in ('oauth','install','finish-oauth','finish-install') then 5 else 30 end;
begin
 insert into private.task2_rates values(p_student,p_action,clock_timestamp(),1) on conflict(student_id,action) do update set requests=case when private.task2_rates.window_at<clock_timestamp()-interval '1 minute' then 1 else private.task2_rates.requests+1 end,window_at=case when private.task2_rates.window_at<clock_timestamp()-interval '1 minute' then clock_timestamp() else private.task2_rates.window_at end returning requests into count;
 return count<=limit_count;
end $$;
create function public.task2_state_begin(p_student uuid,p_attempt uuid,p_hash text,p_verifier text,p_purpose text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.attempts a join public.assessment_versions v on v.assessment_id=a.assignment_id and v.version=a.assignment_version where a.id=p_attempt and a.student_id=p_student and a.status='in_progress' and v.document->>'practicalSource'='github-task2-v1') then raise exception 'Task 2 attempt ownership required';end if;
 insert into private.task2_oauth_states(state_hash,verifier_hash,student_id,attempt_id,purpose) values(p_hash,p_verifier,p_student,p_attempt,p_purpose);
end $$;
create function public.task2_state_read(p_hash text) returns jsonb language sql stable security definer set search_path='' as $$select jsonb_build_object('attemptId',s.attempt_id,'assessmentId',a.assignment_id,'purpose',s.purpose) from private.task2_oauth_states s join public.attempts a on a.id=s.attempt_id where s.state_hash=p_hash and s.used_at is null and s.expires_at>clock_timestamp() and a.status='in_progress'$$;
create function public.task2_state_consume(p_student uuid,p_attempt uuid,p_hash text,p_verifier text,p_purpose text) returns boolean language plpgsql security definer set search_path='' as $$
declare found_hash text;
begin
 update private.task2_oauth_states set used_at=clock_timestamp() where state_hash=p_hash and verifier_hash=p_verifier and student_id=p_student and attempt_id=p_attempt and purpose=p_purpose and used_at is null and expires_at>clock_timestamp() returning state_hash into found_hash;
 return found_hash is not null;
end $$;
create function public.task2_connection(p_student uuid) returns jsonb language sql stable security definer set search_path='' as $$select to_jsonb(c) from private.task2_connections c where student_id=p_student$$;
create function public.task2_connect(p_student uuid,p_github bigint,p_login text) returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.task2_connections where student_id=p_student and github_id<>p_github) then raise exception 'This student already has a different GitHub identity. Ask an instructor to investigate.';end if;
 insert into private.task2_connections(student_id,github_id,login) values(p_student,p_github,p_login) on conflict(student_id) do update set login=excluded.login,revoked=false,connected_at=now();
end $$;
create function public.task2_register(p_student uuid,p_attempt uuid,p_repository bigint,p_full_name text,p_github bigint,p_installation bigint) returns void language plpgsql security definer set search_path='' as $$
declare a public.attempts;
begin
 select * into a from public.attempts where id=p_attempt for update;
 if a.id is null or a.student_id<>p_student or a.status<>'in_progress' or (a.deadline_at is not null and a.deadline_at<=clock_timestamp()) then raise exception 'Active owned attempt required';end if;
 if not exists(select 1 from public.assessment_versions where assessment_id=a.assignment_id and version=a.assignment_version and document->>'practicalSource'='github-task2-v1') or not exists(select 1 from private.task2_connections where student_id=p_student and github_id=p_github and not revoked) then raise exception 'Connected Task 2 account required';end if;
 if exists(select 1 from public.task2_repositories where attempt_id=p_attempt and (repository_id<>p_repository or github_id<>p_github)) then raise exception 'Attempt repository identity is immutable';end if;
 if exists(select 1 from public.task2_repositories where repository_id=p_repository and student_id<>p_student) then raise exception 'Repository belongs to another student';end if;
 insert into public.task2_repositories(attempt_id,student_id,repository_id,full_name,github_id,installation_id) values(p_attempt,p_student,p_repository,p_full_name,p_github,p_installation)
 on conflict(attempt_id) do update set full_name=excluded.full_name,installation_id=excluded.installation_id,status='verified',verified_at=now();
end $$;
create function public.task2_accept(p_student uuid,p_attempt uuid,p_revision int,p_payload jsonb,p_outcomes jsonb,p_grades jsonb,p_evidence jsonb,p_finalize boolean,p_key uuid,p_new_check boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;r public.task2_repositories;result jsonb;check_id uuid;prior public.task2_checks;practical numeric;objective numeric;
begin
 select * into a from public.attempts where id=p_attempt for update;
 if a.id is null or a.student_id<>p_student or not exists(select 1 from public.assessment_versions where assessment_id=a.assignment_id and version=a.assignment_version and document->>'practicalSource'='github-task2-v1') then raise exception 'Task 2 attempt ownership required';end if;
 if a.status<>'in_progress' then
  if p_finalize and (a.idempotency_key=p_key or a.auto_submitted) then return jsonb_build_object('receipt',a.receipt,'status',a.status,'revision',a.checkpoint_revision);end if;
  raise exception 'Attempt is finalized';
 end if;
 if exists(select 1 from private.verified_checkpoints where attempt_id=p_attempt and idempotency_key=p_key) then return jsonb_build_object('revision',a.checkpoint_revision,'status','in_progress');end if;
 if p_new_check then
  select * into r from public.task2_repositories where attempt_id=p_attempt;
  if r.repository_id is null or p_evidence->>'repositoryId' is distinct from r.repository_id::text or p_evidence->>'ownerId' is distinct from r.github_id::text or p_evidence->>'policyVersion' is distinct from 'github-task2-v1' then raise exception 'Evidence identity mismatch';end if;
  check_id:=gen_random_uuid();
 else
  select * into prior from public.task2_checks where attempt_id=p_attempt order by created_at desc,id desc limit 1;
  if prior.id is not null then p_outcomes:=prior.outcomes;p_evidence:=prior.evidence;check_id:=prior.id;
  elsif exists(select 1 from jsonb_array_elements(p_outcomes) o where (o->>'earned')::numeric<>0) then raise exception 'No verified GitHub evidence';end if;
 end if;
 select coalesce(sum((o->>'earned')::numeric),0) into practical from jsonb_array_elements(p_outcomes) o;
 select coalesce(sum((o->>'points')::numeric),0) into objective from jsonb_array_elements(p_grades) o;
 result:=private.accept_assessment_checkpoint(p_student,p_attempt,p_revision,p_payload||jsonb_build_object('githubCheckId',check_id),p_outcomes,p_grades,practical,objective,p_finalize,p_key);
 if coalesce((result->>'expired')::boolean,false) then return result;end if;
 if p_new_check and coalesce((result->>'expired')::boolean,false)=false then
  insert into public.task2_checks(id,attempt_id,student_id,repository_id,assignment_version,policy_version,evidence,outcomes) values(check_id,p_attempt,p_student,r.repository_id,a.assignment_version,'github-task2-v1',p_evidence,p_outcomes);
  update public.task2_repositories set stale=false,verified_at=now() where attempt_id=p_attempt;
 end if;
 return result||jsonb_build_object('checkId',check_id);
end $$;
create function public.task2_webhook(p_delivery text,p_hash text,p_event text,p_body jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare inserted text;
begin
 insert into private.task2_webhooks(delivery_id,body_hash) values(p_delivery,p_hash) on conflict do nothing returning delivery_id into inserted;
 if inserted is null then return false;end if;
 if p_event='github_app_authorization' and p_body->>'action'='revoked' then update private.task2_connections set revoked=true where github_id=(p_body->'sender'->>'id')::bigint;end if;
 if p_event='installation' and p_body->>'action' in ('deleted','suspend') then update public.task2_repositories set status='revoked',stale=true where installation_id=(p_body->'installation'->>'id')::bigint;
 elsif p_event='installation_repositories' then update public.task2_repositories set status='revoked',stale=true where installation_id=(p_body->'installation'->>'id')::bigint and repository_id in (select (value->>'id')::bigint from jsonb_array_elements(coalesce(p_body->'repositories_removed','[]')));
 else update public.task2_repositories set stale=true where repository_id=(p_body->'repository'->>'id')::bigint;end if;
 return true;
end $$;
revoke all on function public.task2_rate(uuid,text),public.task2_state_begin(uuid,uuid,text,text,text),public.task2_state_read(text),public.task2_state_consume(uuid,uuid,text,text,text),public.task2_connection(uuid),public.task2_connect(uuid,bigint,text),public.task2_register(uuid,uuid,bigint,text,bigint,bigint),public.task2_accept(uuid,uuid,int,jsonb,jsonb,jsonb,jsonb,boolean,uuid,boolean),public.task2_webhook(text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.task2_rate(uuid,text),public.task2_state_begin(uuid,uuid,text,text,text),public.task2_state_read(text),public.task2_state_consume(uuid,uuid,text,text,text),public.task2_connection(uuid),public.task2_connect(uuid,bigint,text),public.task2_register(uuid,uuid,bigint,text,bigint,bigint),public.task2_accept(uuid,uuid,int,jsonb,jsonb,jsonb,jsonb,boolean,uuid,boolean),public.task2_webhook(text,text,text,jsonb) to service_role;
