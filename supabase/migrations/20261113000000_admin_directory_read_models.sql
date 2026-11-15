-- Dashboard read models only: exclude authorized staff from student counts/directory.
-- No grading, roles, stored records, Storage objects or audit data are changed.
create or replace function public.instructor_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 return jsonb_build_object(
 'students',(select count(*) from auth.users u where not exists(select 1 from private.instructors i where i.user_id=u.id)),
 'started_students',(select count(distinct student_id) from public.attempts a where not exists(select 1 from private.instructors i where i.user_id=a.student_id)),
 'submitted_assignments',(select count(*) from private.admin_attempt_rows where status not in ('in_progress','restarted','invalidated') and assignments->>'type'='assignment' and not exists(select 1 from private.instructors i where i.user_id=private.admin_attempt_rows.student_id)),
 'submitted_exams',(select count(*) from private.admin_attempt_rows where status not in ('in_progress','restarted','invalidated') and assignments->>'type'='exam' and not exists(select 1 from private.instructors i where i.user_id=private.admin_attempt_rows.student_id)),
 'in_progress',(select count(*) from public.attempts a where status='in_progress' and not exists(select 1 from private.instructors i where i.user_id=a.student_id)),
 'pending_reviews',(select count(*) from public.attempts a where status in ('submitted','pending_review','expired') and not exists(select 1 from public.grading_summaries g where g.attempt_id=a.id and g.released) and not exists(select 1 from private.instructors i where i.user_id=a.student_id)),
 'graded',(select count(*) from public.attempts a where status not in ('in_progress','restarted','invalidated') and (status='graded' or exists(select 1 from public.grading_summaries g where g.attempt_id=a.id and g.released)) and not exists(select 1 from private.instructors i where i.user_id=a.student_id)),
 'published_assignments',(select count(*) from public.assignments where type='assignment' and visible and not archived),
 'published_exams',(select count(*) from public.assignments where type='exam' and visible and not archived));
end $$;

create or replace function public.instructor_students(p_search text default '',p_faculty text default '',p_offset int default 0,p_limit int default 25,p_id uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 or length(p_search)>200 then raise exception 'Invalid page';end if;
 with filtered as (
 select u.id,p.full_name,u.email,p.phone,p.faculty,p.student_id,u.created_at,
 (select count(*) from public.attempts a where a.student_id=u.id) as started,
 (select count(*) from public.attempts a where a.student_id=u.id and a.status not in ('in_progress','restarted','invalidated')) as submissions
 from auth.users u left join public.profiles p on p.id=u.id
 where not exists(select 1 from private.instructors i where i.user_id=u.id)
 and (p_id is null or u.id=p_id) and (p_faculty='' or p.faculty=p_faculty)
 and (p_search='' or concat_ws(' ',p.full_name,u.email,p.student_id) ilike '%'||p_search||'%')
 ),page as (select * from filtered order by created_at desc,id desc offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;

-- Administration presents student totals without altering the student grading engine.
create function public.instructor_course_gradebook()
returns table(student_id uuid,full_name text,task1 numeric,task2 numeric,final numeric,total numeric,eligible boolean,completed_components bigint)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 return query select g.* from public.course_gradebook() g
 where not exists(select 1 from private.instructors i where i.user_id=g.student_id);
end $$;
revoke all on function public.instructor_course_gradebook() from public,anon;
grant execute on function public.instructor_course_gradebook() to authenticated;
