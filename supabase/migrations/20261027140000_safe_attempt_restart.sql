-- Recovery creates a new policy-controlled attempt; old evidence is never deleted.
alter table public.attempts add column restarted_to uuid unique references public.attempts(id);
alter table public.attempts drop constraint attempts_status_check;
alter table public.attempts add constraint attempts_status_check
  check(status in ('in_progress','submitted','pending_review','graded','expired','restarted'));

create function public.restart_assessment(p_attempt uuid, p_revision int) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid:=auth.uid(); old_attempt public.attempts; result jsonb;
begin
  if actor is null or not private.student_profile_complete(actor) then
    raise exception 'Complete your verified student profile before restarting';
  end if;
  select * into old_attempt from public.attempts where id=p_attempt;
  if old_attempt.id is null or old_attempt.student_id<>actor then raise exception 'Attempt not authorized'; end if;
  -- Same lock order as start_assessment. Serialize restarts/starts for this enrollment.
  perform 1 from public.assignments where id=old_attempt.assignment_id for share;
  perform 1 from public.student_enrollments where student_id=actor and assignment_id=old_attempt.assignment_id for update;
  select * into old_attempt from public.attempts where id=p_attempt for update;
  if old_attempt.restarted_to is not null then return jsonb_build_object('id',old_attempt.restarted_to); end if;
  if old_attempt.status<>'in_progress' or old_attempt.receipt is not null then raise exception 'Submitted or finalized attempts cannot be restarted'; end if;
  if (select type from public.assignments where id=old_attempt.assignment_id)<>'assignment' then raise exception 'Active exams cannot be restarted. Ask your instructor about retake policy.'; end if;
  if old_attempt.deadline_at is not null and old_attempt.deadline_at<=clock_timestamp() then raise exception 'Deadline reached. This attempt cannot be restarted.'; end if;
  if p_revision is null or p_revision<>old_attempt.checkpoint_revision then raise exception 'Checkpoint conflict: refresh before restarting'; end if;
  -- This update and the existing policy-controlled start are one transaction.
  -- A limit/deadline/policy denial rolls back everything, including this status.
  update public.attempts set status='restarted' where id=p_attempt;
  result:=public.start_assessment(old_attempt.assignment_id);
  update public.attempts set restarted_to=(result->>'id')::uuid where id=p_attempt;
  insert into public.audit_logs(actor_id,action,target_id) values(actor,'attempt.restarted',p_attempt::text);
  return result;
end $$;
revoke all on function public.restart_assessment(uuid,int) from public,anon;
grant execute on function public.restart_assessment(uuid,int) to authenticated;

create function private.protect_restarted_attempt() returns trigger language plpgsql set search_path='' as $$begin
  if old.status='restarted' and old.restarted_to is not null and new is distinct from old then raise exception 'Restarted attempt evidence is read only'; end if;
  return new;
end $$;
create trigger protect_restarted_attempt before update on public.attempts for each row execute function private.protect_restarted_attempt();
create function private.reject_restarted_grade_draft() returns trigger language plpgsql security definer set search_path='' as $$begin
  if exists(select 1 from public.attempts where id=new.attempt_id and status='restarted') then raise exception 'Restarted attempts cannot be graded'; end if;
  return new;
end $$;
create trigger reject_restarted_grade_draft before insert or update on private.grading_drafts for each row execute function private.reject_restarted_grade_draft();

create or replace function public.assessment_state(p_attempt uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare a public.attempts;doc jsonb;c private.verified_checkpoints;begin
 select * into a from public.attempts where id=p_attempt for update;if a.id is null or auth.uid() is null or (a.student_id<>auth.uid() and not public.is_instructor()) then raise exception 'Attempt not authorized';end if;
 if a.status='in_progress' and a.deadline_at is not null and a.deadline_at<=clock_timestamp() then perform private.finish_assessment(a.id,true);select * into a from public.attempts where id=p_attempt;end if;
 select document into doc from public.assessment_versions where assessment_id=a.assignment_id and version=a.assignment_version;select * into c from private.verified_checkpoints where attempt_id=a.id;
 if c.attempt_id is null and a.status not in ('in_progress','restarted') then c.payload:=jsonb_build_object('snapshot',(select snapshot from public.workspace_snapshots where attempt_id=a.id),'answers',coalesce((select jsonb_object_agg(question_id,answer) from public.student_answers where attempt_id=a.id),'{}'),'events',coalesce((select jsonb_agg(event order by sequence) from public.command_events where attempt_id=a.id),'[]'),'cwd','/','config','{}'::jsonb);end if;
 return to_jsonb(a)||jsonb_build_object('server_now',clock_timestamp(),'definition',doc,'payload',case when a.status='in_progress' or public.is_instructor() or coalesce((doc->>'reviewAnswers')::boolean,true) then c.payload else null end);
end $$;

create or replace function public.instructor_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 return jsonb_build_object(
 'students',(select count(*) from auth.users u where not exists(select 1 from private.instructors i where i.user_id=u.id) or exists(select 1 from public.profiles p where p.id=u.id)),
 'started_students',(select count(distinct student_id) from public.attempts),
 'submitted_assignments',(select count(*) from private.admin_attempt_rows where status not in ('in_progress','restarted') and assignments->>'type'='assignment'),
 'submitted_exams',(select count(*) from private.admin_attempt_rows where status not in ('in_progress','restarted') and assignments->>'type'='exam'),
 'in_progress',(select count(*) from public.attempts where status='in_progress'),
 'pending_reviews',(select count(*) from public.attempts where status in ('submitted','pending_review','expired')),
 'graded',(select count(*) from public.attempts where status='graded'),
 'published_assignments',(select count(*) from public.assignments where type='assignment' and visible and not archived),
 'published_exams',(select count(*) from public.assignments where type='exam' and visible and not archived));
end $$;

create or replace function public.instructor_students(p_search text default '',p_faculty text default '',p_offset int default 0,p_limit int default 25,p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 or length(p_search)>200 then raise exception 'Invalid page';end if;
 with filtered as (
 select u.id,p.full_name,u.email,p.phone,p.faculty,p.student_id,u.created_at,
 (select count(*) from public.attempts a where a.student_id=u.id) as started,
 (select count(*) from public.attempts a where a.student_id=u.id and a.status not in ('in_progress','restarted')) as submissions
 from auth.users u left join public.profiles p on p.id=u.id
 where (not exists(select 1 from private.instructors i where i.user_id=u.id) or p.id is not null)
 and (p_id is null or u.id=p_id) and (p_faculty='' or p.faculty=p_faculty)
 and (p_search='' or concat_ws(' ',p.full_name,u.email,p.student_id) ilike '%'||p_search||'%')
 ),page as (select * from filtered order by created_at desc,id desc offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;

create or replace function public.instructor_attempts(p_search text default '',p_faculty text default '',p_type text default '',p_assessment uuid default null,p_student uuid default null,p_status text default '',p_from timestamptz default null,p_to timestamptz default null,p_offset int default 0,p_limit int default 25,p_submitted_only boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 or length(p_search)>200 then raise exception 'Invalid page';end if;
 with filtered as (
 select * from private.admin_attempt_rows r
 where (not p_submitted_only or r.status not in ('in_progress','restarted')) and (p_student is null or r.student_id=p_student) and (p_assessment is null or r.assignment_id=p_assessment)
 and (p_type='' or r.assignments->>'type'=p_type) and (p_faculty='' or r.profiles->>'faculty'=p_faculty)
 and (p_status='' or r.status=p_status or (p_status='pending_review' and r.status in ('submitted','pending_review','expired')))
 and (p_from is null or coalesce(r.submitted_at,r.created_at)>=p_from) and (p_to is null or coalesce(r.submitted_at,r.created_at)<p_to)
 and (p_search='' or concat_ws(' ',r.profiles->>'full_name',r.profiles->>'email',r.profiles->>'student_id') ilike '%'||p_search||'%')
 ),page as (select * from filtered order by created_at desc,id desc offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;
-- Existing instructor-only approval is also usable before an assignment is submitted.
-- It grants one normal retake credit; it does not reset or finalize any work.
create or replace function public.approve_retake(p_attempt uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.attempts; begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required'; end if;
 select * into a from public.attempts where id=p_attempt;
 if a.id is null or (a.status='in_progress' and (select type from public.assignments where id=a.assignment_id)<>'assignment') then raise exception 'Active exams require finalization before retake approval';end if;
 update public.student_enrollments set retakes_remaining=1 where student_id=a.student_id and assignment_id=a.assignment_id;
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'retake.approved',p_attempt::text);
end $$;
revoke all on function private.protect_restarted_attempt(),private.reject_restarted_grade_draft() from public,anon,authenticated;
