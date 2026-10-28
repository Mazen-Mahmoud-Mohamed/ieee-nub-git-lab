-- Extends the existing versioned lesson model; no student or assessment records are rewritten.
create table public.learning_materials (
 id uuid primary key, item_id uuid not null references public.learning_items(id),
 path text not null unique, name text not null check(length(name) between 1 and 180),
 bytes int not null check(bytes between 22 and 26214400),
 uploaded_by uuid references auth.users on delete set null, created_at timestamptz not null default now()
);
alter table public.learning_materials enable row level security;
revoke all on public.learning_materials from public,anon,authenticated;
grant select on public.learning_materials to authenticated;
create policy learning_material_staff on public.learning_materials for select to authenticated using((select public.is_instructor()));

create function public.register_learning_material(p_actor uuid,p_id uuid,p_item uuid,p_name text,p_bytes int) returns uuid
language plpgsql security definer set search_path='' as $$begin
 if auth.role() is distinct from 'service_role' or not exists(select 1 from private.instructors where user_id=p_actor) then raise exception 'Instructor upload authorization required';end if;
 perform pg_advisory_xact_lock(hashtext('git-lab-management'));
 perform 1 from public.learning_items where id=p_item and kind='lesson' and archived_at is null and deleted_at is null for update;
 if not found then raise exception 'Save an active lesson before uploading';end if;
 if p_name !~* '\.pptx$' or p_name ~ '[/\\]' then raise exception 'Invalid presentation name';end if;
 insert into public.learning_materials(id,item_id,path,name,bytes,uploaded_by) values(p_id,p_item,p_item::text||'/'||p_id::text||'.pptx',p_name,p_bytes,p_actor);
 insert into public.admin_activity(actor_id,action,record_type,record_id,reason,metadata)
 values(p_actor,'presentation_uploaded','lesson',p_item,'',jsonb_build_object('material_id',p_id,'bytes',p_bytes));
 return p_id;
end $$;
revoke all on function public.register_learning_material(uuid,uuid,uuid,text,int) from public,anon,authenticated;
grant execute on function public.register_learning_material(uuid,uuid,uuid,text,int) to service_role;

create function private.session_document(p_document jsonb,p_kind text,p_item uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare doc jsonb;video text:=coalesce(p_document->>'video_url','');material uuid;related uuid;begin
 if coalesce(p_document->>'display_order','0') !~ '^[0-9]{1,6}$' or coalesce(p_document->>'session_number','0') !~ '^[0-9]{1,6}$' then raise exception 'Session number and order must be whole numbers between 0 and 999999';end if;
 if jsonb_typeof(coalesce(p_document->'topics','[]')) is distinct from 'array' or jsonb_array_length(coalesce(p_document->'topics','[]'))>30 or exists(select 1 from jsonb_array_elements(coalesce(p_document->'topics','[]')) t where jsonb_typeof(t) is distinct from 'string' or length(t#>>'{}')>180) then raise exception 'Use up to 30 short topics';end if;
 if video<>'' and video !~ '^https://drive\.google\.com/file/d/[A-Za-z0-9_-]{10,200}/view(\?resourcekey=[A-Za-z0-9_-]{1,200})?$' then raise exception 'Use a supported Google Drive video link';end if;
 material:=nullif(p_document->>'presentation_id','')::uuid;related:=nullif(p_document->>'related_assessment_id','')::uuid;
 if p_kind<>'lesson' and (video<>'' or material is not null or related is not null) then raise exception 'Video, presentations and practice belong to a lesson session';end if;
 if material is not null and not exists(select 1 from public.learning_materials where id=material and item_id=p_item) then raise exception 'Choose an uploaded presentation belonging to this lesson';end if;
 if related is not null and not exists(select 1 from public.assignments where id=related and not archived and not public.content_in_trash('assessment',id)) then raise exception 'Choose an active related assessment';end if;
 doc:=jsonb_build_object('title',trim(p_document->>'title'),'body',coalesce(p_document->>'body',''),'links',p_document->'links',
 'session_number',coalesce((p_document->>'session_number')::int,0),'display_order',coalesce((p_document->>'display_order')::int,0),
 'topics',coalesce(p_document->'topics','[]'),'video_url',video,'presentation_id',material,'related_assessment_id',related);
 return doc;
end $$;
revoke all on function private.session_document(jsonb,text,uuid) from public,anon,authenticated;
create or replace function public.manage_learning_save(p_id uuid,p_kind text,p_parent uuid,p_document jsonb,p_revision int,p_publish boolean default false) returns uuid language plpgsql security definer set search_path='' as $$
declare target uuid:=coalesce(p_id,gen_random_uuid());item public.learning_items;parent public.learning_items;doc jsonb;link jsonb;rev int;next_version int;
begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 perform pg_advisory_xact_lock(hashtext('git-lab-management'));
 if p_kind not in ('course','section','lesson') or jsonb_typeof(p_document) is distinct from 'object' or length(trim(coalesce(p_document->>'title',''))) not between 1 and 180 or length(coalesce(p_document->>'body',''))>20000 or jsonb_typeof(p_document->'links') is distinct from 'array' or jsonb_array_length(p_document->'links')>20 then raise exception 'Enter a title, readable text and up to 20 resource links';end if;
 for link in select value from jsonb_array_elements(p_document->'links') loop
  if jsonb_typeof(link) is distinct from 'object' or length(trim(coalesce(link->>'label',''))) not between 1 and 100 or length(coalesce(link->>'url',''))>2000 or coalesce(link->>'url','') !~ '^https://[^[:space:]/]+(/[^[:space:]]*)?$' then raise exception 'Resources need a label and an HTTPS URL';end if;
 end loop;
 doc:=private.session_document(p_document,p_kind,target);
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

create function public.learning_is_visible(p_item uuid) returns boolean language sql stable security definer set search_path='' as $$
 with recursive ancestors as (
 select id,parent_id,kind,published_version,archived_at,deleted_at from public.learning_items where id=p_item
 union all select i.id,i.parent_id,i.kind,i.published_version,i.archived_at,i.deleted_at from public.learning_items i join ancestors a on a.parent_id=i.id
 ) select exists(select 1 from ancestors where kind='course') and not exists(select 1 from ancestors where published_version=0 or archived_at is not null or deleted_at is not null)
$$;
revoke all on function public.learning_is_visible(uuid) from public;
grant execute on function public.learning_is_visible(uuid) to anon,authenticated;

-- Removes publication only; retains all immutable published versions.
create function public.manage_learning_unpublish(p_id uuid,p_revision int) returns void language plpgsql security definer set search_path='' as $$declare rev int;old_version int;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 perform pg_advisory_xact_lock(hashtext('git-lab-management'));
 select published_version into old_version from public.learning_items where id=p_id and archived_at is null and deleted_at is null for update;
 if not found then raise exception 'Choose active content';end if;
 select revision into rev from private.record_management where kind='learning' and record_id=p_id;
 if rev is distinct from p_revision then raise exception 'Record changed. Refresh before saving';end if;
 update public.learning_items set published_version=0 where id=p_id;
 perform private.management_log('unpublished','learning',p_id,'',jsonb_build_object('version',old_version),jsonb_build_object('version',0));
end $$;
revoke all on function public.manage_learning_unpublish(uuid,int) from public,anon;
grant execute on function public.manage_learning_unpublish(uuid,int) to authenticated;

create function public.learning_presentation(p_item uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare doc jsonb;result jsonb;begin
 if public.learning_is_visible(p_item) then select v.document into doc from public.learning_items i join public.learning_versions v on v.item_id=i.id and v.version=i.published_version where i.id=p_item;
 else raise exception 'Published material is unavailable';end if;
 select jsonb_build_object('id',id,'path',path,'name',name,'bytes',bytes) into result from public.learning_materials where id=nullif(doc->>'presentation_id','')::uuid and item_id=p_item;
 return result;
end $$;
revoke all on function public.learning_presentation(uuid) from public;
grant execute on function public.learning_presentation(uuid) to anon,authenticated;

create function public.can_read_learning_material(p_path text) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_instructor() or exists(select 1 from public.learning_materials m join public.learning_items i on i.id=m.item_id join public.learning_versions v on v.item_id=i.id and v.version=i.published_version where m.path=p_path and v.document->>'presentation_id'=m.id::text and public.learning_is_visible(i.id))
$$;
revoke all on function public.can_read_learning_material(text) from public;
grant execute on function public.can_read_learning_material(text) to anon,authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('learning-presentations','learning-presentations',false,26214400,array['application/vnd.openxmlformats-officedocument.presentationml.presentation']);
-- Upload/update/delete are deliberately service-only through the validating endpoint.
create policy published_learning_presentations on storage.objects for select to anon,authenticated
 using(bucket_id='learning-presentations' and public.can_read_learning_material(name));
create or replace function public.learning_catalog(p_parent uuid default null,p_offset int default 0,p_limit int default 25) returns jsonb language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if p_offset is null or p_offset<0 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Invalid page';end if;
 with recursive visible as (
  select i.*,v.document from public.learning_items i join public.learning_versions v on v.item_id=i.id and v.version=i.published_version where i.kind='course' and i.archived_at is null and i.deleted_at is null
  union all select i.*,v.document from public.learning_items i join visible parent on parent.id=i.parent_id join public.learning_versions v on v.item_id=i.id and v.version=i.published_version where i.archived_at is null and i.deleted_at is null
 ),children as(select * from visible where parent_id is not distinct from p_parent),page as(select * from children order by coalesce((document->>'display_order')::int,0),created_at,id offset p_offset limit p_limit)
 select jsonb_build_object('managed',true,'parent',(select jsonb_build_object('id',id,'parent_id',parent_id,'kind',kind,'document',document) from visible where id=p_parent),'total',(select count(*) from children),'rows',coalesce((select jsonb_agg(jsonb_build_object('id',id,'kind',kind,'document',document,'version',published_version) order by coalesce((document->>'display_order')::int,0),created_at,id) from page),'[]')) into result;
 if p_parent is not null and result->'parent'='null'::jsonb then raise exception 'Course content is unavailable';end if;return result;
end $$;

create or replace function private.management_snapshot(p_kind text,p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
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

-- Read-only availability hint; start_assessment remains the authoritative policy check.
create function public.learning_related_activity(p_item uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare doc jsonb;related uuid;a public.assignments;definition jsonb;latest public.attempts;used int;credits int;begin
 if auth.uid() is null or not public.learning_is_visible(p_item) then return null;end if;
 select v.document into doc from public.learning_items i join public.learning_versions v on v.item_id=i.id and v.version=i.published_version where i.id=p_item;
 related:=nullif(doc->>'related_assessment_id','')::uuid;if related is null then return null;end if;
 select * into a from public.assignments where id=related;
 if a.id is null or not a.visible or a.archived or public.content_in_trash('assessment',related) then return null;end if;
 select document into definition from public.assessment_versions where assessment_id=related and version=a.published_version;
 if definition is null or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) or not exists(select 1 from public.profiles where id=auth.uid()) then return null;end if;
 select * into latest from public.attempts where student_id=auth.uid() and assignment_id=related order by attempt_number desc limit 1;
 if latest.status='in_progress' and (latest.deadline_at is null or latest.deadline_at>now()) then return jsonb_build_object('id',related,'title',a.title);end if;
 if nullif(definition->>'startsAt','')::timestamptz>now() or nullif(definition->>'endsAt','')::timestamptz<=now() or nullif(definition->>'deadline','')::timestamptz<=now() then return null;end if;
 select count(*) into used from public.attempts where student_id=auth.uid() and assignment_id=related;
 select retakes_remaining into credits from public.student_enrollments where assignment_id=related and student_id=auth.uid();
 if used>=coalesce((definition->>'attemptLimit')::int,1) and coalesce(credits,0)<=0 then return null;end if;
 return jsonb_build_object('id',related,'title',a.title);
end $$;
revoke all on function public.learning_related_activity(uuid) from public;
grant execute on function public.learning_related_activity(uuid) to anon,authenticated;
-- Restrictive guards prevent pre-existing broad Storage policies from exposing this bucket.
-- Other buckets retain their existing policies; service_role bypass remains server-only.
create policy learning_presentation_read_guard on storage.objects as restrictive for select to anon,authenticated
 using(bucket_id<>'learning-presentations' or public.can_read_learning_material(name));
create policy learning_presentation_insert_guard on storage.objects as restrictive for insert to anon,authenticated
 with check(bucket_id<>'learning-presentations');
create policy learning_presentation_update_guard on storage.objects as restrictive for update to anon,authenticated
 using(bucket_id<>'learning-presentations') with check(bucket_id<>'learning-presentations');
create policy learning_presentation_delete_guard on storage.objects as restrictive for delete to anon,authenticated
 using(bucket_id<>'learning-presentations');
