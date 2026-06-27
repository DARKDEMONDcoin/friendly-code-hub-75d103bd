
-- Fix watchdog claim functions:
--  1) background_jobs.last_heartbeat_at is NOT NULL → set to now() on reclaim
--     (previously set to null → watchdog crashed every minute since 2026-06-23).
--  2) background_jobs terminal status is 'error', not 'failed'.
--  3) research_jobs: keep 'failed' terminal status, but also set heartbeat to now()
--     so timing is recorded and the same code path stays uniform.

CREATE OR REPLACE FUNCTION public.claim_stale_background_jobs(stale_seconds integer DEFAULT 90)
RETURNS SETOF public.background_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  return query
  update public.background_jobs j
     set status = case
                    when j.attempt + 1 >= j.max_attempts then 'error'
                    else 'queued'
                  end,
         attempt = j.attempt + 1,
         next_run_at = now(),
         last_heartbeat_at = now(),
         error = case
                   when j.attempt + 1 >= j.max_attempts
                     then coalesce(j.error, 'Job exceeded max attempts after timeout')
                   else j.error
                 end,
         finished_at = case
                         when j.attempt + 1 >= j.max_attempts then now()
                         else j.finished_at
                       end,
         updated_at = now()
   where j.status = 'running'
     and j.resumable = true
     and (j.last_heartbeat_at is null
          or j.last_heartbeat_at < now() - make_interval(secs => stale_seconds))
  returning j.*;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_stale_research_jobs(stale_seconds integer DEFAULT 120)
RETURNS SETOF public.research_jobs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  return query
  update public.research_jobs j
     set status = case
                    when j.attempt + 1 >= j.max_attempts then 'failed'
                    else 'queued'
                  end,
         attempt = j.attempt + 1,
         next_run_at = now(),
         last_heartbeat_at = now(),
         error = case
                   when j.attempt + 1 >= j.max_attempts
                     then coalesce(j.error, 'Research exceeded max attempts after timeout')
                   else j.error
                 end,
         updated_at = now()
   where j.status in ('planning','searching','synthesizing')
     and j.resumable = true
     and (j.last_heartbeat_at is null
          or j.last_heartbeat_at < now() - make_interval(secs => stale_seconds))
  returning j.*;
end;
$function$;
