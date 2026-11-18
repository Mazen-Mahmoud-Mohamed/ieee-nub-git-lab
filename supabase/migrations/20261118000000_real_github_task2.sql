-- Additive Task 2 integration. No publication or changes to existing assessment rows.
begin;
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
   for r in select value from jsonb_array_elements(t->'rules') loop if coalesce(r->>'type','') not in ('repository','file','branch','commits','message','merged','isolation','criterion','github') then raise exception 'Unsupported validation rule'; end if;end loop;
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
     when 'github' then array['github'] when 'criterion' then array['criterion']
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
-- Generator input. Apply only the generated migration.
create table private.task2_template(id boolean primary key default true check(id), document jsonb not null, answer_keys jsonb not null default '{}');
insert into private.task2_template(document) values('{"schemaVersion":1,"practicalSource":"github-task2-v1","gradingPolicy":"independent-v2","courseSlot":"task2","title":"Task 2 · GitHub Collaboration & Advanced Git","description":"Smart Plant Monitor: real GitHub collaboration. 100 practical + 50 theory points.","instructions":"Study Session 2 slides 28–61. Fork https://github.com/Mazen-Mahmoud-Mohamed/ieee-nub-git-task2-starter with ALL branches (uncheck Copy the default branch only). Work in your personal fork. Merge the LCD history, resolve dryThreshold to 38 and retain simulated LCD output. Use your own fork for issues and pull requests. Follow each rubric item, including the explicit buzzer improvement and README sections. Check My Work captures server-verified evidence; repeat after corrections. Submission freezes the latest accepted check and your theory answers. Partial work and unanswered theory are allowed. Stash, clone, pull and local-copy retention have no automatic command-execution marks. Merge topology does not prove a local conflict actually occurred.","type":"assignment","format":"mixed","projectName":"Task2-GitHub","durationMinutes":0,"attemptLimit":1,"startsAt":null,"endsAt":null,"deadline":null,"releaseImmediately":false,"reviewAnswers":true,"gateTheory":false,"requireComplete":false,"starter":{"files":{},"initialize":false,"commit":false},"sections":[{"id":"task2-practical","title":"GitHub practical · 100 points","description":"Independent checks using real GitHub evidence.","steps":["Connect your personal GitHub account.","Install the read-only App on your selected fork.","Register owner/repository, push your work and choose Check My Work.","Correct failed checks, then review and submit your latest verified snapshot."],"tasks":[{"id":"t2-fork","title":"Personal starter fork","instructions":"Register your own personal fork of the supplied starter, including main and feature/lcd-display.\nVerification: Numeric repository identity, owner and fork parent/source network from GitHub.\nCorrection: Fork the starter under your connected personal account. Uncheck Copy the default branch only.","points":8,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-fork"}],"requirementWeights":{"t2-fork:rule-0-github":8}},{"id":"t2-merge","title":"Integrate the divergent histories","instructions":"Merge feature/lcd-display into main with a merge commit retaining both supplied histories. Keep the branch until grading.\nVerification: Main history and two-parent merge ancestry against pinned starter SHAs. Verifies topology, not that a local conflict prompt appeared.\nCorrection: Merge the original display branch into main, resolve, commit and push. Avoid squash for this merge.","points":12,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-merge"}],"requirementWeights":{"t2-merge:rule-0-github":12}},{"id":"t2-threshold","title":"Resolve dryThreshold to 38","instructions":"On main, retain one active const int dryThreshold = 38; declaration and remove conflict markers.\nVerification: sensor.ino at the captured main SHA, excluding comments. Structural check, not a hardware test.\nCorrection: Set the single dryThreshold declaration to 38, remove conflict markers, commit and push main.","points":10,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-threshold"}],"requirementWeights":{"t2-threshold:rule-0-github":10}},{"id":"t2-lcd","title":"Retain simulated LCD output","instructions":"Keep Serial.print(\"[LCD] \"); followed by the DRY SOIL / SOIL OK Serial.println on main.\nVerification: Active sensor.ino source at the captured main SHA.\nCorrection: Retain the simulated LCD print and conditional soil-status println. Commit and push.","points":8,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-lcd"}],"requirementWeights":{"t2-lcd:rule-0-github":8}},{"id":"t2-ignore-env","title":"Ignore .env","instructions":"Add an effective root .env rule to .gitignore without later negating it.\nVerification: Ordered supported root ignore rules at the captured main SHA.\nCorrection: Add .env on its own line to the root .gitignore. Remove later exceptions.","points":4,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-ignore-env"}],"requirementWeights":{"t2-ignore-env:rule-0-github":4}},{"id":"t2-ignore-logs","title":"Ignore log files","instructions":"Add *.log to .gitignore without later exceptions.\nVerification: Ordered supported root ignore rules at the captured main SHA.\nCorrection: Add *.log on its own line to the root .gitignore. Remove log exceptions.","points":4,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-ignore-logs"}],"requirementWeights":{"t2-ignore-logs:rule-0-github":4}},{"id":"t2-ignore-settings","title":"Ignore local settings","instructions":"Add an effective local-settings.txt rule to .gitignore.\nVerification: Ordered supported root ignore rules at the captured main SHA.\nCorrection: Add local-settings.txt on its own line to the root .gitignore.","points":4,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-ignore-settings"}],"requirementWeights":{"t2-ignore-settings:rule-0-github":4}},{"id":"t2-untrack","title":"Stop tracking local settings","instructions":"Remove local-settings.txt from main’s committed tree. Use git rm --cached locally to retain your copy.\nVerification: GitHub tree absence. Retaining a local copy cannot be verified remotely and earns no automatic marks.\nCorrection: Run git rm --cached local-settings.txt, commit and push. Historical copies remain.","points":10,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-untrack"}],"requirementWeights":{"t2-untrack:rule-0-github":10}},{"id":"t2-buzzer","title":"Implement the buzzer improvement","instructions":"On main, call tone(buzzerPin, 1000) when isDry and noTone(buzzerPin) otherwise, using an if/else block. Submit through feature/buzzer.\nVerification: Active main source structure plus a sensor.ino change on a same-repository feature/buzzer PR.\nCorrection: Use if (isDry) { tone(buzzerPin, 1000); } else { noTone(buzzerPin); } and merge your feature/buzzer PR.","points":10,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-buzzer"}],"requirementWeights":{"t2-buzzer:rule-0-github":10}},{"id":"t2-issue","title":"Describe the buzzer issue","instructions":"Create your own issue in your fork with buzzer in the title and at least 40 characters explaining the improvement.\nVerification: GitHub issue ID, author, title and body. Excludes pull requests.\nCorrection: Enable Issues on your fork and create or edit your buzzer issue with a clear explanation.","points":6,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-issue"}],"requirementWeights":{"t2-issue:rule-0-github":6}},{"id":"t2-pr","title":"Open a documented pull request","instructions":"Open your own feature/buzzer PR into your fork’s main. Use a title of 10+ characters, explanation of 40+ characters and Closes #N referencing a real issue on your fork.\nVerification: PR repository IDs, author, refs, title, body and existing local issue reference.\nCorrection: Push feature/buzzer. Open the PR into your own main, explain it and add Closes #N with your fork’s issue number.","points":8,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-pr"}],"requirementWeights":{"t2-pr:rule-0-github":8}},{"id":"t2-pr-merged","title":"Merge the buzzer pull request","instructions":"Merge your feature/buzzer PR into main and retain its merge commit in main ancestry.\nVerification: GitHub merged_at, merge_commit_sha and ancestry, independently of PR description quality.\nCorrection: Review and merge your buzzer PR into main, then push later corrections.","points":4,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-pr-merged"}],"requirementWeights":{"t2-pr-merged:rule-0-github":4}},{"id":"t2-review","title":"Receive a peer code review","instructions":"Ask another person to submit a nonempty review on your buzzer PR. Comments, approvals and requests for changes count. Bots and your own reviews do not.\nVerification: GitHub submitted review ID, human reviewer identity and body. Verifies the review artifact, not its quality.\nCorrection: Invite a classmate to use GitHub’s review form and submit specific written feedback.","points":6,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-review"}],"requirementWeights":{"t2-review:rule-0-github":6}},{"id":"t2-readme","title":"Document wiring, running and contribution","instructions":"Update README.md with Wiring, Run and Contributing Markdown headings, pins A0 and 8, and tone/noTone behavior. Include at least 40 characters under each heading.\nVerification: README content at the captured main SHA. Mechanical completeness check.\nCorrection: Add ## Wiring, ## Run and ## Contributing sections. Explain the pins, sketch testing and tone/noTone behavior.","points":6,"bonus":false,"rules":[{"type":"github","outcomeId":"t2-readme"}],"requirementWeights":{"t2-readme:rule-0-github":6}}]}],"questions":[{"id":"t2-q1","kind":"single","points":3,"prompt":"Why does Git stop with a content merge conflict? (Session 2, slide 28)","options":["Both branches changed the same lines differently","A branch name is too long","GitHub is offline"],"manual":false,"required":false},{"id":"t2-q2","kind":"multiple","points":3,"prompt":"Select the steps for resolving a conflict. (Session 2, slide 29)","options":["Read both sides and choose the intended code","Remove all conflict markers","Test, stage and commit the resolved file","Always discard the other branch"],"manual":false,"required":false},{"id":"t2-q3","kind":"boolean","points":3,"prompt":"Adding a tracked file to .gitignore automatically stops Git tracking it. (Session 2, slide 31)","options":["True","False"],"manual":false,"required":false},{"id":"t2-q4","kind":"fill-blank","points":4,"prompt":"Type the command to stop tracking local-settings.txt while retaining the local copy. (Session 2, slide 31)","options":[],"manual":false,"required":false,"answerMatching":"git-command"},{"id":"t2-q5","kind":"single","points":3,"prompt":"You must switch tasks with unfinished tracked-file edits and no half-done commit. What should you do first? (Session 2, slide 34)","options":["git stash push","git reset --hard","Delete the branch"],"manual":false,"required":false},{"id":"t2-q6","kind":"choice-complete","points":3,"prompt":"Complete: stash apply restores the work and ___ the stash entry. (Session 2, slide 34)","options":["keeps","removes","publishes"],"manual":false,"required":false},{"id":"t2-q7","kind":"fill-blank","points":3,"prompt":"Type the command that lists remote names and their fetch/push URLs. (Session 2, slide 35)","options":[],"manual":false,"required":false,"answerMatching":"git-command"},{"id":"t2-q8","kind":"single","points":3,"prompt":"What does -u do in git push -u origin main? (Session 2, slide 38)","options":["Remembers the upstream branch for later push/pull","Deletes remote history","Makes the repository public"],"manual":false,"required":false},{"id":"t2-q9","kind":"single","points":3,"prompt":"A teammate pushed first. Your push was rejected with fetch first. What is the safe next step? (Session 2, slide 39–41)","options":["Pull, review and resolve if necessary, then push","Force push immediately","Delete the remote"],"manual":false,"required":false},{"id":"t2-q10","kind":"multiple","points":3,"prompt":"Which statements about git clone are correct? (Session 2, slide 42)","options":["Copies repository history to your computer","Sets origin automatically","Use pull for later updates","Creates a GitHub fork"],"manual":false,"required":false},{"id":"t2-q11","kind":"boolean","points":3,"prompt":"A fork is a copy under your GitHub account; cloning then copies it to your computer. (Session 2, slide 43)","options":["True","False"],"manual":false,"required":false},{"id":"t2-q12","kind":"single","points":4,"prompt":"How do you propose a change where you have no write access? (Session 2, slide 44–46)","options":["Fork, clone your fork, branch, push and open a pull request","Clone and push directly to its main","Star the repository"],"manual":false,"required":false},{"id":"t2-q13","kind":"single","points":4,"prompt":"A reviewer requests changes. How do you update the existing pull request? (Session 2, slide 47–49)","options":["Push more commits to its existing branch and request review","Always open a new pull request","Force push the base main branch"],"manual":false,"required":false},{"id":"t2-q14","kind":"choice-complete","points":4,"prompt":"Complete: a PR containing Closes #12 closes that issue when merged into ___. (Session 2, slide 50–53)","options":["the default branch","any local branch","the stash"],"manual":false,"required":false},{"id":"t2-q15","kind":"multiple","points":4,"prompt":"Select the correct GitHub collaboration statements. (Session 2, slide 51–58)","options":["README explains wiring, running and contributing","Starring bookmarks a repository","Organizations own repositories and group members into teams","Every contributor automatically has direct write access"],"manual":false,"required":false}]}'::jsonb);
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

commit;
