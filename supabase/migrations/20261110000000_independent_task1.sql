-- Task 1 cutover. Destructive to experimental assessment data.
-- Rehearse and take a verified backup before applying to the linked production project.
begin;
set local lock_timeout='5s';
set local statement_timeout='120s';

alter table public.assignments add column course_slot text unique
 check(course_slot in ('task1','task2','final'));

create or replace function public.save_assessment(p_id uuid,p_document jsonb,p_publish boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(p_id,gen_random_uuid());doc jsonb:=p_document;q jsonb;t jsonb;r jsonb;s jsonb;public_questions jsonb:='[]';answer_keys jsonb:='{}';next_version int;seen text[]:='{}';qid text;total numeric:=0;slot text;previous_slot text;
begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required'; end if;
 if jsonb_typeof(doc) is distinct from 'object' or not (doc ?& array['gradingPolicy','schemaVersion','title','type','format','projectName','durationMinutes','attemptLimit','sections','questions','starter','releaseImmediately','reviewAnswers','gateTheory','requireComplete']) then raise exception 'Assessment definition fields are required';end if;
 if exists(select 1 from unnest(array['title','type','format','projectName']) field where jsonb_typeof(doc->field) is distinct from 'string')
    or exists(select 1 from unnest(array['schemaVersion','durationMinutes','attemptLimit']) field where jsonb_typeof(doc->field) is distinct from 'number')
    or exists(select 1 from unnest(array['releaseImmediately','reviewAnswers','gateTheory','requireComplete']) field where jsonb_typeof(doc->field) is distinct from 'boolean')
    or jsonb_typeof(doc->'starter') is distinct from 'object'
    or jsonb_typeof(doc->'starter'->'files') is distinct from 'object'
    or jsonb_typeof(doc->'starter'->'initialize') is distinct from 'boolean'
    or jsonb_typeof(doc->'starter'->'commit') is distinct from 'boolean'
 then raise exception 'Invalid assessment configuration'; end if;
 if octet_length(doc::text)>1000000 or doc->>'schemaVersion' is distinct from '1' or doc->>'gradingPolicy' is distinct from 'independent-v2' or length(trim(doc->>'title')) not between 1 and 180 or doc->>'type' not in ('assignment','exam') or doc->>'format' not in ('practical','theory','mixed') or doc->>'projectName' !~ '^[a-zA-Z0-9_-]{1,60}$' or (doc->>'attemptLimit')::int not between 1 and 20 or (doc->>'durationMinutes')::int not between 0 and 1440 or (doc->>'type'='exam' and (doc->>'durationMinutes')::int<1) then raise exception 'Invalid assessment configuration'; end if;
 if jsonb_typeof(doc->'questions') is distinct from 'array' or jsonb_array_length(doc->'questions')>100 or jsonb_typeof(doc->'sections') is distinct from 'array' or jsonb_array_length(doc->'sections')>20 then raise exception 'Invalid assessment content'; end if;
 if nullif(doc->>'startsAt','')::timestamptz>=nullif(doc->>'endsAt','')::timestamptz then raise exception 'Availability ends before start'; end if;
 for q in select value from jsonb_array_elements(doc->'questions') loop
  qid:=q->>'id';if qid is null or qid !~ '^[a-zA-Z0-9_-]{1,80}$' or qid=any(seen) or coalesce(q->>'kind','') not in ('single','multiple','boolean','choice-complete','fill-blank','short','long','scenario','interpretation') or length(trim(coalesce(q->>'prompt',''))) not between 1 and 8000 or jsonb_typeof(q->'points') is distinct from 'number' or (q->>'points')::numeric not between 0 and 1000 or jsonb_typeof(q->'manual') is distinct from 'boolean' or jsonb_typeof(q->'required') is distinct from 'boolean' or jsonb_typeof(q->'options') is distinct from 'array' then raise exception 'Invalid question'; end if;seen:=array_append(seen,qid);
  if p_publish and not (q->>'manual')::boolean and q->>'kind' in ('single','multiple','boolean','choice-complete','fill-blank') then
   if jsonb_typeof(q->'correctAnswers') is distinct from 'array' or jsonb_array_length(q->'correctAnswers')<1 or (q->>'kind' not in ('multiple','fill-blank') and jsonb_array_length(q->'correctAnswers')<>1) or (q->>'kind'<>'fill-blank' and not ((q->'options') @> (q->'correctAnswers'))) or exists(select 1 from jsonb_array_elements_text(q->'correctAnswers') answer where length(trim(answer)) not between 1 and 500) then raise exception 'Objective questions require a valid private answer key'; end if;
  end if;
  answer_keys:=answer_keys||jsonb_build_object(qid,jsonb_build_object('correctAnswers',coalesce(q->'correctAnswers','[]'),'explanation',coalesce(q->>'explanation','')));
  public_questions:=public_questions||jsonb_build_array(q-'correctAnswers'-'explanation');total:=total+(q->>'points')::numeric;
 end loop;
 seen:='{}';
 for s in select value from jsonb_array_elements(doc->'sections') loop
  if jsonb_typeof(s->'tasks') is distinct from 'array' or jsonb_array_length(s->'tasks')>30 then raise exception 'Invalid task section'; end if;
  for t in select value from jsonb_array_elements(s->'tasks') loop
   if t->>'id'=any(seen) or coalesce(t->>'id','') !~ '^[a-zA-Z0-9_-]{1,80}$' or jsonb_typeof(t->'points') is distinct from 'number' or (t->>'points')::numeric not between 0 and 1000 or jsonb_typeof(t->'bonus') is distinct from 'boolean' or jsonb_typeof(t->'rules') is distinct from 'array' or jsonb_array_length(t->'rules') not between 1 and 20 then raise exception 'Invalid task'; end if;seen:=array_append(seen,t->>'id');total:=total+(t->>'points')::numeric;
   for r in select value from jsonb_array_elements(t->'rules') loop if coalesce(r->>'type','') not in ('repository','file','branch','commits','message','merged','isolation','criterion') then raise exception 'Unsupported validation rule'; end if;end loop;
  end loop;
 end loop;
 if total>10000 or (p_publish and total<=0) then raise exception 'Invalid total points'; end if;
 insert into public.assignments(id,title,description,type,visible) values(target,doc->>'title',coalesce(doc->>'description',''),doc->>'type',false) on conflict(id) do nothing;
 -- Serialize publishers before allocating a version number.
 select course_slot into previous_slot from public.assignments where id=target for update;
 slot:=doc->>'courseSlot';
 if previous_slot is not null and previous_slot is distinct from slot then
  raise exception 'Published course slot cannot be reassigned';
 end if;
 insert into public.assessment_drafts(assessment_id,document) values(target,doc) on conflict(assessment_id) do update set document=excluded.document,updated_at=now();
 if p_publish then
  if slot is not null then
   perform pg_advisory_xact_lock(hashtext('git-fundamentals-course-slots'));
   update public.assignments set course_slot=slot where id=target;
   insert into public.assessment_courses(assessment_id,course_id)
   values(target,'70000000-0000-4000-8000-000000000001')
   on conflict(assessment_id) do update set course_id=excluded.course_id;
  end if;
  select coalesce(max(version),0)+1 into next_version from public.assessment_versions where assessment_id=target;
  insert into public.assessment_versions(assessment_id,version,document) values(target,next_version,jsonb_set(doc,'{questions}',public_questions));
  insert into private.assessment_keys values(target,next_version,answer_keys);
  update public.assignments set version=next_version,published_version=next_version,title=doc->>'title',description=doc->>'description',type=doc->>'type',visible=true,archived=false,starts_at=nullif(doc->>'startsAt','')::timestamptz,deadline=nullif(doc->>'deadline','')::timestamptz,review_answers=coalesce((doc->>'reviewAnswers')::boolean,true) where id=target;
 end if;
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),case when p_publish then 'assessment.published' else 'assessment.draft_saved' end,target::text);return target;
end $$;
create or replace function private.validate_requirement_scoring() returns trigger language plpgsql set search_path='' as $$
declare
 doc jsonb:=new.document;
 section jsonb;
 task jsonb;
 rule jsonb;
 task_count int:=0;
 criteria text[]:='{}';
 known_criteria constant text[]:=string_to_array('initialized,identity-name,identity-email,main-branch,about-exists,about-content,goals-exists,goals-content,notes-exists,notes-content,about-focused,about-message,goals-focused,goals-message,notes-focused,notes-message,goals-expanded,four-commits,skills-branch,skills-content,skills-commit,skills-isolation,skills-merged,main-skills,clean',',');
 practical numeric:=0;
 theory numeric:=0;
 ri int;
 expected text[];
 suffixes text[];
 suffix text;
 weights jsonb;
 entry record;
 total numeric;
begin
 if doc->>'gradingPolicy' is distinct from 'independent-v2'
    or doc->'gateTheory' is distinct from 'false'::jsonb
    or doc->'requireComplete' is distinct from 'false'::jsonb
    or (doc ? 'courseSlot' and coalesce(doc->>'courseSlot','') not in ('task1','task2','final'))
 then
  raise exception 'Independent scoring and an allowed course slot are required';
 end if;

 -- Authors may save incomplete weights/content. Publication is the strict boundary.
 if tg_table_name='assessment_drafts' then return new; end if;

 select coalesce(sum((question->>'points')::numeric),0) into theory
 from jsonb_array_elements(doc->'questions') question;
 for section in select value from jsonb_array_elements(doc->'sections') loop
  for task in select value from jsonb_array_elements(section->'tasks') loop
   task_count:=task_count+1;
   practical:=practical+(task->>'points')::numeric;
   if doc ? 'courseSlot' and (task->>'bonus')::boolean then
    raise exception 'Course assessments cannot award bonus points';
   end if;
   if doc->>'courseSlot'='task1' then
    rule:=task->'rules'->0;
    if jsonb_array_length(task->'rules')<>1 or rule->>'type' is distinct from 'criterion'
       or not coalesce(rule->>'outcomeId'=any(known_criteria),false)
       or rule->>'outcomeId'=any(criteria) or (task->>'points')::numeric<=0
    then raise exception 'Task 1 needs one weighted task per independent criterion'; end if;
    criteria:=array_append(criteria,rule->>'outcomeId');
   end if;
  end loop;
 end loop;
 if doc->>'courseSlot'='task1' and (practical<>100 or theory<>50 or task_count<>25) then
  raise exception 'Task 1 requires 25 criteria and exactly 100 practical + 50 theory';
 elsif doc->>'courseSlot'='task2' and practical+theory<>150 then
  raise exception 'Task 2 requires exactly 150 points';
 elsif doc->>'courseSlot'='final' and practical+theory<>200 then
  raise exception 'Final Exam requires exactly 200 points';
 end if;
 for section in select value from jsonb_array_elements(doc->'sections') loop
  for task in select value from jsonb_array_elements(section->'tasks') loop
   if (task->>'points')::numeric=0 then
    if coalesce(task->'requirementWeights','{}'::jsonb)<>'{}'::jsonb then raise exception 'Informational tasks do not have scored requirement weights';end if;
    continue;
   end if;
   expected:='{}';ri:=0;
   for rule in select value from jsonb_array_elements(task->'rules') loop
    if rule->>'type'='criterion' and not coalesce(rule->>'outcomeId'=any(known_criteria),false) then raise exception 'Unknown independent criterion';end if;
    suffixes:=case rule->>'type'
     when 'criterion' then array['criterion']
     when 'repository' then array['initialized']||case when rule ? 'branch' then array['branch'] else '{}'::text[] end||case when coalesce((rule->>'clean')::boolean,false) then array['clean'] else '{}'::text[] end
     when 'file' then array['exists']||case when coalesce(rule->>'match','exists')<>'exists' then array['content'] else '{}'::text[] end
     when 'branch' then array['exists'] when 'commits' then array['count'] when 'message' then array['message'] when 'merged' then array['source','target','merged'] when 'isolation' then array['introduction'] else '{}'::text[] end;
    if cardinality(suffixes)=0 then raise exception 'Unknown scored requirements';end if;
    foreach suffix in array suffixes loop expected:=array_append(expected,(task->>'id')||':rule-'||ri||'-'||suffix);end loop;ri:=ri+1;
   end loop;
   weights:=task->'requirementWeights';total:=0;
   if jsonb_typeof(weights) is distinct from 'object' then raise exception 'Explicit requirement weights are required';end if;
   if (select count(*) from jsonb_object_keys(weights))<>cardinality(expected) then raise exception 'Requirement weight IDs do not match checks';end if;
   for entry in select * from jsonb_each(weights) loop
    if not entry.key=any(expected) or jsonb_typeof(entry.value)<>'number' or (entry.value::text)::numeric<=0 or (entry.value::text)::numeric<>round((entry.value::text)::numeric,2) then raise exception 'Invalid requirement weight';end if;
    total:=total+(entry.value::text)::numeric;
   end loop;
   if total<>(task->>'points')::numeric then raise exception 'Requirement weights must total task points';end if;
  end loop;
 end loop;
 return new;
end $$;
create or replace function private.finish_assessment(p_attempt uuid,p_auto boolean,p_key uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.attempts;c private.verified_checkpoints;doc jsonb;item jsonb;q jsonb;ref uuid;manual_pending boolean;auto_score numeric:=0;
begin
 select * into a from public.attempts where id=p_attempt for update;if a.id is null then raise exception 'Attempt not found';end if;if a.status<>'in_progress' then return a.receipt;end if;
 select document into doc from public.assessment_versions where assessment_id=a.assignment_id and version=a.assignment_version;
 if doc->>'gradingPolicy' is distinct from 'independent-v2' then raise exception 'Retired assessment'; end if;
 select * into c from private.verified_checkpoints where attempt_id=a.id;
 if c.attempt_id is null then c.payload:='{"snapshot":{"version":1,"entries":{"/":{"kind":"dir","data":[]}}},"answers":{},"events":[]}';c.outcomes:='[]';c.objective_grades:='[]';c.practical_score:=0;c.objective_score:=0;end if;
 manual_pending:=exists(select 1 from jsonb_array_elements(doc->'questions') x where ((x->>'manual')::boolean or x->>'kind' not in ('single','multiple','boolean','choice-complete','fill-blank')) and (x->>'points')::numeric>0);
 ref:=gen_random_uuid();
 insert into public.workspace_snapshots(attempt_id,snapshot) values(a.id,c.payload->'snapshot');
 insert into public.student_answers(attempt_id,question_id,answer) select a.id,key,value from jsonb_each_text(coalesce(c.payload->'answers','{}'));
 for item in select value from jsonb_array_elements(c.outcomes) loop insert into public.task_results(attempt_id,task_key,passed,points,requirement_results) values(a.id,item->>'id',(item->>'passed')::boolean,(item->>'earned')::numeric,item->'requirements');end loop;
 for item in select value from jsonb_array_elements(c.objective_grades) loop insert into public.grading_results(attempt_id,question_id,points,grader_id,automatic) values(a.id,item->>'question_id',(item->>'points')::numeric,a.student_id,true);end loop;
 for item in select value from jsonb_array_elements(coalesce(c.payload->'events','[]')) loop insert into public.command_events(attempt_id,sequence,event) values(a.id,(item->>'sequence')::int,item);end loop;
 insert into public.grading_summaries(attempt_id,practical_score,theory_score,released) values(a.id,c.practical_score,c.objective_score,not manual_pending and coalesce((doc->>'releaseImmediately')::boolean,false));
 update public.attempts set status=case when p_auto then 'expired' when manual_pending then 'pending_review' else 'submitted' end,auto_submitted=p_auto,receipt=ref,submitted_at=case when p_auto then deadline_at else clock_timestamp() end,idempotency_key=p_key where id=a.id;
 insert into public.audit_logs(actor_id,action,target_id) values(a.student_id,case when p_auto then 'exam.auto_submitted' else 'assessment.submitted' end,a.id::text);return ref;
end $$;
create or replace function private.accept_assessment_checkpoint(p_student uuid,p_attempt uuid,p_revision int,p_payload jsonb,p_outcomes jsonb,p_grades jsonb,p_practical numeric,p_objective numeric,p_finalize boolean,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attempts;ref uuid;doc jsonb;total_points numeric:=0;begin
 select * into a from public.attempts where id=p_attempt for update;if a.id is null or a.student_id<>p_student then raise exception 'Attempt ownership mismatch';end if;
 if a.status<>'in_progress' then if p_finalize and (a.idempotency_key=p_key or a.auto_submitted) then return jsonb_build_object('receipt',a.receipt,'revision',a.checkpoint_revision,'status',a.status);end if;raise exception 'Attempt is finalized';end if;
 if a.deadline_at is not null and a.deadline_at<=clock_timestamp() then perform private.finish_assessment(a.id,true);select * into a from public.attempts where id=p_attempt;return jsonb_build_object('receipt',a.receipt,'revision',a.checkpoint_revision,'status',a.status,'expired',true);end if;
 if exists(select 1 from private.verified_checkpoints where attempt_id=a.id and idempotency_key=p_key) then return jsonb_build_object('revision',a.checkpoint_revision,'status','in_progress');end if;
 if a.checkpoint_revision<>p_revision then raise exception 'Checkpoint conflict: another tab has saved newer work';end if;
 if octet_length(p_payload::text)>9000000 or p_practical<0 or p_objective<0 or p_practical+p_objective>10000 then raise exception 'Invalid verified checkpoint';end if;
 select document into doc from public.assessment_versions where assessment_id=a.assignment_id and version=a.assignment_version;
 if doc->>'gradingPolicy' is distinct from 'independent-v2' then
  raise exception 'Retired assessment';
 end if;
 if jsonb_typeof(p_outcomes) is distinct from 'array'
    or jsonb_typeof(p_grades) is distinct from 'array'
    or p_practical is null or p_objective is null
    or jsonb_array_length(p_outcomes)<>(select count(*) from jsonb_array_elements(doc->'sections') s cross join lateral jsonb_array_elements(s->'tasks') t)
    or exists(
     select 1 from jsonb_array_elements(p_outcomes) x
     where not (x ?& array['id','earned','requirements'])
        or jsonb_typeof(x->'requirements') is distinct from 'array'
        or jsonb_typeof(x->'earned') is distinct from 'number'
        or not exists (
         select 1 from jsonb_array_elements(doc->'sections') s
         cross join lateral jsonb_array_elements(s->'tasks') t
         where t->>'id'=x->>'id' and (x->>'earned')::numeric between 0 and (t->>'points')::numeric
        )
    )
    or (select count(distinct x->>'id') from jsonb_array_elements(p_outcomes) x)<>jsonb_array_length(p_outcomes)
    or p_practical<>(select coalesce(sum((x->>'earned')::numeric),0) from jsonb_array_elements(p_outcomes) x)
    or exists(
     select 1 from jsonb_array_elements(p_grades) x
     where jsonb_typeof(x->'points') is distinct from 'number'
        or not exists(
         select 1 from jsonb_array_elements(doc->'questions') q
         where q->>'id'=x->>'question_id' and not (q->>'manual')::boolean
           and q->>'kind' in ('single','multiple','boolean','choice-complete','fill-blank')
           and (x->>'points')::numeric in (0,(q->>'points')::numeric)
        )
    )
    or (select count(distinct x->>'question_id') from jsonb_array_elements(p_grades) x)<>jsonb_array_length(p_grades)
    or p_objective<>(select coalesce(sum((x->>'points')::numeric),0) from jsonb_array_elements(p_grades) x)
 then raise exception 'Invalid independent grading result'; end if;
 insert into private.verified_checkpoints values(a.id,p_revision+1,p_payload,p_outcomes,p_grades,p_practical,p_objective,clock_timestamp(),p_key) on conflict(attempt_id) do update set revision=excluded.revision,payload=excluded.payload,outcomes=excluded.outcomes,objective_grades=excluded.objective_grades,practical_score=excluded.practical_score,objective_score=excluded.objective_score,accepted_at=excluded.accepted_at,idempotency_key=excluded.idempotency_key;
 update public.attempts set checkpoint_revision=checkpoint_revision+1 where id=a.id;
 if p_finalize then ref:=private.finish_assessment(a.id,false,p_key);end if;
 return jsonb_build_object('receipt',ref,'revision',p_revision+1,'status',case when p_finalize then 'submitted' else 'in_progress' end,'server_now',clock_timestamp());
end $$;

create or replace function public.grade_assessment(p_attempt uuid,p_grades jsonb,p_feedback text,p_release boolean) returns void language plpgsql security definer set search_path='' as $$
declare a public.attempts;doc jsonb;item jsonb;q jsonb;seen text[]:='{}';total numeric;manual_count int;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 select * into a from public.attempts where id=p_attempt for update;if a.id is null or a.status='in_progress' then raise exception 'Finalized attempt required';end if;
 select document into doc from public.assessment_versions where assessment_id=a.assignment_id and version=a.assignment_version;
 if p_feedback is null or length(p_feedback)>5000 or jsonb_typeof(p_grades) is distinct from 'array' then raise exception 'Invalid grading payload';end if;
 select count(*) into manual_count from jsonb_array_elements(doc->'questions') x where ((x->>'manual')::boolean or x->>'kind' not in ('single','multiple','boolean','choice-complete','fill-blank')) and (x->>'points')::numeric>0;
 if jsonb_array_length(p_grades)<>manual_count then raise exception 'Grade every manual question';end if;
 for item in select value from jsonb_array_elements(p_grades) loop
  select value into q from jsonb_array_elements(doc->'questions') where value->>'id'=item->>'question_id';
  if q is null or item->>'question_id'=any(seen) or (not (q->>'manual')::boolean and q->>'kind' in ('single','multiple','boolean','choice-complete','fill-blank')) or (q->>'points')::numeric<=0 or (item->>'points') is null or (item->>'points')::numeric not between 0 and (q->>'points')::numeric then raise exception 'Invalid manual grade';end if;
  seen:=array_append(seen,item->>'question_id');insert into public.grading_results(attempt_id,question_id,points,grader_id,automatic) values(a.id,item->>'question_id',(item->>'points')::numeric,auth.uid(),false) on conflict(attempt_id,question_id) do update set points=excluded.points,grader_id=excluded.grader_id,automatic=false,updated_at=now();
 end loop;
 select coalesce(sum(points),0) into total from public.grading_results where attempt_id=a.id;
 update public.grading_summaries set theory_score=total,feedback=p_feedback,released=p_release where attempt_id=a.id;update public.attempts set status='graded' where id=a.id;
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),case when p_release then 'grade.published' else 'grade.saved' end,a.id::text);
end $$;
create or replace function public.duplicate_assessment(p_id uuid) returns uuid language plpgsql security definer set search_path='' as $$declare doc jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required'; end if;
 select document into doc from public.assessment_drafts where assessment_id=p_id;if doc is null then raise exception 'Draft not found';end if;return public.save_assessment(null,jsonb_set(doc,'{title}',to_jsonb((doc->>'title')||' (copy)')),false);end $$;

-- Released requirement details retain the same ownership and review checks.
drop policy own_released_requirement_results on public.task_results;
create policy own_released_requirement_results on public.task_results for select to authenticated using (
 exists(select 1 from public.attempts a join public.grading_summaries g on g.attempt_id=a.id
   join public.assessment_versions v on v.assessment_id=a.assignment_id and v.version=a.assignment_version
   where a.id=task_results.attempt_id and a.student_id=(select auth.uid()) and g.released
   and v.document->>'gradingPolicy'='independent-v2' and (v.document->>'reviewAnswers')::boolean)
);

create function public.course_gradebook() returns table(student_id uuid,full_name text,task1 numeric,task2 numeric,final numeric,total numeric,eligible boolean,completed_components bigint)
language sql stable security definer set search_path='' as $$
 with scores as (
 select a.student_id,assignment.course_slot as slot,max(g.practical_score+coalesce(g.theory_score,0)) as points
 from public.attempts a join public.grading_summaries g on g.attempt_id=a.id
 join public.assessment_versions v on v.assessment_id=a.assignment_id and v.version=a.assignment_version
 join public.assignments assignment on assignment.id=a.assignment_id
 join public.assessment_courses course on course.assessment_id=assignment.id
 where course.course_id='70000000-0000-4000-8000-000000000001'
 and v.document->>'gradingPolicy'='independent-v2'
 and v.document->>'courseSlot'=assignment.course_slot
 and g.released and a.status in ('submitted','graded','expired') and v.document->>'courseSlot' in ('task1','task2','final')
 and (a.student_id=auth.uid() or public.is_instructor()) group by a.student_id,assignment.course_slot
 ), combined as (
 select p.id,p.full_name,coalesce(max(s.points) filter(where s.slot='task1'),0) a,
 coalesce(max(s.points) filter(where s.slot='task2'),0) b,coalesce(max(s.points) filter(where s.slot='final'),0) c,count(s.slot) completed
 from public.profiles p left join scores s on s.student_id=p.id
 where auth.uid() is not null and (p.id=auth.uid() or public.is_instructor()) group by p.id,p.full_name
 ) select id,full_name,a,b,c,a+b+c,completed=3 and a+b+c>=400,completed from combined;
$$;
revoke all on function public.course_gradebook() from public,anon;
grant execute on function public.course_gradebook() to authenticated;
create or replace function public.instructor_save_grade_draft(p_attempt uuid,p_grades jsonb,p_feedback text) returns void language plpgsql security definer set search_path='' as $$declare a public.attempts;doc jsonb;item jsonb;q jsonb;seen text[]:='{}';begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 select * into a from public.attempts where id=p_attempt for update;if a.id is null or a.status='in_progress' then raise exception 'Finalized attempt required';end if;
 if jsonb_typeof(p_grades) is distinct from 'array' or p_feedback is null or length(p_feedback)>5000 then raise exception 'Invalid draft';end if;
 select document into doc from public.assessment_versions where assessment_id=a.assignment_id and version=a.assignment_version;
 for item in select value from jsonb_array_elements(p_grades) loop
 select value into q from jsonb_array_elements(doc->'questions') where value->>'id'=item->>'question_id';
 if q is null or item->>'question_id'=any(seen) or (not (q->>'manual')::boolean and q->>'kind' in ('single','multiple','boolean','choice-complete','fill-blank')) or (q->>'points')::numeric<=0 or item->>'points' is null or (item->>'points')::numeric not between 0 and (q->>'points')::numeric then raise exception 'Invalid draft mark';end if;
 seen:=array_append(seen,item->>'question_id');end loop;
 insert into private.grading_drafts(attempt_id,grades,feedback) values(a.id,p_grades,p_feedback) on conflict(attempt_id) do update set grades=excluded.grades,feedback=excluded.feedback,updated_at=now();
 insert into public.audit_logs(actor_id,action,target_id) values(auth.uid(),'grade.draft_saved',a.id::text);
end $$;
create or replace function private.management_snapshot(p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare draft_doc jsonb;m private.record_management;label text;state text;archived boolean:=false;deleted boolean:=false;can_trash boolean:=false;can_purge boolean:=false;can_invalidate boolean:=false;why text:='';related int:=0;a public.attempts;l public.learning_items;ass public.assignments;q public.question_bank;r public.attempt_help_requests;is_admin boolean:=public.is_data_administrator();effects jsonb:='{}';
begin
 select * into m from private.record_management where kind=p_kind and record_id=p_id;
 if p_kind='assessment' then
  select * into ass from public.assignments where id=p_id;if ass.id is null then return null;end if;
  label:=coalesce((select document->>'title' from public.assessment_drafts where assessment_id=p_id),ass.title);state:=case when ass.published_version>0 then 'published' else 'draft' end;archived:=ass.archived;
  select count(*) into related from public.attempts where assignment_id=p_id;
  can_trash:=not exists(select 1 from public.assessment_versions where assessment_id=p_id) and related=0 and not exists(select 1 from public.student_enrollments where assignment_id=p_id);
  select document into draft_doc from public.assessment_drafts where assessment_id=p_id;
  effects:=jsonb_build_object(
   'draft_documents',case when draft_doc is null then 0 else 1 end,
   'draft_sections',coalesce(jsonb_array_length(draft_doc->'sections'),0),
   'draft_tasks',(select count(*) from jsonb_array_elements(draft_doc->'sections') s cross join lateral jsonb_array_elements(s->'tasks')),
   'draft_questions',coalesce(jsonb_array_length(draft_doc->'questions'),0),
   'course_links',(select count(*) from public.assessment_courses where assessment_id=p_id),
   'student_attempts',related);
  related:=(select sum(value::int) from jsonb_each_text(effects));
  can_purge:=can_trash;why:=case when can_trash then 'An unpublished draft with no student enrollments or attempt history. Trash is reversible; permanent deletion is available only from Trash.' else 'Published versions, enrollments and attempt history are retained. Archive this assessment instead.' end;
 elsif p_kind='question' then
  select * into q from public.question_bank where id=p_id;if q.id is null then return null;end if;
  label:=q.document->>'prompt';state:='question bank';archived:=q.archived;can_trash:=true;can_purge:=true;why:='Only this reusable bank copy is managed. Existing assessment copies and private answer keys stay unchanged.';
 elsif p_kind='learning' then
  select * into l from public.learning_items where id=p_id;if l.id is null then return null;end if;
  label:=l.title;state:=l.kind||case when l.published_version>0 then ' · published' else ' · draft' end;archived:=l.archived_at is not null;
  select count(*) into related from public.learning_items where parent_id=p_id;
  related:=related+(select count(*) from public.assessment_courses where course_id=p_id)+(select count(*) from public.learning_materials where item_id=p_id);
  can_trash:=related=0;can_purge:=can_trash and not exists(select 1 from public.learning_versions where item_id=p_id);
  why:='Keep published learning versions and linked content. Uploaded presentations are retained; archive sessions with uploads. Manage child items and course links individually.';
 elsif p_kind='attempt' then
  select * into a from public.attempts where id=p_id;if a.id is null then return null;end if;
  select * into ass from public.assignments where id=a.assignment_id;
  label:=ass.title||' · Attempt '||a.attempt_number;state:=a.status;
  can_invalidate:=is_admin and a.status='in_progress' and a.receipt is null and a.submitted_at is null and a.restarted_to is null and ass.type='assignment' and (select document->>'type' from public.assessment_versions where assessment_id=a.assignment_id and version=a.assignment_version)='assignment' and (a.deadline_at is null or a.deadline_at>clock_timestamp()) and not exists(select 1 from public.grading_summaries where attempt_id=a.id);
  can_trash:=is_admin and a.status='invalidated' and a.receipt is null and a.submitted_at is null and not exists(select 1 from public.grading_summaries where attempt_id=a.id);
  related:=(select count(*) from public.student_answers where attempt_id=a.id)+(select count(*) from public.workspace_snapshots where attempt_id=a.id)+(select count(*) from private.verified_checkpoints where attempt_id=a.id);
  why:=case when not is_admin then 'Student-record changes require explicit data-administrator permission.' else 'Submissions, exams, restarted history and official grades are retained. Only an unsubmitted assignment before its deadline can be invalidated. Attempt deletion is reversible Trash only; attempt limits never reset.' end;
 elsif p_kind='request' then
  select * into r from public.attempt_help_requests where id=p_id;if r.id is null then return null;end if;
  label:='Help request · '||r.id;state:=r.status;why:=case when r.status='pending' then 'Respond to this request before archiving it. Requests and decisions stay with the attempt.' else 'Requests and instructor decisions are retained with the attempt.' end;
 else raise exception 'Unsupported record type';end if;
 archived:=archived or m.archived_at is not null;deleted:=m.deleted_at is not null;
 return jsonb_build_object('id',p_id,'kind',p_kind,'label',label,'status',state,'revision',coalesce(m.revision,0),'archived',archived,'deleted',deleted,'related',related,'effects',effects,'reason',why,
 'student_id',a.student_id,'actions',jsonb_build_object('archive',not archived and not deleted and (p_kind<>'attempt' or is_admin) and (p_kind<>'request' or r.status<>'pending'),
 'restore',(archived or deleted) and (p_kind<>'attempt' or is_admin),'trash',can_trash and not deleted,'purge',can_purge and deleted and p_kind<>'attempt','invalidate',can_invalidate and not deleted));
end $$;

create or replace function public.manage_records(p_kind text,p_records jsonb,p_action text,p_reason text default '',p_confirmation text default '') returns jsonb language plpgsql security definer set search_path='' as $$
declare entry jsonb;before jsonb;after jsonb;target uuid;ids uuid[]:='{}';m private.record_management;a public.attempts;n int;native_archived boolean;
begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_kind not in ('assessment','question','attempt','request','learning') or p_action not in ('archive','restore','trash','purge','invalidate') or jsonb_typeof(p_records) is distinct from 'array' or jsonb_array_length(p_records) not between 1 and 25 or p_reason is null or length(p_reason)>500 then raise exception 'Select between 1 and 25 records and a supported action';end if;
 n:=jsonb_array_length(p_records);
 if (n>1 or p_action in ('trash','purge','invalidate')) and length(trim(p_reason))<3 then raise exception 'Enter a reason for this action';end if;
 if (n>1 or p_action in ('trash','purge','invalidate')) and p_confirmation<>upper(case when p_action='purge' then 'delete' else p_action end)||' '||n then raise exception 'Type the exact action and record count to confirm';end if;
 perform pg_advisory_xact_lock(hashtext('git-lab-management'));
 -- Lock source rows before revision rows, in a stable order. Recheck the entire batch first.
 for entry in select value from jsonb_array_elements(p_records) order by value->>'id' loop
  target:=(entry->>'id')::uuid;if target=any(ids) then raise exception 'A record was selected twice';end if;ids:=array_append(ids,target);
  if p_kind='assessment' then perform 1 from public.assignments where id=target for update;
  elsif p_kind='question' then perform 1 from public.question_bank where id=target for update;
  elsif p_kind='learning' then perform 1 from public.learning_items where id=target for update;
  elsif p_kind='request' then perform 1 from public.attempt_help_requests where id=target for update;
  else
   select * into a from public.attempts where id=target;
   perform 1 from public.assignments where id=a.assignment_id for share;
   perform 1 from public.student_enrollments where student_id=a.student_id and assignment_id=a.assignment_id for update;
   perform 1 from public.attempts where id=target for update;
  end if;
  insert into private.record_management(kind,record_id) values(p_kind,target) on conflict do nothing;
  perform 1 from private.record_management where kind=p_kind and record_id=target for update;
  before:=private.management_snapshot(p_kind,target);
  if before is null then raise exception 'Record not found';end if;
  if entry->>'revision' is null or (entry->>'revision')::int<>(before->>'revision')::int then raise exception 'Record changed. Refresh and review the current record before confirming';end if;
  if not coalesce((before->'actions'->>p_action)::boolean,false) then raise exception 'Action not permitted: %',before->>'reason';end if;
 end loop;
 for target in select x.id from unnest(ids) x(id) left join public.learning_items l on l.id=x.id order by case when p_kind='learning' and p_action='restore' then case l.kind when 'course' then 0 when 'section' then 1 else 2 end else 0 end,x.id loop
  before:=private.management_snapshot(p_kind,target);
  if p_action='restore' and p_kind='learning' and exists(select 1 from public.learning_items child join public.learning_items parent on parent.id=child.parent_id where child.id=target and (parent.archived_at is not null or parent.deleted_at is not null)) then raise exception 'Restore the parent course or section first';end if;
  update private.record_management set revision=revision+1,reason=trim(p_reason),
   invalidation_reason=case when p_action='invalidate' then trim(p_reason) else invalidation_reason end,
   invalidated_at=case when p_action='invalidate' then clock_timestamp() else invalidated_at end,
   invalidated_by=case when p_action='invalidate' then auth.uid() else invalidated_by end,
   archived_at=case when p_action in ('archive','trash') then clock_timestamp() when p_action='restore' then null else archived_at end,
   archived_by=case when p_action in ('archive','trash') then auth.uid() when p_action='restore' then null else archived_by end,
   deleted_at=case when p_action='restore' then null else deleted_at end,
   deleted_by=case when p_action='restore' then null else deleted_by end
   where kind=p_kind and record_id=target;
  if p_action in ('archive','restore','trash') then
   native_archived:=p_action<>'restore';
   if p_kind='assessment' then update public.assignments set archived=native_archived,visible=false where id=target;
   elsif p_kind='question' then update public.question_bank set archived=native_archived where id=target;
   elsif p_kind='learning' then update public.learning_items set archived_at=case when native_archived then clock_timestamp() else null end,archived_by=case when native_archived then auth.uid() else null end,deleted_at=case when p_action='trash' then clock_timestamp() else null end,deleted_by=case when p_action='trash' then auth.uid() else null end where id=target;end if;
  elsif p_action='invalidate' then update public.attempts set status='invalidated' where id=target;
  elsif p_action='purge' then
   if p_kind='assessment' then
    delete from public.assessment_courses where assessment_id=target;
    delete from public.assessment_drafts where assessment_id=target;
    delete from public.assignments where id=target;
   elsif p_kind='question' then delete from public.question_bank where id=target;
   elsif p_kind='learning' then delete from private.learning_drafts where item_id=target;delete from public.learning_items where id=target;
   else raise exception 'This record is retained and cannot be permanently deleted';end if;
  end if;
  if p_action='trash' then update private.record_management set deleted_at=clock_timestamp(),deleted_by=auth.uid() where kind=p_kind and record_id=target;end if;
  after:=private.management_snapshot(p_kind,target);
  perform private.management_log(p_action,p_kind,target,trim(p_reason),before-'actions'-'label'-'reason',coalesce(after-'actions'-'label'-'reason',jsonb_build_object('permanently_deleted',true)));
 end loop;
 return jsonb_build_object('count',n,'action',p_action);
end $$;

-- Pin course assessments to the existing Git Fundamentals course. Standalone
-- assessments can still use the content manager's ordinary course links.
create function private.protect_course_slot_link() returns trigger
language plpgsql set search_path='' as $$
declare target uuid;
begin
 target:=case when tg_op='DELETE' then old.assessment_id else new.assessment_id end;
 if exists(select 1 from public.assignments where id=target and course_slot is not null) then
  if tg_op='DELETE' then raise exception 'Course-slot links cannot be removed'; end if;
  if new.course_id <> '70000000-0000-4000-8000-000000000001'::uuid then
   raise exception 'Course slots belong to Git Fundamentals';
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger protect_course_slot_link before insert or update or delete on public.assessment_courses
for each row execute function private.protect_course_slot_link();

-- Retire legacy rows within this transaction. The dependency allowlist was
-- compared with the target database before release. An unexpected inbound FK
-- aborts before any deletion, including an unexpected cascading constraint.
lock table public.assignments,public.assessment_versions,public.assessment_drafts,
 public.attempts,public.attempt_help_requests,public.assessment_courses,public.question_bank,
 public.assignment_sections,public.assignment_tasks,public.questions,
 public.workspace_drafts,private.assessment_keys in access exclusive mode;
do $$
begin
 perform 1 from public.learning_items
 where id='70000000-0000-4000-8000-000000000001' and kind='course'
   and archived_at is null and deleted_at is null and published_version is not null
 for share;
 if not found then raise exception 'The published Git Fundamentals course is required for cutover';end if;
 if exists(select 1 from public.assessment_versions where document->>'gradingPolicy'='independent-v2') then
  raise exception 'Replacement data already exists; refusing to clear assessment rows';
 end if;
 if exists(
  select 1 from pg_constraint c
  where c.contype='f' and c.confrelid in (
   'public.assignments'::regclass,'public.assessment_versions'::regclass,
   'public.assessment_drafts'::regclass,'public.attempts'::regclass,
   'public.attempt_help_requests'::regclass,'public.question_bank'::regclass,
   'public.assignment_sections'::regclass,'public.assignment_tasks'::regclass,
   'public.questions'::regclass,'private.question_rubrics'::regclass,
   'public.assessment_courses'::regclass,'public.workspace_drafts'::regclass,
   'public.workspace_snapshots'::regclass,'public.command_events'::regclass,
   'public.task_results'::regclass,'public.student_answers'::regclass,
   'public.grading_results'::regclass,'public.grading_summaries'::regclass,
   'public.student_enrollments'::regclass,'private.assessment_keys'::regclass,
   'private.grading_drafts'::regclass,'private.verified_checkpoints'::regclass
  ) and (c.conrelid,c.conname::text,c.confdeltype::text) not in (
   ('private.assessment_keys'::regclass,'assessment_keys_assessment_id_version_fkey','a'),
   ('public.assignment_tasks'::regclass,'assignment_tasks_section_id_fkey','c'),
   ('public.assessment_courses'::regclass,'assessment_courses_assessment_id_fkey','a'),
   ('public.assessment_drafts'::regclass,'assessment_drafts_assessment_id_fkey','a'),
   ('public.assessment_versions'::regclass,'assessment_versions_assessment_id_fkey','a'),
   ('public.assignment_sections'::regclass,'assignment_sections_assignment_id_fkey','c'),
   ('public.attempts'::regclass,'attempts_assignment_id_fkey','a'),
   ('public.questions'::regclass,'questions_assignment_id_fkey','c'),
   ('public.student_enrollments'::regclass,'student_enrollments_assignment_id_fkey','c'),
   ('private.grading_drafts'::regclass,'grading_drafts_attempt_id_fkey','c'),
   ('private.verified_checkpoints'::regclass,'verified_checkpoints_attempt_id_fkey','c'),
   ('public.attempt_help_requests'::regclass,'attempt_help_requests_attempt_id_fkey','a'),
   ('public.attempts'::regclass,'attempts_restarted_to_fkey','a'),
   ('public.command_events'::regclass,'command_events_attempt_id_fkey','c'),
   ('public.grading_results'::regclass,'grading_results_attempt_id_fkey','c'),
   ('public.grading_summaries'::regclass,'grading_summaries_attempt_id_fkey','c'),
   ('public.student_answers'::regclass,'student_answers_attempt_id_fkey','c'),
   ('public.task_results'::regclass,'task_results_attempt_id_fkey','c'),
   ('public.workspace_drafts'::regclass,'workspace_drafts_attempt_id_fkey','c'),
   ('public.workspace_snapshots'::regclass,'workspace_snapshots_attempt_id_fkey','c'),
   ('private.question_rubrics'::regclass,'question_rubrics_question_id_fkey','c')
  )
 ) then raise exception 'Unexpected assessment foreign-key dependency'; end if;
end $$;

create temp table retired_assignments on commit drop as select id from public.assignments;
create temp table retired_attempts on commit drop as
 select id from public.attempts where assignment_id in(select id from retired_assignments);
create temp table retired_requests on commit drop as
 select id from public.attempt_help_requests where attempt_id in(select id from retired_attempts);
create temp table retired_questions on commit drop as select id from public.question_bank;

delete from public.attempt_help_requests where id in(select id from retired_requests);
-- One statement removes the complete restart chains. The self-FK is checked
-- at the statement boundary and does not need to be disabled.
delete from public.attempts where id in(select id from retired_attempts);
delete from private.assessment_keys where assessment_id in(select id from retired_assignments);
-- Allow this one migration to remove versions. The separate Learning Sessions
-- immutability trigger remains active throughout the cutover.
drop trigger immutable_version on public.assessment_versions;
delete from public.assessment_versions where assessment_id in(select id from retired_assignments);
create trigger immutable_version before update or delete on public.assessment_versions
for each row execute function private.immutable_assessment_version();
delete from public.assessment_drafts where assessment_id in(select id from retired_assignments);
delete from public.assessment_courses where assessment_id in(select id from retired_assignments);
delete from public.assignments where id in(select id from retired_assignments);
delete from public.question_bank where id in(select id from retired_questions);
-- Polymorphic assessment management records include tombstones for previously
-- purged records. Keep learning management, security grants and audit history.
delete from private.record_management where kind in ('assessment','attempt','request','question');

drop function public.finalize_verified(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,numeric) restrict;
drop function private.finalize_verified(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,numeric) restrict;
drop function public.start_attempt(uuid) restrict;
drop function public.save_checkpoint(uuid,jsonb) restrict;
drop function public.grade_attempt(uuid,jsonb,text,boolean) restrict;
drop function public.manage_assignment(uuid,text,boolean,timestamptz,timestamptz,boolean,boolean) restrict;
drop function public.get_question_rubric(text) restrict;
drop function public.set_question_rubric(text,text) restrict;
drop table private.question_rubrics restrict;
drop table public.questions restrict;
drop table public.assignment_tasks restrict;
drop table public.assignment_sections restrict;
drop table public.workspace_drafts restrict;
alter table public.assignments drop column objectives, drop column allow_retake;

-- Generated from taskOneDefinition. A regression test compares the two definitions.
do $seed$
declare
 task_id constant uuid:='b6f4b6d0-5fe2-4e4d-b9a5-000000000002';
 doc jsonb:=$task_one${
  "schemaVersion": 1,
  "gradingPolicy": "independent-v2",
  "title": "Task 1 — Git Fundamentals",
  "description": "Build a local repository, tell the story of your changes, and bring two branches together.",
  "instructions": "150 points: practical 100 + theory 50. Every requirement is independent. Correct mistakes and recheck without restarting. Submit partial work at any time. Commands such as status and log are learning exercises; command logs never award points.",
  "type": "assignment",
  "format": "mixed",
  "projectName": "IEEE-Git-Task",
  "durationMinutes": 0,
  "attemptLimit": 1,
  "startsAt": null,
  "endsAt": null,
  "deadline": null,
  "releaseImmediately": false,
  "reviewAnswers": true,
  "gateTheory": false,
  "requireComplete": false,
  "starter": {
    "files": {},
    "initialize": false,
    "commit": false
  },
  "sections": [
    {
      "id": "independent-task1",
      "title": "Practical requirements · 100 points",
      "description": "Each requirement earns its configured points independently.",
      "steps": [],
      "tasks": [
        {
          "id": "t1-initialized",
          "title": "Initialize the repository",
          "instructions": "Run git init in IEEE-Git-Task.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "initialized"
            }
          ],
          "requirementWeights": {
            "t1-initialized:rule-0-criterion": 2
          }
        },
        {
          "id": "t1-identity-name",
          "title": "Configure your name",
          "instructions": "Set git config user.name to your name.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "identity-name"
            }
          ],
          "requirementWeights": {
            "t1-identity-name:rule-0-criterion": 2
          }
        },
        {
          "id": "t1-identity-email",
          "title": "Configure your email",
          "instructions": "Set git config user.email to a valid email address.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "identity-email"
            }
          ],
          "requirementWeights": {
            "t1-identity-email:rule-0-criterion": 2
          }
        },
        {
          "id": "t1-main-branch",
          "title": "Create main",
          "instructions": "Initialize or create the main branch.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "main-branch"
            }
          ],
          "requirementWeights": {
            "t1-main-branch:rule-0-criterion": 2
          }
        },
        {
          "id": "t1-about-exists",
          "title": "Create about.txt",
          "instructions": "Create about.txt in your working files.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "about-exists"
            }
          ],
          "requirementWeights": {
            "t1-about-exists:rule-0-criterion": 2
          }
        },
        {
          "id": "t1-about-content",
          "title": "Complete about.txt",
          "instructions": "Use three lines: Name: your profile name; University: Nahda University; Department: your profile department. Edit the current file to correct mistakes.",
          "points": 4,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "about-content"
            }
          ],
          "requirementWeights": {
            "t1-about-content:rule-0-criterion": 4
          }
        },
        {
          "id": "t1-goals-exists",
          "title": "Create goals.txt",
          "instructions": "Create goals.txt in your working files.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "goals-exists"
            }
          ],
          "requirementWeights": {
            "t1-goals-exists:rule-0-criterion": 2
          }
        },
        {
          "id": "t1-goals-content",
          "title": "Write the original goals",
          "instructions": "Write My Goals: then numbered lines 1. Learn Git, 2. Understand version control, 3. Work on team projects.",
          "points": 4,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "goals-content"
            }
          ],
          "requirementWeights": {
            "t1-goals-content:rule-0-criterion": 4
          }
        },
        {
          "id": "t1-notes-exists",
          "title": "Create notes.txt",
          "instructions": "Create notes.txt in your working files.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "notes-exists"
            }
          ],
          "requirementWeights": {
            "t1-notes-exists:rule-0-criterion": 2
          }
        },
        {
          "id": "t1-notes-content",
          "title": "Write the course notes",
          "instructions": "Write Git Course - Session 1 and IEEE NUB Student Branch on separate lines.",
          "points": 4,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "notes-content"
            }
          ],
          "requirementWeights": {
            "t1-notes-content:rule-0-criterion": 4
          }
        },
        {
          "id": "t1-about-focused",
          "title": "Commit about.txt separately",
          "instructions": "Stage and commit only about.txt. A later focused change also qualifies; earlier combined commits do not block recovery.",
          "points": 6,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "about-focused"
            }
          ],
          "requirementWeights": {
            "t1-about-focused:rule-0-criterion": 6
          }
        },
        {
          "id": "t1-about-message",
          "title": "Use the personal information message",
          "instructions": "Make a change to about.txt and commit with the exact message Add personal information. Any qualifying later commit counts.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "about-message"
            }
          ],
          "requirementWeights": {
            "t1-about-message:rule-0-criterion": 2
          }
        },
        {
          "id": "t1-goals-focused",
          "title": "Commit goals.txt separately",
          "instructions": "Stage and commit only goals.txt; a later focused correction qualifies.",
          "points": 6,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "goals-focused"
            }
          ],
          "requirementWeights": {
            "t1-goals-focused:rule-0-criterion": 6
          }
        },
        {
          "id": "t1-goals-message",
          "title": "Describe a goals change",
          "instructions": "Commit a goals.txt change with a meaningful message of at least two words and eight characters.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "goals-message"
            }
          ],
          "requirementWeights": {
            "t1-goals-message:rule-0-criterion": 2
          }
        },
        {
          "id": "t1-notes-focused",
          "title": "Commit notes.txt separately",
          "instructions": "Stage and commit only notes.txt; a later focused correction qualifies.",
          "points": 6,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "notes-focused"
            }
          ],
          "requirementWeights": {
            "t1-notes-focused:rule-0-criterion": 6
          }
        },
        {
          "id": "t1-notes-message",
          "title": "Describe a notes change",
          "instructions": "Commit a notes.txt change with a meaningful message of at least two words and eight characters.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "notes-message"
            }
          ],
          "requirementWeights": {
            "t1-notes-message:rule-0-criterion": 2
          }
        },
        {
          "id": "t1-goals-expanded",
          "title": "Commit two additional goals",
          "instructions": "Start from a committed goals.txt with the three original goals. Add at least two distinct numbered goals, retain previous goals, and commit. This may happen at any time.",
          "points": 10,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "goals-expanded"
            }
          ],
          "requirementWeights": {
            "t1-goals-expanded:rule-0-criterion": 10
          }
        },
        {
          "id": "t1-four-commits",
          "title": "Create at least four commits",
          "instructions": "Create four commits reachable from your current branches. Inspect git log --oneline.",
          "points": 4,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "four-commits"
            }
          ],
          "requirementWeights": {
            "t1-four-commits:rule-0-criterion": 4
          }
        },
        {
          "id": "t1-skills-branch",
          "title": "Create feature/skills",
          "instructions": "Create feature/skills and switch to it.",
          "points": 4,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "skills-branch"
            }
          ],
          "requirementWeights": {
            "t1-skills-branch:rule-0-criterion": 4
          }
        },
        {
          "id": "t1-skills-content",
          "title": "Write the three skills",
          "instructions": "Write Problem Solving, Communication and Teamwork on separate lines in skills.txt.",
          "points": 4,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "skills-content"
            }
          ],
          "requirementWeights": {
            "t1-skills-content:rule-0-criterion": 4
          }
        },
        {
          "id": "t1-skills-commit",
          "title": "Commit skills.txt",
          "instructions": "Commit a skills.txt change containing the three required skills.",
          "points": 6,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "skills-commit"
            }
          ],
          "requirementWeights": {
            "t1-skills-commit:rule-0-criterion": 6
          }
        },
        {
          "id": "t1-skills-isolation",
          "title": "Demonstrate branch isolation",
          "instructions": "On feature/skills, commit skills.txt after a parent without that file. Switch between the parent/main and feature to inspect the difference. If needed, remove and commit the file, then recreate and commit it on feature/skills.",
          "points": 8,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "skills-isolation"
            }
          ],
          "requirementWeights": {
            "t1-skills-isolation:rule-0-criterion": 8
          }
        },
        {
          "id": "t1-skills-merged",
          "title": "Merge feature/skills into main",
          "instructions": "Switch to main and merge feature/skills so its current tip is reachable from main. Fast-forward and merge commits both qualify.",
          "points": 8,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "skills-merged"
            }
          ],
          "requirementWeights": {
            "t1-skills-merged:rule-0-criterion": 8
          }
        },
        {
          "id": "t1-main-skills",
          "title": "Verify committed skills on main",
          "instructions": "Ensure the main branch contains committed skills.txt with the three required skills.",
          "points": 4,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "main-skills"
            }
          ],
          "requirementWeights": {
            "t1-main-skills:rule-0-criterion": 4
          }
        },
        {
          "id": "t1-clean",
          "title": "Leave a clean working tree",
          "instructions": "Commit or restore outstanding changes so HEAD, index and working files agree.",
          "points": 2,
          "bonus": false,
          "rules": [
            {
              "type": "criterion",
              "outcomeId": "clean"
            }
          ],
          "requirementWeights": {
            "t1-clean:rule-0-criterion": 2
          }
        }
      ]
    },
    {
      "id": "exercise-init",
      "title": "Repository initialization",
      "description": "Set up your project and make it your own.",
      "steps": [
        "Verify Git availability and configure your name and email.",
        "Create and enter IEEE-Git-Task. Initialize a repository with main as its primary branch.",
        "Create about.txt, goals.txt and notes.txt with the contents below.",
        "Inspect status and list hidden files to find .git."
      ],
      "tasks": []
    },
    {
      "id": "exercise-commits",
      "title": "Staging & commits",
      "description": "Small commits. A clear story.",
      "steps": [
        "Stage only about.txt, inspect status, and commit with “Add personal information”.",
        "Introduce goals.txt and notes.txt in separate commits with meaningful messages.",
        "Add two more goals and commit the updated goals.",
        "Inspect your short commit history. You should have at least four commits."
      ],
      "tasks": []
    },
    {
      "id": "exercise-branches",
      "title": "Branching & switching",
      "description": "A safe space to try something new.",
      "steps": [
        "Create feature/skills and switch to it.",
        "Create skills.txt containing Problem Solving, Communication and Teamwork. Commit the file.",
        "Switch to main and observe the file is absent. Switch back and observe it returns.",
        "Be ready to explain branch isolation."
      ],
      "tasks": []
    },
    {
      "id": "exercise-merge",
      "title": "Bring it all together",
      "description": "Two lines of work, one shared history.",
      "steps": [
        "Ensure feature changes are committed. Switch to main and merge feature/skills.",
        "Verify skills.txt is on main and inspect history.",
        "Explain which branch received changes, the merge type, and whether a new commit was created."
      ],
      "tasks": []
    },
    {
      "id": "exercise-bonus",
      "title": "Optional extension · unscored",
      "description": "Optional · Explore a three-way merge.",
      "steps": [
        "From main, create feature/hobbies. Add hobbies.txt with three hobbies and commit.",
        "Back on main, add “Assignment 1 completed.” to notes.txt and commit.",
        "Merge feature/hobbies into main. Inspect the graph across all branches.",
        "Explain the merge, how it differs from Part 4, why Git creates a merge commit, and what the graph reveals."
      ],
      "tasks": []
    }
  ],
  "questions": [
    {
      "id": "q1",
      "prompt": "What is the difference between Git and GitHub?",
      "kind": "long",
      "points": 4,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q2",
      "prompt": "What is a repository? What is stored inside the hidden .git directory?",
      "kind": "long",
      "points": 4,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q3",
      "prompt": "Explain the difference between the Working Directory, Staging Area, and Local Repository.",
      "kind": "long",
      "points": 5,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q4",
      "prompt": "What is the difference between git add and git commit?",
      "kind": "long",
      "points": 4,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q5",
      "prompt": "What is the purpose of git status, and why should it be used frequently?",
      "kind": "long",
      "points": 4,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q6",
      "prompt": "Why are meaningful commit messages important? Provide two examples.",
      "kind": "long",
      "points": 4,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q7",
      "prompt": "You create file1.txt and file2.txt, then execute git add file1.txt. Which file becomes staged, and which remains untracked? Explain.",
      "kind": "scenario",
      "points": 4,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q8",
      "prompt": "You create feature/test with git branch feature/test, and git branch displays an asterisk next to main. Which branch are you on, and how would you switch?",
      "kind": "scenario",
      "points": 4,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q9",
      "prompt": "You are currently on feature/skills and execute git merge main. Which branch receives the changes? Does it update main?",
      "kind": "scenario",
      "points": 4,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q10",
      "prompt": "You modified notes.txt, but git commit -m \"Update notes\" reports \"Changes not staged for commit.\" Explain the problem and provide the necessary commands.",
      "kind": "scenario",
      "points": 4,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q11",
      "prompt": "A new file seems to disappear when switching from a feature branch back to main. Explain why and how to access the file again.",
      "kind": "scenario",
      "points": 4,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "q12",
      "prompt": "What is the difference between creating a branch and switching to a branch? Provide example commands.",
      "kind": "scenario",
      "points": 5,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "isolation",
      "prompt": "Explain the branch isolation you observed when switching between main and feature/skills.",
      "kind": "long",
      "points": 0,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "merge",
      "prompt": "Explain the direction and type of your Part 4 merge. Was a new merge commit created? Why?",
      "kind": "long",
      "points": 0,
      "options": [],
      "manual": true,
      "required": false
    },
    {
      "id": "bonus",
      "prompt": "Optional bonus reflection: What happened during the merge? How did it differ from Part 4? Why might Git create a merge commit, and what does the graph reveal?",
      "kind": "long",
      "points": 0,
      "options": [],
      "manual": true,
      "required": false
    }
  ],
  "courseSlot": "task1"
}$task_one$::jsonb;
begin
 insert into public.assignments(id,title,description,type,visible,version,published_version,course_slot)
 values(task_id,doc->>'title',doc->>'description','assignment',true,1,1,'task1');
 insert into public.assessment_courses(assessment_id,course_id)
 values(task_id,'70000000-0000-4000-8000-000000000001');
 insert into public.assessment_drafts(assessment_id,document) values(task_id,doc);
 insert into public.assessment_versions(assessment_id,version,document) values(task_id,1,doc);
 insert into private.assessment_keys(assessment_id,version,keys) values(task_id,1,'{}');
end $seed$;
commit;
