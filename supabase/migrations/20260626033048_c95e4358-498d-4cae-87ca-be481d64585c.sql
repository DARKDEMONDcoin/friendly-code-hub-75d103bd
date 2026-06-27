
-- Phase 4: Auto-DLQ wiring — when watchdog declares a job dead, mirror it to dead_letter_jobs
-- and emit a clean security/audit event. This way max-attempts failures never just vanish.

CREATE OR REPLACE FUNCTION public.claim_stale_background_jobs(stale_seconds integer DEFAULT 90)
 RETURNS SETOF background_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.background_jobs;
begin
  for r in
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
     where j.resumable = true
       and j.status in ('running','queued')
       and (j.last_heartbeat_at is null
            or j.last_heartbeat_at < now() - make_interval(secs => stale_seconds))
    returning j.*
  loop
    if r.status = 'error' then
      begin
        perform public.move_to_dead_letter(r.id, 'background_jobs', r.error);
      exception when others then
        null; -- never let DLQ failure block the watchdog
      end;
    end if;
    return next r;
  end loop;
  return;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_stale_research_jobs(stale_seconds integer DEFAULT 120)
 RETURNS SETOF research_jobs
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  r public.research_jobs;
begin
  for r in
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
    returning j.*
  loop
    if r.status = 'failed' then
      begin
        perform public.move_to_dead_letter(r.id, 'research_jobs', r.error);
      exception when others then
        null;
      end;
    end if;
    return next r;
  end loop;
  return;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.claim_stale_background_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_stale_research_jobs(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stale_background_jobs(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_stale_research_jobs(integer) TO service_role;
