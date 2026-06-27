
-- 1) Store internal-call secret in Vault so watchdog SQL can authenticate
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'INTERNAL_FUNCTION_SECRET';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(
      'TjLKiMJOyN6stszXbyyi6j11DKD1HiNbBVlgiCQYb-OPc-Y6GQ3gh-PhFAriwwIz',
      'INTERNAL_FUNCTION_SECRET',
      'Shared secret used by pg_cron watchdog to invoke edge functions as a trusted internal caller'
    );
  END IF;
END $$;

-- 2) claim_stale_background_jobs: also re-pick stuck "queued" resumable jobs.
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
   where j.resumable = true
     and j.status in ('running','queued')
     and (j.last_heartbeat_at is null
          or j.last_heartbeat_at < now() - make_interval(secs => stale_seconds))
  returning j.*;
end;
$function$;

-- 3) watchdog_resume_background: send x-internal-secret + correct kind handling.
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
  internal_secret text;
  endpoint text;
  effective_runner text;
begin
  select decrypted_secret into internal_secret
    from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;

  for rec in select * from public.claim_stale_background_jobs(90) loop
    n := n + 1;
    if rec.status <> 'queued' then continue; end if;

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
      update public.background_jobs
         set status = 'error',
             error = coalesce(error, 'No runner registered for this job kind ('||rec.kind||')'),
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
        'apikey', anon_key,
        'x-internal-secret', coalesce(internal_secret,'')
      ),
      body := jsonb_build_object(
        'action', 'resume',
        'jobId', rec.id,
        'job_id', rec.id,
        'attempt', rec.attempt,
        'user_id', rec.user_id,
        'input', rec.input
      )
    );
  end loop;
  return n;
end;
$function$;

-- 4) Same upgrade for research watchdog (pass internal secret).
CREATE OR REPLACE FUNCTION public.watchdog_resume_research()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  rec record;
  n int := 0;
  base_url text := 'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/deep-research-job';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z2FtcGR0YXd1ZWZ3d2F5bmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Njk5ODAsImV4cCI6MjA4ODM0NTk4MH0.5ZOzuxCrm-TO4zzRDJ68LrCLH3f0itiznUxhbEupvGg';
  internal_secret text;
begin
  select decrypted_secret into internal_secret
    from vault.decrypted_secrets where name = 'INTERNAL_FUNCTION_SECRET' limit 1;
  for rec in select * from public.claim_stale_research_jobs(120) loop
    n := n + 1;
    perform net.http_post(
      url := base_url,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer '||anon_key,
        'apikey', anon_key,
        'x-internal-secret', coalesce(internal_secret,'')
      ),
      body := jsonb_build_object('action','tick','job_id', rec.id)
    );
  end loop;
  return n;
end;
$function$;

-- 5) Burn down the ancient stuck jobs so the queue is clean.
UPDATE public.background_jobs
   SET status = 'error',
       error = coalesce(error,'Job auto-cancelled: stuck for too long after server restart'),
       finished_at = now(),
       updated_at = now()
 WHERE status IN ('running','queued')
   AND updated_at < now() - interval '24 hours';
