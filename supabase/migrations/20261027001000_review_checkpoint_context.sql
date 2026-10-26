create or replace function public.instructor_review_context(p_attempt uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare a public.attempts;result jsonb;begin
 if auth.uid() is null or not public.is_instructor() then raise exception 'Instructor authorization required';end if;
 select * into a from public.attempts where id=p_attempt;if a.id is null then raise exception 'Attempt not found';end if;
 select jsonb_build_object('keys',coalesce(k.keys,'{}'),'draft',(select to_jsonb(d) from private.grading_drafts d where d.attempt_id=a.id),'checkpoint_outcomes',(select outcomes from private.verified_checkpoints c where c.attempt_id=a.id),'checkpoint_accepted_at',(select accepted_at from private.verified_checkpoints c where c.attempt_id=a.id)) into result from private.assessment_keys k where k.assessment_id=a.assignment_id and k.version=a.assignment_version;
 return coalesce(result,jsonb_build_object('keys','{}'::jsonb));
end $$;
