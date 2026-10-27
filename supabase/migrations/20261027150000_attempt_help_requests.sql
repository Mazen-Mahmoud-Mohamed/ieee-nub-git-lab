-- Student-requested recovery. Existing attempts, grades and published versions are untouched.
create table public.attempt_help_requests(
 id uuid primary key default gen_random_uuid(),
 attempt_id uuid not null unique references public.attempts(id),
 student_id uuid not null references public.profiles(id),
 message text not null check(length(message) between 1 and 500),
 status text not null default 'pending' check(status in ('pending','approved','rejected')),
 reply text not null default '' check(length(reply)<=500),
 created_at timestamptz not null default now(),
 resolved_at timestamptz,
 resolved_by uuid references auth.users(id)
);
alter table public.attempt_help_requests enable row level security;
revoke all on public.attempt_help_requests from public,anon,authenticated;
grant select on public.attempt_help_requests to authenticated;
create policy attempt_help_read on public.attempt_help_requests for select to authenticated
 using(student_id=(select auth.uid()) or (select public.is_instructor()));
create index attempt_help_queue on public.attempt_help_requests(status,created_at,id);

create function public.attempt_recovery_state(p_attempt uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare a public.attempts;s public.assignments;doc jsonb;code text;credits int;used int;request jsonb;
begin
 select * into a from public.attempts where id=p_attempt;
 if auth.uid() is null or a.id is null or (a.student_id<>auth.uid() and not public.is_instructor()) then raise exception 'Attempt not authorized';end if;
 select * into s from public.assignments where id=a.assignment_id;
 select document into doc from public.assessment_versions where assessment_id=s.id and version=s.published_version;
 select coalesce(retakes_remaining,0) into credits from public.student_enrollments where student_id=a.student_id and assignment_id=a.assignment_id;
 select count(*) into used from public.attempts where student_id=a.student_id and assignment_id=a.assignment_id;
 select to_jsonb(r)-'student_id'-'resolved_by' into request from public.attempt_help_requests r where attempt_id=a.id;
 code:=case
 when a.status='restarted' then 'restarted'
 when a.status<>'in_progress' or a.receipt is not null then 'finalized'
 when s.type='exam' then 'exam'
 when (a.deadline_at is not null and a.deadline_at<=now()) or nullif(doc->>'deadline','')::timestamptz<=now() or nullif(doc->>'endsAt','')::timestamptz<=now() then 'deadline'
 when not s.visible or s.archived or doc is null or nullif(doc->>'startsAt','')::timestamptz>now() then 'closed'
 when not private.student_profile_complete(a.student_id) then 'profile'
 when used>=coalesce((doc->>'attemptLimit')::int,1) and coalesce(credits,0)<=0 then 'attempt_limit'
 else 'available' end;
 return jsonb_build_object('code',code,'canRestart',code='available','canRequest',code='attempt_limit' and request is null,'request',request,'successor',a.restarted_to);
end $$;

create function public.request_attempt_help(p_attempt uuid,p_message text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;state jsonb;r public.attempt_help_requests;
begin
 select * into a from public.attempts where id=p_attempt;
 if auth.uid() is null or a.id is null or a.student_id<>auth.uid() then raise exception 'Attempt not authorized';end if;
 perform 1 from public.assignments where id=a.assignment_id for share;
 perform 1 from public.student_enrollments where student_id=a.student_id and assignment_id=a.assignment_id for update;
 perform 1 from public.attempts where id=a.id for update;
 select * into r from public.attempt_help_requests where attempt_id=a.id;
 if r.id is not null then return to_jsonb(r)-'student_id'-'resolved_by';end if;
 state:=public.attempt_recovery_state(a.id);
 if not (state->>'canRequest')::boolean then raise exception 'A request is not available for this attempt';end if;
 if p_message is null or length(p_message)>500 then raise exception 'Keep your message under 500 characters';end if;
 insert into public.attempt_help_requests(attempt_id,student_id,message)
 values(a.id,a.student_id,coalesce(nullif(trim(p_message),''),'I need help starting over after a Git history mistake.')) returning * into r;
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'recovery.requested',r.id::text);
 return to_jsonb(r)-'student_id'-'resolved_by';
end $$;

create function public.resolve_attempt_help(p_request uuid,p_approve boolean,p_reply text default '') returns void language plpgsql security definer set search_path='' as $$
declare r public.attempt_help_requests;a public.attempts;state jsonb;
begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_approve is null or p_reply is null or length(p_reply)>500 then raise exception 'Invalid response';end if;
 select * into r from public.attempt_help_requests where id=p_request;
 if r.id is null then raise exception 'Request not found';end if;
 select * into a from public.attempts where id=r.attempt_id;
 perform 1 from public.assignments where id=a.assignment_id for share;
 perform 1 from public.student_enrollments where student_id=a.student_id and assignment_id=a.assignment_id for update;
 perform 1 from public.attempts where id=a.id for update;
 select * into r from public.attempt_help_requests where id=p_request for update;
 if r.status<>'pending' then raise exception 'This request has already been answered';end if;
 if p_approve then
  state:=public.attempt_recovery_state(a.id);
  if state->>'code' not in ('attempt_limit','available') then raise exception 'The assessment is no longer eligible for another attempt';end if;
  if state->>'code'='attempt_limit' then perform public.approve_retake(a.id);end if;
 end if;
 update public.attempt_help_requests set status=case when p_approve then 'approved' else 'rejected' end,reply=trim(p_reply),resolved_at=clock_timestamp(),resolved_by=auth.uid() where id=r.id;
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),case when p_approve then 'recovery.approved' else 'recovery.rejected' end,r.id::text);
end $$;

create function public.instructor_help_requests(p_status text default 'pending',p_offset int default 0,p_limit int default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_status is null or p_status not in ('','pending','approved','rejected') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid request filters';end if;
 with filtered as (
 select r.*,p.full_name,u.email,v.document->>'title' as title,a.assignment_id,a.status as attempt_status,a.attempt_number
 from public.attempt_help_requests r join public.attempts a on a.id=r.attempt_id join public.profiles p on p.id=r.student_id join auth.users u on u.id=r.student_id join public.assessment_versions v on v.assessment_id=a.assignment_id and v.version=a.assignment_version
 where p_status='' or r.status=p_status
 ),page as(select * from filtered order by created_at,id offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page)||jsonb_build_object('recovery_code',public.attempt_recovery_state(page.attempt_id)->>'code') order by created_at,id) from page),'[]')) into result;return result;
end $$;
revoke all on function public.attempt_recovery_state(uuid),public.request_attempt_help(uuid,text),public.resolve_attempt_help(uuid,boolean,text),public.instructor_help_requests(text,int,int) from public,anon;
grant execute on function public.attempt_recovery_state(uuid),public.request_attempt_help(uuid,text),public.resolve_attempt_help(uuid,boolean,text),public.instructor_help_requests(text,int,int) to authenticated;
