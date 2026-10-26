-- Additive student contact/profile completion. No identity, attempt or grade is deleted/reset.
alter table public.profiles add column if not exists phone text;
alter table public.profiles alter column student_id drop not null;
alter table public.profiles alter column academic_year drop not null;
-- These legacy fields remain intact; new students need only name, Auth email, phone and faculty.
create function public.normalize_egyptian_mobile(p_phone text) returns text language plpgsql immutable set search_path='' as $$declare value text;begin
 if p_phone is null or trim(p_phone) !~ '^[+0-9 ()-]+$' then raise exception 'Enter a valid Egyptian mobile number.';end if;
 value:=regexp_replace(p_phone,'[ ()-]','','g');if value like '0020%' then value:='+'||substr(value,3);end if;if value ~ '^01[0125][0-9]{8}$' then value:='+2'||value;end if;
 if value !~ '^\+201[0125][0-9]{8}$' then raise exception 'Enter a valid Egyptian mobile number.';end if;return value;end $$;
revoke all on function public.normalize_egyptian_mobile(text) from public,anon;grant execute on function public.normalize_egyptian_mobile(text) to authenticated;
-- Normalize only valid legacy phones. Unknown legacy data stays available for correction.
do $$declare p record;begin for p in select id,phone from public.profiles where phone is not null loop begin update public.profiles set phone=public.normalize_egyptian_mobile(p.phone) where id=p.id;exception when raise_exception then null;end;end loop;end $$;
alter table public.profiles add constraint profiles_phone_format check(phone is null or phone ~ '^\+201[0125][0-9]{8}$') not valid;
do $$begin if not exists(select 1 from public.profiles where phone is not null and phone !~ '^\+201[0125][0-9]{8}$') then alter table public.profiles validate constraint profiles_phone_format;end if;end $$;
create function private.normalize_profile_phone() returns trigger language plpgsql set search_path='' as $$begin new.phone:=public.normalize_egyptian_mobile(new.phone);return new;end $$;
revoke all on function private.normalize_profile_phone() from public,anon,authenticated;
create trigger profile_phone_required before insert or update of phone on public.profiles for each row execute function private.normalize_profile_phone();
create function private.student_profile_complete(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$select exists(select 1 from public.profiles p join auth.users u on u.id=p.id where p.id=p_user and length(trim(p.full_name)) between 2 and 120 and p.phone ~ '^\+201[0125][0-9]{8}$' and p.faculty in ('engineering','computer_science') and u.email is not null and length(trim(u.email))>0)$$;
revoke all on function private.student_profile_complete(uuid) from public,anon,authenticated;
create function public.save_student_profile(p_full_name text,p_phone text,p_faculty text) returns public.profiles language plpgsql security definer set search_path='' as $$declare actor uuid:=auth.uid();result public.profiles;begin
 if actor is null or not exists(select 1 from auth.users where id=actor and email is not null) then raise exception 'Sign in with an account that has an email address.';end if;
 if length(trim(p_full_name)) not between 2 and 120 or p_full_name is null or p_faculty is null or p_faculty not in ('engineering','computer_science') then raise exception 'Enter your full name and select a faculty.';end if;
 insert into public.profiles(id,full_name,phone,faculty,university,department,student_id,academic_year) values(actor,trim(p_full_name),public.normalize_egyptian_mobile(p_phone),p_faculty,'Nahda University',case when p_faculty='engineering' then 'Engineering' else 'Computer Science' end,null,null)
 on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone,faculty=excluded.faculty returning * into result;return result;
end $$;
revoke all on function public.save_student_profile(text,text,text) from public,anon;grant execute on function public.save_student_profile(text,text,text) to authenticated;

-- Reuse the existing timing/attempt policy, adding profile validation ahead of timer creation.
alter function public.start_assessment(uuid) set schema private;
revoke all on function private.start_assessment(uuid) from public,anon,authenticated,service_role;
create function public.start_assessment(p_assessment uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if auth.uid() is null or not private.student_profile_complete(auth.uid()) then raise exception 'Complete your name, phone number and faculty before starting.';end if;return private.start_assessment(p_assessment);end $$;
revoke all on function public.start_assessment(uuid) from public,anon;grant execute on function public.start_assessment(uuid) to authenticated;

-- Preserve verified autosave and deadline behavior. Only final manual submission needs a newly
-- completed profile; legacy active exams may still autosave and expire without resetting time.
alter function public.accept_assessment_checkpoint(uuid,uuid,int,jsonb,jsonb,jsonb,numeric,numeric,boolean,uuid) set schema private;
revoke all on function private.accept_assessment_checkpoint(uuid,uuid,int,jsonb,jsonb,jsonb,numeric,numeric,boolean,uuid) from public,anon,authenticated,service_role;
create function public.accept_assessment_checkpoint(p_student uuid,p_attempt uuid,p_revision int,p_payload jsonb,p_outcomes jsonb,p_grades jsonb,p_practical numeric,p_objective numeric,p_finalize boolean,p_key uuid) returns jsonb language plpgsql security definer set search_path='' as $$begin
 if p_finalize and not private.student_profile_complete(p_student) then raise exception 'Complete your student profile before submitting.';end if;
 return private.accept_assessment_checkpoint(p_student,p_attempt,p_revision,p_payload,p_outcomes,p_grades,p_practical,p_objective,p_finalize,p_key);end $$;
revoke all on function public.accept_assessment_checkpoint(uuid,uuid,int,jsonb,jsonb,jsonb,numeric,numeric,boolean,uuid) from public,anon,authenticated;grant execute on function public.accept_assessment_checkpoint(uuid,uuid,int,jsonb,jsonb,jsonb,numeric,numeric,boolean,uuid) to service_role;

alter function public.finalize_verified(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,numeric) set schema private;
revoke all on function private.finalize_verified(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,numeric) from public,anon,authenticated,service_role;
create function public.finalize_verified(p_student uuid,p_attempt uuid,p_key uuid,p_snapshot jsonb,p_answers jsonb,p_events jsonb,p_results jsonb,p_score numeric) returns uuid language plpgsql security definer set search_path='' as $$begin
 if not private.student_profile_complete(p_student) then raise exception 'Complete your student profile before submitting.';end if;return private.finalize_verified(p_student,p_attempt,p_key,p_snapshot,p_answers,p_events,p_results,p_score);end $$;
revoke all on function public.finalize_verified(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,numeric) from public,anon,authenticated;grant execute on function public.finalize_verified(uuid,uuid,uuid,jsonb,jsonb,jsonb,jsonb,numeric) to service_role;

alter table public.attempts add column identity_snapshot jsonb;
create function private.capture_submission_identity() returns trigger language plpgsql security definer set search_path='' as $$begin
 if old.status='in_progress' and new.status<>'in_progress' and old.identity_snapshot is null then
  select jsonb_build_object('full_name',p.full_name,'email',u.email,'phone',p.phone,'faculty',p.faculty,'student_id',p.student_id) into new.identity_snapshot from public.profiles p join auth.users u on u.id=p.id where p.id=new.student_id;
 else new.identity_snapshot:=old.identity_snapshot;end if;return new;end $$;
revoke all on function private.capture_submission_identity() from public,anon,authenticated;
create trigger attempt_identity_at_submission before update of status on public.attempts for each row execute function private.capture_submission_identity();

create function public.instructor_submissions() returns setof jsonb language plpgsql stable security definer set search_path='' as $$begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 return query select to_jsonb(a)||jsonb_build_object('profiles',jsonb_build_object('full_name',coalesce(a.identity_snapshot->>'full_name',p.full_name),'student_id',coalesce(a.identity_snapshot->>'student_id',p.student_id),'email',case when a.identity_snapshot is not null then a.identity_snapshot->>'email' else u.email end,'phone',case when a.identity_snapshot is not null then a.identity_snapshot->>'phone' else p.phone end,'faculty',case when a.identity_snapshot is not null then a.identity_snapshot->>'faculty' else p.faculty end,'department',p.department,'academic_year',p.academic_year),'assignments',jsonb_build_object('title',v.document->>'title','type',s.type),'grading_summaries',to_jsonb(g)) from public.attempts a join public.profiles p on p.id=a.student_id join auth.users u on u.id=p.id join public.assignments s on s.id=a.assignment_id left join public.assessment_versions v on v.assessment_id=a.assignment_id and v.version=a.assignment_version left join public.grading_summaries g on g.attempt_id=a.id order by a.created_at desc;
end $$;
revoke all on function public.instructor_submissions() from public,anon;grant execute on function public.instructor_submissions() to authenticated;
