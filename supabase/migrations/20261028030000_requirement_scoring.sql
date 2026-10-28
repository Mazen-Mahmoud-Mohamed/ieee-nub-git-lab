-- Opt-in scoring for NEW published versions only. No existing records are updated.
-- Apply before deploying assessment-attempt, then the frontend.
begin;
-- Fail atomically instead of waiting indefinitely behind production traffic.
set local lock_timeout = '5s';
set local statement_timeout = '60s';
alter table public.task_results add column requirement_results jsonb;
-- Student breakdowns follow existing release and response-review policies.
create policy own_released_requirement_results on public.task_results for select to authenticated using (
  exists(select 1 from public.attempts a join public.grading_summaries g on g.attempt_id=a.id
    join public.assessment_versions v on v.assessment_id=a.assignment_id and v.version=a.assignment_version
    where a.id=task_results.attempt_id and a.student_id=(select auth.uid()) and g.released
      and v.document->>'gradingPolicy'='requirements-v1' and coalesce((v.document->>'reviewAnswers')::boolean,true))
);
create function private.validate_requirement_scoring() returns trigger language plpgsql set search_path='' as $$
declare doc jsonb:=new.document;s jsonb;t jsonb;r jsonb;ri int;expected text[];suffixes text[];suffix text;weights jsonb;entry record;total numeric;catalog jsonb:='{"repo-1":["initialized","name","email","main-commit"],"repo-2":["initialized","name","email","main"],"files-1":["about.txt-committed","goals.txt-committed","notes.txt-committed"],"files-2":["about.txt-exists","about.txt-draft","goals.txt-exists","goals.txt-draft","notes.txt-exists","notes.txt-draft"],"separate-1":["about.txt-focused","about.txt-original-content","goals.txt-focused","goals.txt-original-content","notes.txt-focused","notes.txt-original-content","personal-message","intro-order"],"separate-2":["about.txt-focused","about.txt-original-content","goals.txt-focused","goals.txt-original-content","goals.txt-message","notes.txt-focused","notes.txt-original-content","notes.txt-message","personal-message"],"goals-1":["original-goals","meaningful-intros","later-goals","four-commits"],"goals-2":["tracked","committed"],"feature-1":["feature-branch","skills-content","skills-introduction"],"feature-2":["feature-branch","skills-content","skills-introduction"],"isolation-1":["intro-parent","no-earlier-skills","skills-message"],"isolation-2":["intro-parent","no-earlier-skills","skills-message"],"merged-1":["main-history","feature-history","main-skills","ancestry"],"merged-2":["main-history","feature-history","main-skills","ancestry"],"clean-1":["on-main","main-saved","clean-tree"],"clean-2":["on-main","main-saved","clean-tree"],"bonus-1":["hobbies-branch","divergent-merge","bonus-ancestry"],"bonus-2":["hobbies-branch","divergent-merge","bonus-ancestry"]}'::jsonb;
begin
 if not (doc ? 'gradingPolicy') then return new;end if;
 if doc->>'gradingPolicy' is distinct from 'requirements-v1' or doc->'gateTheory' is distinct from 'false'::jsonb or doc->'requireComplete' is distinct from 'false'::jsonb then raise exception 'Invalid requirement scoring policy';end if;
 for s in select value from jsonb_array_elements(doc->'sections') loop
  for t in select value from jsonb_array_elements(s->'tasks') loop
   if (t->>'points')::numeric=0 then
    if coalesce(t->'requirementWeights','{}'::jsonb)<>'{}'::jsonb then raise exception 'Informational tasks do not have scored requirement weights';end if;
    continue;
   end if;
   expected:='{}';ri:=0;
   for r in select value from jsonb_array_elements(t->'rules') loop
    suffixes:=case r->>'type'
     when 'legacy' then array(select jsonb_array_elements_text(catalog->((r->>'outcomeId')||'-'||coalesce(r->>'revision','1'))))
     when 'repository' then array['initialized']||case when r ? 'branch' then array['branch'] else '{}'::text[] end||case when coalesce((r->>'clean')::boolean,false) then array['clean'] else '{}'::text[] end
     when 'file' then array['exists']||case when coalesce(r->>'match','exists')<>'exists' then array['content'] else '{}'::text[] end
     when 'branch' then array['exists'] when 'commits' then array['count'] when 'message' then array['message'] when 'merged' then array['source','target','merged'] when 'isolation' then array['introduction'] else '{}'::text[] end;
    if cardinality(suffixes)=0 then raise exception 'Unknown scored requirements';end if;
    foreach suffix in array suffixes loop expected:=array_append(expected,(t->>'id')||':rule-'||ri||'-'||suffix);end loop;ri:=ri+1;
   end loop;
   weights:=t->'requirementWeights';total:=0;
   if jsonb_typeof(weights) is distinct from 'object' then raise exception 'Explicit requirement weights are required';end if;
   if (select count(*) from jsonb_object_keys(weights))<>cardinality(expected) then raise exception 'Requirement weight IDs do not match checks';end if;
   for entry in select * from jsonb_each(weights) loop
    if not entry.key=any(expected) or jsonb_typeof(entry.value)<>'number' or (entry.value::text)::numeric<=0 or (entry.value::text)::numeric<>round((entry.value::text)::numeric,2) then raise exception 'Invalid requirement weight';end if;
    total:=total+(entry.value::text)::numeric;
   end loop;
   if total<>(t->>'points')::numeric then raise exception 'Requirement weights must total task points';end if;
  end loop;
 end loop;
 return new;
end $$;
revoke all on function private.validate_requirement_scoring() from public,anon,authenticated,service_role;
create trigger requirement_scoring_draft before insert or update of document on public.assessment_drafts for each row execute function private.validate_requirement_scoring();
create trigger requirement_scoring_version before insert on public.assessment_versions for each row execute function private.validate_requirement_scoring();
create or replace function private.finish_assessment(p_attempt uuid,p_auto boolean,p_key uuid default null) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.attempts;c private.verified_checkpoints;doc jsonb;item jsonb;q jsonb;ref uuid;manual_pending boolean;auto_score numeric:=0;
begin
 select * into a from public.attempts where id=p_attempt for update;if a.id is null then raise exception 'Attempt not found';end if;if a.status<>'in_progress' then return a.receipt;end if;
 select document into doc from public.assessment_versions where assessment_id=a.assignment_id and version=a.assignment_version;
 select * into c from private.verified_checkpoints where attempt_id=a.id;
 if c.attempt_id is null then c.payload:='{"snapshot":{"version":1,"entries":{"/":{"kind":"dir","data":[]}}},"answers":{},"events":[]}';c.outcomes:='[]';c.objective_grades:='[]';c.practical_score:=0;c.objective_score:=0;end if;
 manual_pending:=exists(select 1 from jsonb_array_elements(doc->'questions') x where ((x->>'manual')::boolean or x->>'kind' not in ('single','multiple','boolean')) and (x->>'points')::numeric>0);
 ref:=gen_random_uuid();
 insert into public.workspace_snapshots(attempt_id,snapshot) values(a.id,c.payload->'snapshot');
 insert into public.student_answers(attempt_id,question_id,answer) select a.id,key,value from jsonb_each_text(coalesce(c.payload->'answers','{}'));
 for item in select value from jsonb_array_elements(c.outcomes) loop insert into public.task_results(attempt_id,task_key,passed,points,requirement_results) values(a.id,item->>'id',(item->>'passed')::boolean,case when doc->>'gradingPolicy'='requirements-v1' then (item->>'earned')::numeric when (item->>'passed')::boolean then (item->>'points')::numeric else 0 end,case when doc->>'gradingPolicy'='requirements-v1' then item->'requirements' else null end);end loop;
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
 if doc->>'gradingPolicy'='requirements-v1' then
  if jsonb_array_length(p_outcomes)<>(select count(*) from jsonb_array_elements(doc->'sections') s cross join lateral jsonb_array_elements(s->'tasks') t)
    or exists(select 1 from jsonb_array_elements(p_outcomes) x where not (x ?& array['earned','requirements']) or (x->>'earned')::numeric not between 0 and (x->>'points')::numeric)
    or p_practical<>(select coalesce(sum((x->>'earned')::numeric),0) from jsonb_array_elements(p_outcomes) x)
  then raise exception 'Requirement scoring requires the updated authoritative grader';end if;
 end if;
 if p_finalize and coalesce((doc->>'requireComplete')::boolean,false) then
  if exists(select 1 from jsonb_array_elements(p_outcomes) x where not coalesce((x->>'bonus')::boolean,false) and not (x->>'passed')::boolean) or exists(select 1 from jsonb_array_elements(doc->'questions') x where (x->>'required')::boolean and length(trim(coalesce(p_payload->'answers'->>(x->>'id'),'')))=0) then raise exception 'Required work is incomplete';end if;
 end if;
 insert into private.verified_checkpoints values(a.id,p_revision+1,p_payload,p_outcomes,p_grades,p_practical,p_objective,clock_timestamp(),p_key) on conflict(attempt_id) do update set revision=excluded.revision,payload=excluded.payload,outcomes=excluded.outcomes,objective_grades=excluded.objective_grades,practical_score=excluded.practical_score,objective_score=excluded.objective_score,accepted_at=excluded.accepted_at,idempotency_key=excluded.idempotency_key;
 update public.attempts set checkpoint_revision=checkpoint_revision+1 where id=a.id;
 if p_finalize then ref:=private.finish_assessment(a.id,false,p_key);end if;
 return jsonb_build_object('receipt',ref,'revision',p_revision+1,'status',case when p_finalize then 'submitted' else 'in_progress' end,'server_now',clock_timestamp());
end $$;
commit;
