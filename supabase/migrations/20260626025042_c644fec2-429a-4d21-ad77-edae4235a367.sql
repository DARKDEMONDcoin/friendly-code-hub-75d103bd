
CREATE OR REPLACE FUNCTION public.watchdog_resume_background()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  rec record;
  n int := 0;
  base_url text := 'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z2FtcGR0YXd1ZWZ3d2F5bmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Njk5ODAsImV4cCI6MjA4ODM0NTk4MH0.5ZOzuxCrm-TO4zzRDJ68LrCLH3f0itiznUxhbEupvGg';
  endpoint text;
  effective_runner text;
begin
  for rec in select * from public.claim_stale_background_jobs(90) loop
    n := n + 1;
    if rec.status <> 'queued' then continue; end if;

    -- Prefer the tagged runner; otherwise derive from job kind so legacy
    -- rows (created before the runner-tagging change) can still resume.
    effective_runner := rec.runner;
    if effective_runner is null then
      effective_runner := case rec.kind
        when 'slides' then 'chat-slides-stream'
        when 'docs'   then 'docs-generate'
        when 'video'  then 'media-video'
        else null
      end;
    end if;

    if effective_runner is null then
      -- Unknown runner → cannot resume, mark error instead of looping forever.
      update public.background_jobs
         set status = 'error',
             error = coalesce(error, 'No runner registered for this job kind'),
             finished_at = now(),
             updated_at = now()
       where id = rec.id;
      continue;
    end if;

    endpoint := base_url || effective_runner;
    perform net.http_post(
      url := endpoint,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || anon_key,
        'apikey', anon_key
      ),
      body := jsonb_build_object(
        'action', 'resume',
        'jobId', rec.id,
        'job_id', rec.id,
        'attempt', rec.attempt,
        'input', rec.input
      )
    );
  end loop;
  return n;
end;
$function$;
