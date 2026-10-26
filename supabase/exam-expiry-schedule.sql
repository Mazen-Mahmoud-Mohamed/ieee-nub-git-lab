-- Apply only to the verified dedicated project after the migrations.
-- Uses Supabase Cron (pg_cron); no HTTP secret or external backend is needed.
create extension if not exists pg_cron;
select cron.schedule('ieee-git-exam-expiry','* * * * *','select public.expire_due_attempts();');
-- Check cron.job and cron.job_run_details after installation.
-- Scheduling delay does not permit late writes: checkpoint RPCs enforce deadline_at independently.
