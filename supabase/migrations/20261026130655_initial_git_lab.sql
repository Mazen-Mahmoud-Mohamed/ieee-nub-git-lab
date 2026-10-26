-- Dedicated application schema. Never apply to an unrelated project.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.instructors (user_id uuid primary key references auth.users(id) on delete cascade, created_at timestamptz not null default now());
alter table private.instructors enable row level security;
create function public.is_instructor() returns boolean language sql stable security definer set search_path = '' as $$ select exists(select 1 from private.instructors where user_id=(select auth.uid())) $$;
revoke all on function public.is_instructor() from public, anon;
grant execute on function public.is_instructor() to authenticated;

create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null check(length(trim(full_name)) between 2 and 120),student_id text not null check(length(student_id) between 1 and 60),university text not null check(length(university) between 1 and 120),department text not null check(length(department) between 1 and 120),academic_year text not null check(length(academic_year) between 1 and 30),created_at timestamptz not null default now());
create table public.assignments(id uuid primary key default gen_random_uuid(),version int not null default 1 check(version>0),title text not null,description text not null default '',objectives jsonb not null default '[]',visible boolean not null default false,starts_at timestamptz,deadline timestamptz,allow_retake boolean not null default false,review_answers boolean not null default true,created_at timestamptz not null default now(),check(deadline is null or starts_at is null or deadline>starts_at));
create table public.assignment_sections(id uuid primary key default gen_random_uuid(),assignment_id uuid not null references public.assignments on delete cascade,position int not null,title text not null,points numeric not null check(points>=0),bonus boolean not null default false,unique(assignment_id,position));
create table public.assignment_tasks(id uuid primary key default gen_random_uuid(),section_id uuid not null references public.assignment_sections on delete cascade,task_key text not null,instructions text not null,points numeric not null check(points>=0));
create table public.questions(id text primary key,assignment_id uuid not null references public.assignments on delete cascade,position int not null,prompt text not null,kind text not null check(kind in ('short','long','scenario','single','multiple','interpretation')),points numeric not null check(points>=0),options jsonb not null default '[]',required boolean not null default true,unique(assignment_id,position));
create table private.question_rubrics(question_id text primary key references public.questions on delete cascade,rubric text not null default '',answer_key jsonb);
alter table private.question_rubrics enable row level security;
create table public.student_enrollments(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles on delete cascade,assignment_id uuid not null references public.assignments on delete cascade,retakes_remaining int not null default 0 check(retakes_remaining>=0),created_at timestamptz not null default now(),unique(student_id,assignment_id));
create table public.attempts(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles,assignment_id uuid not null references public.assignments,assignment_version int not null,status text not null default 'in_progress' check(status in ('in_progress','submitted','graded')),attempt_number int not null default 1,receipt uuid unique,created_at timestamptz not null default now(),submitted_at timestamptz,idempotency_key uuid unique,unique(student_id,assignment_id,attempt_number));
create unique index one_open_attempt on public.attempts(student_id,assignment_id) where status='in_progress';
create index attempts_assignment_status on public.attempts(assignment_id,status);
create index attempts_student on public.attempts(student_id);
create table public.workspace_snapshots(id uuid primary key default gen_random_uuid(),attempt_id uuid not null unique references public.attempts on delete cascade,version int not null default 1,snapshot jsonb not null,created_at timestamptz not null default now(),check(octet_length(snapshot::text)<=9000000));
create table public.command_events(id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts on delete cascade,sequence int not null,event jsonb not null,created_at timestamptz not null default now(),unique(attempt_id,sequence));
create table public.task_results(id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts on delete cascade,task_key text not null,passed boolean not null,points numeric not null check(points between 0 and 20),unique(attempt_id,task_key));
create table public.student_answers(id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts on delete cascade,question_id text not null,answer text not null check(length(answer)<=8000),created_at timestamptz not null default now(),unique(attempt_id,question_id));
create table public.grading_results(id uuid primary key default gen_random_uuid(),attempt_id uuid not null references public.attempts on delete cascade,question_id text not null references public.questions,points numeric not null check(points>=0),grader_id uuid not null references auth.users,updated_at timestamptz not null default now(),unique(attempt_id,question_id));
create table public.grading_summaries(id uuid primary key default gen_random_uuid(),attempt_id uuid not null unique references public.attempts on delete cascade,practical_score numeric not null check(practical_score between 0 and 85),theory_score numeric check(theory_score between 0 and 25),feedback text not null default '',released boolean not null default false,created_at timestamptz not null default now());
create table public.audit_logs(id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users on delete set null,action text not null,target_id text,created_at timestamptz not null default now());
create table public.app_settings(id boolean primary key default true check(id),accessibility_paste boolean not null default false,retention_days int not null default 365 check(retention_days>=30));
create table private.rate_limits(user_id uuid primary key references auth.users on delete cascade,window_start timestamptz not null default now(),requests int not null default 0);
alter table private.rate_limits enable row level security;

do $$ declare t text; begin foreach t in array array['profiles','assignments','assignment_sections','assignment_tasks','questions','student_enrollments','attempts','workspace_snapshots','command_events','task_results','student_answers','grading_results','grading_summaries','audit_logs','app_settings'] loop execute format('alter table public.%I enable row level security',t); execute format('revoke all on public.%I from anon, authenticated',t); execute format('grant select on public.%I to authenticated',t); end loop; end $$;
grant insert,update on public.profiles to authenticated;
create policy profile_read on public.profiles for select to authenticated using(id=(select auth.uid()) or (select public.is_instructor()));
create policy profile_insert on public.profiles for insert to authenticated with check(id=(select auth.uid()));
create policy profile_update on public.profiles for update to authenticated using(id=(select auth.uid())) with check(id=(select auth.uid()));
create policy assignments_read on public.assignments for select to authenticated using(visible or (select public.is_instructor()));
create policy sections_read on public.assignment_sections for select to authenticated using(exists(select 1 from public.assignments a where a.id=assignment_id));
create policy tasks_read on public.assignment_tasks for select to authenticated using(exists(select 1 from public.assignment_sections s where s.id=section_id));
create policy questions_read on public.questions for select to authenticated using(exists(select 1 from public.assignments a where a.id=assignment_id));
create policy enrollment_read on public.student_enrollments for select to authenticated using(student_id=(select auth.uid()) or (select public.is_instructor()));
create policy attempt_read on public.attempts for select to authenticated using(student_id=(select auth.uid()) or (select public.is_instructor()));
create policy snapshot_read on public.workspace_snapshots for select to authenticated using((select public.is_instructor()) or exists(select 1 from public.attempts a join public.assignments s on s.id=a.assignment_id where a.id=attempt_id and a.student_id=(select auth.uid()) and s.review_answers));
create policy events_read on public.command_events for select to authenticated using((select public.is_instructor()) or exists(select 1 from public.attempts a where a.id=attempt_id and a.student_id=(select auth.uid())));
create policy results_read on public.task_results for select to authenticated using((select public.is_instructor()));
create policy answers_read on public.student_answers for select to authenticated using((select public.is_instructor()) or exists(select 1 from public.attempts a join public.assignments s on s.id=a.assignment_id where a.id=attempt_id and a.student_id=(select auth.uid()) and s.review_answers));
create policy grading_read on public.grading_results for select to authenticated using((select public.is_instructor()));
create policy summaries_read on public.grading_summaries for select to authenticated using((select public.is_instructor()) or (released and exists(select 1 from public.attempts a where a.id=attempt_id and a.student_id=(select auth.uid()))));
create policy audit_read on public.audit_logs for select to authenticated using((select public.is_instructor()));
create policy settings_read on public.app_settings for select to authenticated using(true);
create view public.released_results with (security_invoker=true) as select g.attempt_id,g.practical_score,g.theory_score,g.feedback,g.released from public.grading_summaries g where g.released;
grant select on public.released_results to authenticated;

create function public.start_attempt(p_assignment uuid) returns public.attempts language plpgsql security definer set search_path='' as $$
declare actor uuid := auth.uid(); a public.assignments; last_attempt public.attempts; allowed int;
begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email_confirmed_at is not null) then raise exception 'Verified sign in required'; end if;
 if not exists(select 1 from public.profiles where id=actor) then raise exception 'Complete your profile first'; end if;
 select * into a from public.assignments where id=p_assignment;
 if a.id is null or not a.visible or (a.starts_at is not null and a.starts_at>now()) or (a.deadline is not null and a.deadline<now()) then raise exception 'Assignment is not open'; end if;
 insert into public.student_enrollments(student_id,assignment_id) values(actor,p_assignment) on conflict do nothing;
 select retakes_remaining into allowed from public.student_enrollments where student_id=actor and assignment_id=p_assignment for update;
 select * into last_attempt from public.attempts where student_id=actor and assignment_id=p_assignment order by attempt_number desc limit 1;
 if last_attempt.id is not null and (last_attempt.status='in_progress' or (allowed=0 and not a.allow_retake)) then return last_attempt; end if;
 if last_attempt.id is not null and allowed>0 then update public.student_enrollments set retakes_remaining=retakes_remaining-1 where student_id=actor and assignment_id=p_assignment; end if;
 insert into public.attempts(student_id,assignment_id,assignment_version,attempt_number) values(actor,p_assignment,a.version,coalesce(last_attempt.attempt_number,0)+1) returning * into last_attempt;
 return last_attempt;
end $$;

-- Called only after the Edge Function has authenticated the caller and verified every Git object.
create function public.finalize_verified(p_student uuid,p_attempt uuid,p_key uuid,p_snapshot jsonb,p_answers jsonb,p_events jsonb,p_results jsonb,p_score numeric) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.attempts; settings public.assignments; item jsonb; reference uuid;
begin
 if current_user <> 'postgres' and session_user <> 'postgres' and coalesce(auth.role(),'') <> 'service_role' then raise exception 'Trusted service required'; end if;
 select * into a from public.attempts where id=p_attempt for update;
 if a.id is null or a.student_id<>p_student then raise exception 'Attempt ownership mismatch'; end if;
 if a.status<>'in_progress' then if a.idempotency_key=p_key then return a.receipt; else raise exception 'Attempt already finalized'; end if; end if;
 select * into settings from public.assignments where id=a.assignment_id;
 if not settings.visible or (settings.starts_at is not null and settings.starts_at>now()) or (settings.deadline is not null and settings.deadline<now()) or settings.version<>a.assignment_version then raise exception 'Submission window or version is invalid'; end if;
 if p_score<75 or p_score>85 or jsonb_typeof(p_snapshot)<>'object' then raise exception 'Invalid verified payload'; end if;
 reference:=gen_random_uuid();
 insert into public.workspace_snapshots(attempt_id,snapshot) values(p_attempt,p_snapshot);
 for item in select value from jsonb_array_elements(p_results) loop insert into public.task_results(attempt_id,task_key,passed,points) values(p_attempt,item->>'id',(item->>'passed')::boolean,case when (item->>'passed')::boolean then (item->>'points')::numeric else 0 end); end loop;
 for item in select value from jsonb_array_elements(p_events) loop insert into public.command_events(attempt_id,sequence,event) values(p_attempt,(item->>'sequence')::int,item); end loop;
 insert into public.student_answers(attempt_id,question_id,answer) select p_attempt,key,value from jsonb_each_text(p_answers);
 insert into public.grading_summaries(attempt_id,practical_score) values(p_attempt,p_score);
 update public.attempts set status='submitted',receipt=reference,submitted_at=now(),idempotency_key=p_key where id=p_attempt;
 insert into public.audit_logs(actor_id,action,target_id) values(p_student,'submission.verified',p_attempt::text);
 return reference;
end $$;
revoke all on function public.finalize_verified(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,numeric) from public,anon,authenticated;
grant execute on function public.finalize_verified(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,numeric) to service_role;

create function public.check_submission_rate(p_student uuid) returns boolean language plpgsql security definer set search_path='' as $$
declare n int; begin
 insert into private.rate_limits(user_id,requests) values(p_student,1) on conflict(user_id) do update set requests=case when private.rate_limits.window_start<now()-interval '1 minute' then 1 else private.rate_limits.requests+1 end,window_start=case when private.rate_limits.window_start<now()-interval '1 minute' then now() else private.rate_limits.window_start end returning requests into n; return n<=8;
end $$;
revoke all on function public.check_submission_rate(uuid) from public,anon,authenticated;
grant execute on function public.check_submission_rate(uuid) to service_role;

create function public.grade_attempt(p_attempt uuid,p_grades jsonb,p_feedback text,p_release boolean) returns void language plpgsql security definer set search_path='' as $$
declare a public.attempts; item jsonb; max_points numeric; total numeric:=0; seen text[]:='{}'; expected int;
begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required'; end if;
 select * into a from public.attempts where id=p_attempt for update;
 if a.id is null or a.status='in_progress' then raise exception 'Finalized attempt required'; end if;
 if length(p_feedback)>5000 or jsonb_typeof(p_grades)<>'array' then raise exception 'Invalid grade payload'; end if;
 select count(*) into expected from public.questions where assignment_id=a.assignment_id;
 if jsonb_array_length(p_grades)<>expected then raise exception 'Grade every required question'; end if;
 for item in select value from jsonb_array_elements(p_grades) loop
  select points into max_points from public.questions where id=item->>'question_id' and assignment_id=a.assignment_id;
  if max_points is null or item->>'question_id'=any(seen) or (item->>'points') is null or (item->>'points')::numeric<0 or (item->>'points')::numeric>max_points then raise exception 'Invalid per-question grade'; end if;
  seen:=array_append(seen,item->>'question_id'); total:=total+(item->>'points')::numeric;
  insert into public.grading_results(attempt_id,question_id,points,grader_id) values(p_attempt,item->>'question_id',(item->>'points')::numeric,auth.uid()) on conflict(attempt_id,question_id) do update set points=excluded.points,grader_id=excluded.grader_id,updated_at=now();
 end loop;
 update public.grading_summaries set theory_score=total,feedback=p_feedback,released=p_release where attempt_id=p_attempt;
 update public.attempts set status='graded' where id=p_attempt;
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),case when p_release then 'grade.published' else 'grade.saved' end,p_attempt::text);
end $$;
create function public.approve_retake(p_attempt uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.attempts; begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required'; end if;
 select * into a from public.attempts where id=p_attempt;
 if a.id is null or a.status='in_progress' then raise exception 'Finalized attempt required'; end if;
 update public.student_enrollments set retakes_remaining=1 where student_id=a.student_id and assignment_id=a.assignment_id;
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'retake.approved',p_attempt::text);
end $$;
create function public.manage_assignment(p_assignment uuid,p_title text,p_visible boolean,p_starts_at timestamptz,p_deadline timestamptz,p_allow_retake boolean,p_review_answers boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required'; end if;
 if length(trim(p_title)) not between 1 and 180 then raise exception 'Invalid title'; end if;
 update public.assignments set title=p_title,visible=p_visible,starts_at=p_starts_at,deadline=p_deadline,allow_retake=p_allow_retake,review_answers=p_review_answers where id=p_assignment;
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'assignment.updated',p_assignment::text);
end $$;
create function public.get_question_rubric(p_question text) returns text language plpgsql security definer set search_path='' as $$ declare result text; begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required'; end if;
 select rubric into result from private.question_rubrics where question_id=p_question;return coalesce(result,'');end $$;
create function public.set_question_rubric(p_question text,p_rubric text) returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required'; end if;
 if length(p_rubric)>5000 then raise exception 'Rubric too long'; end if;
 insert into private.question_rubrics(question_id,rubric) values(p_question,p_rubric) on conflict(question_id) do update set rubric=excluded.rubric;
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'rubric.updated',p_question);end $$;
create function public.update_settings(p_paste boolean) returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required'; end if;
 update public.app_settings set accessibility_paste=p_paste where id=true;
 insert into public.audit_logs(actor_id,action) values(auth.uid(),'accessibility.updated');end $$;

-- PostgreSQL grants function execution to PUBLIC by default: explicitly close every RPC.
revoke execute on function public.start_attempt(uuid),public.grade_attempt(uuid,jsonb,text,boolean),public.approve_retake(uuid),public.manage_assignment(uuid,text,boolean,timestamptz,timestamptz,boolean,boolean),public.get_question_rubric(text),public.set_question_rubric(text,text),public.update_settings(boolean) from public,anon;
grant execute on function public.start_attempt(uuid),public.grade_attempt(uuid,jsonb,text,boolean),public.approve_retake(uuid),public.manage_assignment(uuid,text,boolean,timestamptz,timestamptz,boolean,boolean),public.get_question_rubric(text),public.set_question_rubric(text,text),public.update_settings(boolean) to authenticated;
create index enrollments_assignment on public.student_enrollments(assignment_id);
create index sections_assignment on public.assignment_sections(assignment_id);
create index tasks_section on public.assignment_tasks(section_id);
create index questions_assignment on public.questions(assignment_id);
create index grading_grader on public.grading_results(grader_id);
create index audit_actor on public.audit_logs(actor_id);
create index audit_time on public.audit_logs(created_at);

-- Manual checkpoints are untrusted recovery data, never grading evidence.
create table public.workspace_drafts(id uuid primary key default gen_random_uuid(),attempt_id uuid not null unique references public.attempts on delete cascade,payload jsonb not null,updated_at timestamptz not null default now(),check(octet_length(payload::text)<=9000000));
alter table public.workspace_drafts enable row level security;
revoke all on public.workspace_drafts from anon,authenticated;
grant select on public.workspace_drafts to authenticated;
create policy draft_read on public.workspace_drafts for select to authenticated using((select public.is_instructor()) or exists(select 1 from public.attempts a where a.id=attempt_id and a.student_id=(select auth.uid())));
create function public.save_checkpoint(p_attempt uuid,p_payload jsonb) returns void language plpgsql security definer set search_path='' as $$
declare a public.attempts; begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into a from public.attempts where id=p_attempt for update;
 if a.id is null or a.student_id<>auth.uid() or a.status<>'in_progress' then raise exception 'Open owned attempt required'; end if;
 if octet_length(p_payload::text)>9000000 or p_payload->>'version'<>'1' then raise exception 'Invalid checkpoint'; end if;
 insert into public.workspace_drafts(attempt_id,payload) values(p_attempt,p_payload) on conflict(attempt_id) do update set payload=excluded.payload,updated_at=now();
end $$;
revoke all on function public.save_checkpoint(uuid,jsonb) from public,anon;
grant execute on function public.save_checkpoint(uuid,jsonb) to authenticated;
