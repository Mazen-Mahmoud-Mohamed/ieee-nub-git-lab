-- Instructor-only, bounded reads. Existing evidence, RLS and published versions are retained.
create index if not exists attempts_admin_order on public.attempts(created_at desc,id desc);
create index if not exists attempts_admin_student on public.attempts(student_id,created_at desc,id desc);
create table private.grading_drafts(attempt_id uuid primary key references public.attempts on delete cascade,grades jsonb not null,feedback text not null,updated_at timestamptz not null default now());
alter table private.grading_drafts enable row level security;
revoke all on private.grading_drafts from public,anon,authenticated;

create view private.admin_attempt_rows as
 select a.*,jsonb_build_object('full_name',coalesce(a.identity_snapshot->>'full_name',p.full_name),'email',case when a.identity_snapshot is not null then a.identity_snapshot->>'email' else u.email end,'phone',case when a.identity_snapshot is not null then a.identity_snapshot->>'phone' else p.phone end,'faculty',case when a.identity_snapshot is not null then a.identity_snapshot->>'faculty' else p.faculty end,'student_id',coalesce(a.identity_snapshot->>'student_id',p.student_id),'department',p.department,'academic_year',p.academic_year) as profiles,
 jsonb_build_object('title',coalesce(v.document->>'title',s.title),'type',coalesce(v.document->>'type',s.type)) as assignments,
 g.practical_score,g.theory_score,coalesce(g.released,false) as released,g.feedback
 from public.attempts a left join public.profiles p on p.id=a.student_id left join auth.users u on u.id=a.student_id join public.assignments s on s.id=a.assignment_id left join public.assessment_versions v on v.assessment_id=a.assignment_id and v.version=a.assignment_version left join public.grading_summaries g on g.attempt_id=a.id;
revoke all on private.admin_attempt_rows from public,anon,authenticated;

create function public.instructor_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 return jsonb_build_object(
 'students',(select count(*) from auth.users u where not exists(select 1 from private.instructors i where i.user_id=u.id) or exists(select 1 from public.profiles p where p.id=u.id)),
 'started_students',(select count(distinct student_id) from public.attempts),
 'submitted_assignments',(select count(*) from private.admin_attempt_rows where status<>'in_progress' and assignments->>'type'='assignment'),
 'submitted_exams',(select count(*) from private.admin_attempt_rows where status<>'in_progress' and assignments->>'type'='exam'),
 'in_progress',(select count(*) from public.attempts where status='in_progress'),
 'pending_reviews',(select count(*) from public.attempts where status in ('submitted','pending_review','expired')),
 'graded',(select count(*) from public.attempts where status='graded'),
 'published_assignments',(select count(*) from public.assignments where type='assignment' and visible and not archived),
 'published_exams',(select count(*) from public.assignments where type='exam' and visible and not archived));
end $$;

create function public.instructor_students(p_search text default '',p_faculty text default '',p_offset int default 0,p_limit int default 25,p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 or length(p_search)>200 then raise exception 'Invalid page';end if;
 with filtered as (
 select u.id,p.full_name,u.email,p.phone,p.faculty,p.student_id,u.created_at,
 (select count(*) from public.attempts a where a.student_id=u.id) as started,
 (select count(*) from public.attempts a where a.student_id=u.id and a.status<>'in_progress') as submissions
 from auth.users u left join public.profiles p on p.id=u.id
 where (not exists(select 1 from private.instructors i where i.user_id=u.id) or p.id is not null)
 and (p_id is null or u.id=p_id) and (p_faculty='' or p.faculty=p_faculty)
 and (p_search='' or concat_ws(' ',p.full_name,u.email,p.student_id) ilike '%'||p_search||'%')
 ),page as (select * from filtered order by created_at desc,id desc offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;

create function public.instructor_attempts(p_search text default '',p_faculty text default '',p_type text default '',p_assessment uuid default null,p_student uuid default null,p_status text default '',p_from timestamptz default null,p_to timestamptz default null,p_offset int default 0,p_limit int default 25,p_submitted_only boolean default true) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 or length(p_search)>200 then raise exception 'Invalid page';end if;
 with filtered as (
 select * from private.admin_attempt_rows r
 where (not p_submitted_only or r.status<>'in_progress') and (p_student is null or r.student_id=p_student) and (p_assessment is null or r.assignment_id=p_assessment)
 and (p_type='' or r.assignments->>'type'=p_type) and (p_faculty='' or r.profiles->>'faculty'=p_faculty)
 and (p_status='' or r.status=p_status or (p_status='pending_review' and r.status in ('submitted','pending_review','expired')))
 and (p_from is null or coalesce(r.submitted_at,r.created_at)>=p_from) and (p_to is null or coalesce(r.submitted_at,r.created_at)<p_to)
 and (p_search='' or concat_ws(' ',r.profiles->>'full_name',r.profiles->>'email',r.profiles->>'student_id') ilike '%'||p_search||'%')
 ),page as (select * from filtered order by created_at desc,id desc offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;

create function public.instructor_review_context(p_attempt uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare a public.attempts;result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 select * into a from public.attempts where id=p_attempt;if a.id is null then raise exception 'Attempt not found';end if;
 select jsonb_build_object('keys',coalesce(k.keys,'{}'),'draft',(select to_jsonb(d) from private.grading_drafts d where d.attempt_id=a.id),'checkpoint_accepted_at',(select accepted_at from private.verified_checkpoints c where c.attempt_id=a.id)) into result from private.assessment_keys k where k.assessment_id=a.assignment_id and k.version=a.assignment_version;
 return coalesce(result,jsonb_build_object('keys','{}'::jsonb));
end $$;

create function public.instructor_save_grade_draft(p_attempt uuid,p_grades jsonb,p_feedback text) returns void language plpgsql security definer set search_path='' as $$declare a public.attempts;doc jsonb;item jsonb;q jsonb;seen text[]:='{}';begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 select * into a from public.attempts where id=p_attempt for update;if a.id is null or a.status='in_progress' then raise exception 'Finalized attempt required';end if;
 if jsonb_typeof(p_grades) is distinct from 'array' or p_feedback is null or length(p_feedback)>5000 then raise exception 'Invalid draft';end if;
 select document into doc from public.assessment_versions where assessment_id=a.assignment_id and version=a.assignment_version;
 for item in select value from jsonb_array_elements(p_grades) loop
 select value into q from jsonb_array_elements(doc->'questions') where value->>'id'=item->>'question_id';
 if q is null or item->>'question_id'=any(seen) or (not (q->>'manual')::boolean and q->>'kind' in ('single','multiple','boolean')) or (q->>'points')::numeric<=0 or item->>'points' is null or (item->>'points')::numeric not between 0 and (q->>'points')::numeric then raise exception 'Invalid draft mark';end if;
 seen:=array_append(seen,item->>'question_id');end loop;
 insert into private.grading_drafts(attempt_id,grades,feedback) values(a.id,p_grades,p_feedback) on conflict(attempt_id) do update set grades=excluded.grades,feedback=excluded.feedback,updated_at=now();
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'grade.draft_saved',a.id::text);
end $$;

revoke all on function public.instructor_overview(),public.instructor_students(text,text,int,int,uuid),public.instructor_attempts(text,text,text,uuid,uuid,text,timestamptz,timestamptz,int,int,boolean),public.instructor_review_context(uuid),public.instructor_save_grade_draft(uuid,jsonb,text) from public,anon;
grant execute on function public.instructor_overview(),public.instructor_students(text,text,int,int,uuid),public.instructor_attempts(text,text,text,uuid,uuid,text,timestamptz,timestamptz,int,int,boolean),public.instructor_review_context(uuid),public.instructor_save_grade_draft(uuid,jsonb,text) to authenticated;
create function private.clear_finalized_grading_draft() returns trigger language plpgsql security definer set search_path='' as $$begin delete from private.grading_drafts where attempt_id=new.attempt_id;return new;end $$;
revoke all on function private.clear_finalized_grading_draft() from public,anon,authenticated;
create trigger clear_finalized_grading_draft after update of theory_score,released on public.grading_summaries for each row execute function private.clear_finalized_grading_draft();
