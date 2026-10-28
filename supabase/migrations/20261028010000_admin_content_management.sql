-- Additive management. No student evidence, published version or official grade is removed.
create table private.data_administrators (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
alter table private.data_administrators enable row level security;
revoke all on private.data_administrators from public,anon,authenticated;
create function public.is_data_administrator() returns boolean language sql stable security definer set search_path='' as $$
 select public.is_instructor() and exists(select 1 from private.data_administrators where user_id=auth.uid())
$$;

create table private.record_management (
 kind text not null,record_id uuid not null,revision int not null default 0,
 archived_at timestamptz,archived_by uuid references auth.users on delete set null,
 deleted_at timestamptz,deleted_by uuid references auth.users on delete set null,
 reason text not null default '',invalidation_reason text not null default '',invalidated_at timestamptz,invalidated_by uuid references auth.users on delete set null,primary key(kind,record_id)
);
alter table private.record_management enable row level security;
revoke all on private.record_management from public,anon,authenticated;
create table public.admin_activity (
 id uuid primary key default gen_random_uuid(),actor_id uuid references auth.users on delete set null,
 action text not null,record_type text not null,record_id uuid not null,reason text not null default '',
 metadata jsonb not null default '{}',created_at timestamptz not null default clock_timestamp()
);
alter table public.admin_activity enable row level security;
revoke all on public.admin_activity from public,anon,authenticated;
grant select on public.admin_activity to authenticated;
create policy admin_activity_read on public.admin_activity for select to authenticated using((select public.is_instructor()));
create index admin_activity_order on public.admin_activity(created_at desc,id desc);
create function private.retain_management_audit() returns trigger language plpgsql set search_path='' as $$begin
 if tg_op='UPDATE' and old.actor_id is not null and new.actor_id is null and (to_jsonb(old)-'actor_id')=(to_jsonb(new)-'actor_id') then return new;end if;
 raise exception 'Administrative audit records are retained';end$$;
create trigger retain_management_audit before update or delete on public.admin_activity for each row execute function private.retain_management_audit();
create function private.management_log(p_action text,p_kind text,p_id uuid,p_reason text,p_before jsonb,p_after jsonb) returns void language sql security definer set search_path='' as $$
 insert into public.admin_activity(actor_id,action,record_type,record_id,reason,metadata)
 values(auth.uid(),p_action,p_kind,p_id,coalesce(p_reason,''),jsonb_build_object('before',p_before,'after',p_after))
$$;

create function private.log_data_administrator_change() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform private.management_log(case when tg_op='INSERT' then 'data_administrator_granted' else 'data_administrator_revoked' end,'authorization',case when tg_op='INSERT' then new.user_id else old.user_id end,'Privileged role provisioning',jsonb_build_object('data_administrator',tg_op='DELETE'),jsonb_build_object('data_administrator',tg_op='INSERT'));
 return null;
end $$;
create trigger audit_data_administrator after insert or delete on private.data_administrators for each row execute function private.log_data_administrator_change();
revoke all on function private.log_data_administrator_change() from public,anon,authenticated;

create table public.learning_items (
 id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('course','section','lesson')),
 parent_id uuid references public.learning_items(id),title text not null,
 published_version int not null default 0,created_at timestamptz not null default now(),
 archived_at timestamptz,archived_by uuid references auth.users on delete set null,
 deleted_at timestamptz,deleted_by uuid references auth.users on delete set null
);
create table private.learning_drafts (item_id uuid primary key references public.learning_items,document jsonb not null);
create table public.learning_versions (
 item_id uuid not null references public.learning_items,version int not null,
 document jsonb not null,created_at timestamptz not null default now(),primary key(item_id,version)
);
create table public.assessment_courses (
 assessment_id uuid primary key references public.assignments,
 course_id uuid not null references public.learning_items
);
create index learning_parent on public.learning_items(parent_id,created_at,id);
create index assessment_course_lookup on public.assessment_courses(course_id,assessment_id);
alter table public.learning_items enable row level security;
alter table public.learning_versions enable row level security;
alter table public.assessment_courses enable row level security;
alter table private.learning_drafts enable row level security;
revoke all on public.learning_items,public.learning_versions,public.assessment_courses,private.learning_drafts from public,anon,authenticated;
grant select on public.learning_items,public.learning_versions,public.assessment_courses to authenticated;
create policy learning_items_staff on public.learning_items for select to authenticated using((select public.is_instructor()));
create policy learning_versions_staff on public.learning_versions for select to authenticated using((select public.is_instructor()));
create policy assessment_courses_staff on public.assessment_courses for select to authenticated using((select public.is_instructor()));
create trigger retain_learning_version before update or delete on public.learning_versions for each row execute function private.immutable_assessment_version();

create function private.enforce_learning_relationships() returns trigger language plpgsql security definer set search_path='' as $$declare parent_kind text;begin
 if tg_op='UPDATE' then
  if new.kind is distinct from old.kind or new.parent_id is distinct from old.parent_id then raise exception 'Learning hierarchy is fixed; create a new item to change its parent';end if;
  return new;
 end if;
 if new.kind='course' then if new.parent_id is not null then raise exception 'A course cannot have a parent';end if;
 else
  select kind into parent_kind from public.learning_items where id=new.parent_id;
  if parent_kind is distinct from (case when new.kind='section' then 'course' else 'section' end) then raise exception 'Invalid course, section or lesson relationship';end if;
 end if;return new;
end $$;
create trigger learning_relationship_guard before insert or update on public.learning_items for each row execute function private.enforce_learning_relationships();
create function private.enforce_assessment_course() returns trigger language plpgsql security definer set search_path='' as $$begin
 if not exists(select 1 from public.learning_items where id=new.course_id and kind='course') then raise exception 'Assessment links require a course';end if;return new;
end $$;
create trigger assessment_course_guard before insert or update on public.assessment_courses for each row execute function private.enforce_assessment_course();
revoke all on function private.enforce_learning_relationships(),private.enforce_assessment_course() from public,anon,authenticated;

-- Revisions also change when older, supported editors update a managed record.
create function private.touch_management_record() returns trigger language plpgsql security definer set search_path='' as $$
declare k text:=tg_argv[0];target uuid;
begin
 target:=case when tg_op='DELETE' then (to_jsonb(old)->>'assessment_id')::uuid when tg_table_name in ('assessment_drafts','assessment_courses') then (to_jsonb(new)->>'assessment_id')::uuid else (to_jsonb(new)->>'id')::uuid end;
 insert into private.record_management(kind,record_id,revision) values(k,target,1)
 on conflict(kind,record_id) do update set revision=private.record_management.revision+1;
 if tg_op='UPDATE' and tg_table_name in ('assignments','question_bank') and (to_jsonb(old)->'archived') is distinct from (to_jsonb(new)->'archived') then
  update private.record_management set archived_at=case when (to_jsonb(new)->>'archived')::boolean then coalesce(archived_at,clock_timestamp()) else null end,archived_by=case when (to_jsonb(new)->>'archived')::boolean then auth.uid() else null end where kind=k and record_id=target;
  perform private.management_log('visibility_changed',k,target,'',jsonb_build_object('archived',to_jsonb(old)->'archived'),jsonb_build_object('archived',to_jsonb(new)->'archived'));
 end if;return new;
end $$;
create trigger manage_assignment_revision after insert or update on public.assignments for each row execute function private.touch_management_record('assessment');
create trigger manage_draft_revision after insert or update on public.assessment_drafts for each row execute function private.touch_management_record('assessment');
create trigger manage_attempt_revision after insert or update on public.attempts for each row execute function private.touch_management_record('attempt');
create trigger manage_bank_revision after insert or update on public.question_bank for each row execute function private.touch_management_record('question');
create trigger manage_request_revision after insert or update on public.attempt_help_requests for each row execute function private.touch_management_record('request');
create trigger manage_course_revision after insert or update or delete on public.assessment_courses for each row execute function private.touch_management_record('assessment');
create trigger manage_learning_revision after insert or update on public.learning_items for each row execute function private.touch_management_record('learning');
create function private.protect_trashed_content() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;begin
 target:=case when tg_op='DELETE' then (to_jsonb(old)->>'assessment_id')::uuid when tg_table_name in ('assessment_drafts','assessment_courses') then (to_jsonb(new)->>'assessment_id')::uuid else (to_jsonb(new)->>'id')::uuid end;
 if exists(select 1 from private.record_management where kind=tg_argv[0] and record_id=target and deleted_at is not null) then raise exception 'Restore this record from Trash before editing';end if;
 if tg_table_name='assessment_drafts' and exists(select 1 from public.assignments where id=target and archived) then raise exception 'Restore archived content before editing';end if;
 if tg_op='UPDATE' and coalesce((to_jsonb(old)->>'archived')::boolean,false) and (to_jsonb(old)-'archived'-'visible') is distinct from (to_jsonb(new)-'archived'-'visible') then raise exception 'Restore archived content before editing';end if;
 return new;
end $$;
create trigger protect_trashed_assessment before update on public.assignments for each row execute function private.protect_trashed_content('assessment');
create trigger protect_trashed_draft before insert or update on public.assessment_drafts for each row execute function private.protect_trashed_content('assessment');
create trigger protect_trashed_bank before insert or update on public.question_bank for each row execute function private.protect_trashed_content('question');

create function public.manage_learning_save(p_id uuid,p_kind text,p_parent uuid,p_document jsonb,p_revision int,p_publish boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(p_id,gen_random_uuid());item public.learning_items;parent public.learning_items;doc jsonb;link jsonb;rev int;next_version int;
begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 perform pg_advisory_xact_lock(hashtext('git-lab-management'));
 if p_kind not in ('course','section','lesson') or jsonb_typeof(p_document) is distinct from 'object' or length(trim(coalesce(p_document->>'title',''))) not between 1 and 180 or length(coalesce(p_document->>'body',''))>20000 or jsonb_typeof(p_document->'links') is distinct from 'array' or jsonb_array_length(p_document->'links')>20 then raise exception 'Enter a title, readable text and up to 20 resource links';end if;
 for link in select value from jsonb_array_elements(p_document->'links') loop
  if jsonb_typeof(link) is distinct from 'object' or length(trim(coalesce(link->>'label',''))) not between 1 and 100 or length(coalesce(link->>'url',''))>2000 or coalesce(link->>'url','') !~ '^https://[^[:space:]/]+(/[^[:space:]]*)?$' then raise exception 'Resources need a label and an HTTPS URL';end if;
 end loop;
 doc:=jsonb_build_object('title',trim(p_document->>'title'),'body',coalesce(p_document->>'body',''),'links',p_document->'links');
 if p_kind='course' and p_parent is not null then raise exception 'A course has no parent';end if;
 if p_kind<>'course' then
  select * into parent from public.learning_items where id=p_parent for update;
  if parent.id is null or parent.deleted_at is not null or parent.archived_at is not null or parent.kind<>(case when p_kind='section' then 'course' else 'section' end) then raise exception 'Choose an active parent course or section';end if;
 end if;
 if exists(select 1 from private.record_management where kind='learning' and record_id=target and deleted_at is not null) then raise exception 'Restore from Trash first, or create new content after permanent deletion';end if;
 if p_id is not null and p_revision is not null and not exists(select 1 from public.learning_items where id=p_id) then raise exception 'Content not found';end if;
 if p_id is not null and exists(select 1 from public.learning_items where id=p_id) then
  select * into item from public.learning_items where id=p_id for update;
  select coalesce(revision,0) into rev from private.record_management where kind='learning' and record_id=p_id;
  if item.id is null or item.kind<>p_kind or item.parent_id is distinct from p_parent then raise exception 'Content not found or parent changed';end if;
  if item.deleted_at is not null or item.archived_at is not null then raise exception 'Restore content before editing';end if;
  if p_revision is null or p_revision<>coalesce(rev,0) then raise exception 'Record changed. Refresh before saving';end if;
 else
  insert into public.learning_items(id,kind,parent_id,title) values(target,p_kind,p_parent,doc->>'title');
 end if;
 insert into private.learning_drafts(item_id,document) values(target,doc) on conflict(item_id) do update set document=excluded.document;
 if p_publish then
  select coalesce(max(version),0)+1 into next_version from public.learning_versions where item_id=target;
  insert into public.learning_versions values(target,next_version,doc,clock_timestamp());
  update public.learning_items set title=doc->>'title',published_version=next_version where id=target;
 else update public.learning_items set title=doc->>'title' where id=target;end if;
 perform private.management_log(case when p_publish then 'published' else 'draft_saved' end,p_kind,target,'',jsonb_build_object('version',coalesce(item.published_version,0)),jsonb_build_object('version',coalesce(next_version,item.published_version,0)));
 return target;
end $$;
create function public.manage_learning_edit(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 select to_jsonb(i)||jsonb_build_object('revision',coalesce(m.revision,0),'document',d.document) into result from public.learning_items i join private.learning_drafts d on d.item_id=i.id left join private.record_management m on m.kind='learning' and m.record_id=i.id where i.id=p_id;
 if result is null then raise exception 'Content not found';end if;return result;
end $$;
create function public.learning_catalog(p_parent uuid default null,p_offset int default 0,p_limit int default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid page';end if;
 with recursive visible as (
  select i.*,v.document from public.learning_items i join public.learning_versions v on v.item_id=i.id and v.version=i.published_version where i.kind='course' and i.archived_at is null and i.deleted_at is null
  union all select i.*,v.document from public.learning_items i join visible parent on parent.id=i.parent_id join public.learning_versions v on v.item_id=i.id and v.version=i.published_version where i.archived_at is null and i.deleted_at is null
 ),children as(select * from visible where parent_id is not distinct from p_parent),page as(select * from children order by created_at,id offset p_offset limit p_limit)
 select jsonb_build_object('managed',true,'parent',(select jsonb_build_object('id',id,'parent_id',parent_id,'kind',kind,'document',document) from visible where id=p_parent),'total',(select count(*) from children),'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'document',document,'version',published_version) order by created_at,id) from page),'[]')) into result;
 if p_parent is not null and result->'parent'='null'::jsonb then raise exception 'Course content is unavailable';end if;return result;
end $$;

create function public.manage_course_options() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',id,'title',title) order by title,id) from public.learning_items where kind='course' and archived_at is null and deleted_at is null),'[]');
end $$;
create function public.manage_assessment_course(p_assessment uuid,p_course uuid,p_revision int) returns void language plpgsql security definer set search_path='' as $$declare old_course uuid;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 perform pg_advisory_xact_lock(hashtext('git-lab-management'));
 perform 1 from public.assignments where id=p_assessment for update;if not found then raise exception 'Assessment not found';end if;
 if p_revision is null or p_revision<>coalesce((select revision from private.record_management where kind='assessment' and record_id=p_assessment),0) then raise exception 'Record changed. Refresh before assigning a course';end if;
 if exists(select 1 from private.record_management where kind='assessment' and record_id=p_assessment and deleted_at is not null) then raise exception 'Restore this assessment first';end if;
 if p_course is not null and not exists(select 1 from public.learning_items where id=p_course and kind='course' and archived_at is null and deleted_at is null) then raise exception 'Choose an active course';end if;
 select course_id into old_course from public.assessment_courses where assessment_id=p_assessment;
 delete from public.assessment_courses where assessment_id=p_assessment;
 if p_course is not null then insert into public.assessment_courses values(p_assessment,p_course);end if;
 perform private.management_log('course_assigned','assessment',p_assessment,'',jsonb_build_object('course',old_course),jsonb_build_object('course',p_course));
end $$;

-- Invalidation closes only an unsubmitted assignment, never a submitted exam or grade.
alter table public.attempts drop constraint attempts_status_check;
alter table public.attempts add constraint attempts_status_check check(status in ('in_progress','submitted','pending_review','graded','expired','restarted','invalidated'));
create function private.protect_invalidated_attempt() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.status='invalidated' and new is distinct from old then raise exception 'Invalidated attempt evidence is read only';end if;return new;
end $$;
create trigger protect_invalidated_attempt before update on public.attempts for each row execute function private.protect_invalidated_attempt();
create function private.reject_invalidated_grade() returns trigger language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.attempts where id=new.attempt_id and status='invalidated' for update;
 if found then raise exception 'Invalidated attempts cannot receive grades';end if;return new;
end $$;
create trigger invalidated_grade_guard before insert or update on public.grading_results for each row execute function private.reject_invalidated_grade();
create trigger invalidated_summary_guard before insert or update on public.grading_summaries for each row execute function private.reject_invalidated_grade();
create trigger invalidated_draft_guard before insert or update on private.grading_drafts for each row execute function private.reject_invalidated_grade();

create function private.management_snapshot(p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare m private.record_management;label text;state text;archived boolean:=false;deleted boolean:=false;can_trash boolean:=false;can_purge boolean:=false;can_invalidate boolean:=false;why text:='';related int:=0;a public.attempts;l public.learning_items;ass public.assignments;q public.question_bank;r public.attempt_help_requests;is_admin boolean:=public.is_data_administrator();effects jsonb:='{}';
begin
 select * into m from private.record_management where kind=p_kind and record_id=p_id;
 if p_kind='assessment' then
  select * into ass from public.assignments where id=p_id;if ass.id is null then return null;end if;
  label:=coalesce((select document->>'title' from public.assessment_drafts where assessment_id=p_id),ass.title);state:=case when ass.published_version>0 then 'published' else 'draft' end;archived:=ass.archived;
  select count(*) into related from public.attempts where assignment_id=p_id;
  can_trash:=not exists(select 1 from public.assessment_versions where assessment_id=p_id) and related=0 and not exists(select 1 from public.student_enrollments where assignment_id=p_id);
  effects:=jsonb_build_object('draft_documents',(select count(*) from public.assessment_drafts where assessment_id=p_id),'draft_sections',(select count(*) from public.assignment_sections where assignment_id=p_id),'draft_tasks',(select count(*) from public.assignment_tasks t join public.assignment_sections sec on sec.id=t.section_id where sec.assignment_id=p_id),'draft_questions',(select count(*) from public.questions where assignment_id=p_id),'draft_rubrics',(select count(*) from private.question_rubrics rubric_row join public.questions question_row on question_row.id=rubric_row.question_id where question_row.assignment_id=p_id),'course_links',(select count(*) from public.assessment_courses where assessment_id=p_id),'student_attempts',related);
  related:=(select sum(value::int) from jsonb_each_text(effects));
  can_purge:=can_trash;why:=case when can_trash then 'An unpublished draft with no student enrollments or attempt history. Trash is reversible; permanent deletion is available only from Trash.' else 'Published versions, enrollments and attempt history are retained. Archive this assessment instead.' end;
 elsif p_kind='question' then
  select * into q from public.question_bank where id=p_id;if q.id is null then return null;end if;
  label:=q.document->>'prompt';state:='question bank';archived:=q.archived;can_trash:=true;can_purge:=true;why:='Only this reusable bank copy is managed. Existing assessment copies and private answer keys stay unchanged.';
 elsif p_kind='learning' then
  select * into l from public.learning_items where id=p_id;if l.id is null then return null;end if;
  label:=l.title;state:=l.kind||case when l.published_version>0 then ' · published' else ' · draft' end;archived:=l.archived_at is not null;
  select count(*) into related from public.learning_items where parent_id=p_id;
  related:=related+(select count(*) from public.assessment_courses where course_id=p_id);
  can_trash:=related=0;can_purge:=can_trash and not exists(select 1 from public.learning_versions where item_id=p_id);
  why:='Keep published learning versions and linked content. Remove or manage child items and course links individually.';
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
create function public.manage_preview(p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 result:=private.management_snapshot(p_kind,p_id);if result is null then raise exception 'Record not found';end if;return result;
end $$;

create function public.manage_records(p_kind text,p_records jsonb,p_action text,p_reason text default '',p_confirmation text default '') returns jsonb language plpgsql security definer set search_path='' as $$
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
    -- Explicitly disclosed legacy draft children only; published/enrolled records cannot reach here.
    delete from public.assignment_sections where assignment_id=target;
    delete from public.questions where assignment_id=target;
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

create function public.manage_list(p_kind text,p_state text default 'active',p_search text default '',p_offset int default 0,p_limit int default 25,p_parent uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_kind not in ('assessment','question','attempt','request','learning') or p_state not in ('active','archived','trash','all') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 or length(p_search)>200 then raise exception 'Invalid filters';end if;
 with source as (
  select id,created_at,title label from public.assignments where p_kind='assessment'
  union all select id,updated_at,document->>'prompt' from public.question_bank where p_kind='question'
  union all select a.id,a.created_at,concat_ws(' ',p.full_name,u.email,s.title,a.status) from public.attempts a join public.profiles p on p.id=a.student_id join auth.users u on u.id=a.student_id join public.assignments s on s.id=a.assignment_id where p_kind='attempt'
  union all select r.id,r.created_at,concat_ws(' ',p.full_name,u.email,r.status) from public.attempt_help_requests r join public.profiles p on p.id=r.student_id join auth.users u on u.id=r.student_id where p_kind='request'
  union all select id,created_at,title from public.learning_items where p_kind='learning' and (parent_id is not distinct from p_parent or (p_parent is null and p_state in ('archived','trash','all')))
 ),snapshots as(select s.*,private.management_snapshot(p_kind,id) as record from source s where p_search='' or label ilike '%'||p_search||'%'),filtered as(select * from snapshots where p_state='all' or (p_state='trash' and (record->>'deleted')::boolean) or (p_state='archived' and (record->>'archived')::boolean and not (record->>'deleted')::boolean) or (p_state='active' and not (record->>'archived')::boolean and not (record->>'deleted')::boolean)),page as(select * from filtered order by created_at desc,id desc offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(record||jsonb_build_object('description',label) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;
create function public.manage_activity(p_offset int default 0,p_limit int default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid page';end if;
 with all_events as(
  select id,actor_id,action,record_type,record_id::text,reason,metadata,created_at from public.admin_activity
  union all select id,actor_id,action,'legacy',target_id,'','{}'::jsonb,created_at from public.audit_logs
 ),page as(select e.*,coalesce(p.full_name,'Authorized account') as actor_name from all_events e left join public.profiles p on p.id=e.actor_id order by e.created_at desc,e.id desc offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from all_events),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;

-- Student state retains evidence and explains an invalidation without changing grades.
alter function public.assessment_state(uuid) set schema private;
revoke all on function private.assessment_state(uuid) from public,anon,authenticated;
create function public.assessment_state(p_attempt uuid) returns jsonb language plpgsql security definer set search_path='' as $$declare result jsonb;begin
 result:=private.assessment_state(p_attempt);
 if result->>'status'='invalidated' then result:=result||jsonb_build_object('invalidation_reason',(select invalidation_reason from private.record_management where kind='attempt' and record_id=p_attempt));end if;return result;
end $$;

revoke all on function public.is_data_administrator(),public.manage_learning_save(uuid,text,uuid,jsonb,int,boolean),public.manage_learning_edit(uuid),public.manage_course_options(),public.manage_assessment_course(uuid,uuid,int),public.manage_preview(text,uuid),public.manage_records(text,jsonb,text,text,text),public.manage_list(text,text,text,int,int,uuid),public.manage_activity(int,int),public.assessment_state(uuid),public.learning_catalog(uuid,int,int) from public,anon;
grant execute on function public.is_data_administrator(),public.manage_learning_save(uuid,text,uuid,jsonb,int,boolean),public.manage_learning_edit(uuid),public.manage_course_options(),public.manage_assessment_course(uuid,uuid,int),public.manage_preview(text,uuid),public.manage_records(text,jsonb,text,text,text),public.manage_list(text,text,text,int,int,uuid),public.manage_activity(int,int),public.assessment_state(uuid) to authenticated;
grant execute on function public.learning_catalog(uuid,int,int) to anon,authenticated;
revoke all on function private.retain_management_audit(),private.management_log(text,text,uuid,text,jsonb,jsonb),private.touch_management_record(),private.protect_trashed_content(),private.protect_invalidated_attempt(),private.reject_invalidated_grade(),private.management_snapshot(text,uuid) from public,anon,authenticated;

create function public.manage_attempts(p_search text default '',p_faculty text default '',p_type text default '',p_assessment uuid default null,p_student uuid default null,p_status text default '',p_from timestamptz default null,p_to timestamptz default null,p_offset int default 0,p_limit int default 25,p_submitted_only boolean default true,p_management_state text default 'active',p_course uuid default null) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_management_state not in ('active','archived','trash','all') then raise exception 'Invalid management filter';end if;
 if p_offset is null or p_limit is null or p_offset<0 or p_limit not between 1 and 100 or length(p_search)>200 then raise exception 'Invalid page';end if;
 with filtered as (
 select r.*,private.management_snapshot('attempt',r.id) as management from private.admin_attempt_rows r
 where (not p_submitted_only or r.status not in ('in_progress','restarted','invalidated')) and (p_student is null or r.student_id=p_student) and (p_assessment is null or r.assignment_id=p_assessment)
 and (p_type='' or r.assignments->>'type'=p_type) and (p_faculty='' or r.profiles->>'faculty'=p_faculty)
 and (p_status='' or r.status=p_status or (p_status='pending_review' and r.status in ('submitted','pending_review','expired')))
 and (p_from is null or coalesce(r.submitted_at,r.created_at)>=p_from) and (p_to is null or coalesce(r.submitted_at,r.created_at)<p_to)
 and (p_course is null or exists(select 1 from public.assessment_courses c where c.assessment_id=r.assignment_id and c.course_id=p_course))
 and (p_management_state='all' or (p_management_state='active' and not exists(select 1 from private.record_management m where m.kind='attempt' and m.record_id=r.id and (m.archived_at is not null or m.deleted_at is not null))) or (p_management_state='archived' and exists(select 1 from private.record_management m where m.kind='attempt' and m.record_id=r.id and m.archived_at is not null and m.deleted_at is null)) or (p_management_state='trash' and exists(select 1 from private.record_management m where m.kind='attempt' and m.record_id=r.id and m.deleted_at is not null)))
 and (p_search='' or concat_ws(' ',r.profiles->>'full_name',r.profiles->>'email',r.profiles->>'student_id') ilike '%'||p_search||'%')
 ),page as (select * from filtered order by created_at desc,id desc offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;
revoke all on function public.manage_attempts(text,text,text,uuid,uuid,text,timestamptz,timestamptz,int,int,boolean,text,uuid) from public,anon;
grant execute on function public.manage_attempts(text,text,text,uuid,uuid,text,timestamptz,timestamptz,int,int,boolean,text,uuid) to authenticated;

create function public.content_in_trash(p_kind text,p_id uuid) returns boolean language sql stable security definer set search_path='' as $$select public.is_instructor() and exists(select 1 from private.record_management where kind=p_kind and record_id=p_id and deleted_at is not null)$$;
revoke all on function public.content_in_trash(text,uuid) from public,anon;
grant execute on function public.content_in_trash(text,uuid) to authenticated;
alter policy assignments_read on public.assignments using ((visible or (select public.is_instructor())) and not public.content_in_trash('assessment',id));
alter policy question_bank_instructor on public.question_bank using ((select public.is_instructor()) and not public.content_in_trash('question',id));

create or replace function public.instructor_help_requests(p_status text default 'pending',p_offset int default 0,p_limit int default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 if p_status is null or p_status not in ('','pending','approved','rejected') or p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid request filters';end if;
 with filtered as (
 select r.*,p.full_name,u.email,v.document->>'title' as title,a.assignment_id,a.status as attempt_status,a.attempt_number
 from public.attempt_help_requests r join public.attempts a on a.id=r.attempt_id join public.profiles p on p.id=r.student_id join auth.users u on u.id=r.student_id join public.assessment_versions v on v.assessment_id=a.assignment_id and v.version=a.assignment_version
 where (p_status='' or r.status=p_status) and not exists(select 1 from private.record_management m where m.kind='request' and m.record_id=r.id and (m.archived_at is not null or m.deleted_at is not null))
 ),page as(select * from filtered order by created_at,id offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page)||jsonb_build_object('recovery_code',public.attempt_recovery_state(page.attempt_id)->>'code') order by created_at,id) from page),'[]')) into result;return result;
end $$;

create or replace function public.instructor_overview() returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 return jsonb_build_object(
 'students',(select count(*) from auth.users u where not exists(select 1 from private.instructors i where i.user_id=u.id) or exists(select 1 from public.profiles p where p.id=u.id)),
 'started_students',(select count(distinct student_id) from public.attempts),
 'submitted_assignments',(select count(*) from private.admin_attempt_rows where status not in ('in_progress','restarted','invalidated') and assignments->>'type'='assignment'),
 'submitted_exams',(select count(*) from private.admin_attempt_rows where status not in ('in_progress','restarted','invalidated') and assignments->>'type'='exam'),
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
 (select count(*) from public.attempts a where a.student_id=u.id and a.status not in ('in_progress','restarted','invalidated')) as submissions
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
 where (not p_submitted_only or r.status not in ('in_progress','restarted','invalidated')) and (p_student is null or r.student_id=p_student) and (p_assessment is null or r.assignment_id=p_assessment)
 and (p_type='' or r.assignments->>'type'=p_type) and (p_faculty='' or r.profiles->>'faculty'=p_faculty)
 and (p_status='' or r.status=p_status or (p_status='pending_review' and r.status in ('submitted','pending_review','expired')))
 and (p_from is null or coalesce(r.submitted_at,r.created_at)>=p_from) and (p_to is null or coalesce(r.submitted_at,r.created_at)<p_to)
 and (p_search='' or concat_ws(' ',r.profiles->>'full_name',r.profiles->>'email',r.profiles->>'student_id') ilike '%'||p_search||'%')
 ),page as (select * from filtered order by created_at desc,id desc offset p_offset limit p_limit)
 select jsonb_build_object('total',(select count(*) from filtered),'rows',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]')) into result;return result;
end $$;

-- Initialize the existing six public Git lessons as editable, versioned content.
-- Only new catalog records are inserted; no assessment or student record is changed.
insert into public.learning_items(id,kind,parent_id,title,published_version) values('70000000-0000-4000-8000-000000000001','course',null,'Git fundamentals',1);
insert into private.learning_drafts values('70000000-0000-4000-8000-000000000001','{"title": "Git fundamentals", "body": "Learn files, commits, branches and merging in small steps.", "links": []}'::jsonb);
insert into public.learning_versions(item_id,version,document) values('70000000-0000-4000-8000-000000000001',1,'{"title": "Git fundamentals", "body": "Learn files, commits, branches and merging in small steps.", "links": []}'::jsonb);
insert into public.learning_items(id,kind,parent_id,title,published_version) values('70000000-0000-4000-8000-000000000002','section','70000000-0000-4000-8000-000000000001','Start with Git',1);
insert into private.learning_drafts values('70000000-0000-4000-8000-000000000002','{"title": "Start with Git", "body": "Read a short lesson, then try it in the practice lab. Complete Set up your project before trying the file commands.", "links": []}'::jsonb);
insert into public.learning_versions(item_id,version,document) values('70000000-0000-4000-8000-000000000002',1,'{"title": "Start with Git", "body": "Read a short lesson, then try it in the practice lab. Complete Set up your project before trying the file commands.", "links": []}'::jsonb);
insert into public.learning_items(id,kind,parent_id,title,published_version) values('70000000-0000-4000-8000-000000000011','lesson','70000000-0000-4000-8000-000000000002','Files and the editor',1);
insert into private.learning_drafts values('70000000-0000-4000-8000-000000000011','{"title": "Files and the editor", "body": "Creating a file does not save it in Git. Create a text file, select its name above the editor and type your text.\n\nTry in the practice lab:\ntouch notes.txt", "links": []}'::jsonb);
insert into public.learning_versions(item_id,version,document) values('70000000-0000-4000-8000-000000000011',1,'{"title": "Files and the editor", "body": "Creating a file does not save it in Git. Create a text file, select its name above the editor and type your text.\n\nTry in the practice lab:\ntouch notes.txt", "links": []}'::jsonb);
insert into public.learning_items(id,kind,parent_id,title,published_version) values('70000000-0000-4000-8000-000000000012','lesson','70000000-0000-4000-8000-000000000002','See what changed',1);
insert into private.learning_drafts values('70000000-0000-4000-8000-000000000012','{"title": "See what changed", "body": "Status shows new files, edits and files staged for the next commit. Check it before every commit.\n\nTry in the practice lab:\ngit status", "links": []}'::jsonb);
insert into public.learning_versions(item_id,version,document) values('70000000-0000-4000-8000-000000000012',1,'{"title": "See what changed", "body": "Status shows new files, edits and files staged for the next commit. Check it before every commit.\n\nTry in the practice lab:\ngit status", "links": []}'::jsonb);
insert into public.learning_items(id,kind,parent_id,title,published_version) values('70000000-0000-4000-8000-000000000013','lesson','70000000-0000-4000-8000-000000000002','Choose what to save',1);
insert into private.learning_drafts values('70000000-0000-4000-8000-000000000013','{"title": "Choose what to save", "body": "Staging chooses changes for the next commit. Add one file at a time when focused commits are required.\n\nTry in the practice lab:\ngit add about.txt", "links": []}'::jsonb);
insert into public.learning_versions(item_id,version,document) values('70000000-0000-4000-8000-000000000013',1,'{"title": "Choose what to save", "body": "Staging chooses changes for the next commit. Add one file at a time when focused commits are required.\n\nTry in the practice lab:\ngit add about.txt", "links": []}'::jsonb);
insert into public.learning_items(id,kind,parent_id,title,published_version) values('70000000-0000-4000-8000-000000000014','lesson','70000000-0000-4000-8000-000000000002','Make a commit',1);
insert into private.learning_drafts values('70000000-0000-4000-8000-000000000014','{"title": "Make a commit", "body": "A commit saves the staged version in Git history. Use the exact message when specified. Later commits do not change the first version.\n\nTry in the practice lab:\ngit commit -m \"Add personal information\"", "links": []}'::jsonb);
insert into public.learning_versions(item_id,version,document) values('70000000-0000-4000-8000-000000000014',1,'{"title": "Make a commit", "body": "A commit saves the staged version in Git history. Use the exact message when specified. Later commits do not change the first version.\n\nTry in the practice lab:\ngit commit -m \"Add personal information\"", "links": []}'::jsonb);
insert into public.learning_items(id,kind,parent_id,title,published_version) values('70000000-0000-4000-8000-000000000015','lesson','70000000-0000-4000-8000-000000000002','Try changes on a branch',1);
insert into private.learning_drafts values('70000000-0000-4000-8000-000000000015','{"title": "Try changes on a branch", "body": "Creating a branch names a line of work; switching chooses what you edit. This command does both.\n\nTry in the practice lab:\ngit switch -c feature/skills", "links": []}'::jsonb);
insert into public.learning_versions(item_id,version,document) values('70000000-0000-4000-8000-000000000015',1,'{"title": "Try changes on a branch", "body": "Creating a branch names a line of work; switching chooses what you edit. This command does both.\n\nTry in the practice lab:\ngit switch -c feature/skills", "links": []}'::jsonb);
insert into public.learning_items(id,kind,parent_id,title,published_version) values('70000000-0000-4000-8000-000000000016','lesson','70000000-0000-4000-8000-000000000002','Bring changes together',1);
insert into private.learning_drafts values('70000000-0000-4000-8000-000000000016','{"title": "Bring changes together", "body": "Switch to the branch that receives the changes before merging. Check the result and status afterward.\n\nTry in the practice lab:\ngit switch main\ngit merge feature/skills", "links": []}'::jsonb);
insert into public.learning_versions(item_id,version,document) values('70000000-0000-4000-8000-000000000016',1,'{"title": "Bring changes together", "body": "Switch to the branch that receives the changes before merging. Check the result and status afterward.\n\nTry in the practice lab:\ngit switch main\ngit merge feature/skills", "links": []}'::jsonb);
