
-- Enable required extensions
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- background_jobs: add durable execution columns
alter table public.background_jobs
  add column if not exists attempt int not null default 0,
  add column if not exists max_attempts int not null default 3,
  add column if not exists next_run_at timestamptz default now(),
  add column if not exists checkpoint jsonb not null default '{}'::jsonb,
  add column if not exists provider_errors jsonb not null default '[]'::jsonb,
  add column if not exists resumable boolean not null default true,
  add column if not exists runner text;

create index if not exists idx_background_jobs_watchdog
  on public.background_jobs (status, last_heartbeat_at)
  where status in ('running','queued');

create index if not exists idx_background_jobs_user_active
  on public.background_jobs (user_id, status, updated_at desc)
  where status in ('queued','running');

-- research_jobs: same durable execution columns for consistency
alter table public.research_jobs
  add column if not exists attempt int not null default 0,
  add column if not exists max_attempts int not null default 3,
  add column if not exists next_run_at timestamptz default now(),
  add column if not exists checkpoint jsonb not null default '{}'::jsonb,
  add column if not exists provider_errors jsonb not null default '[]'::jsonb,
  add column if not exists resumable boolean not null default true,
  add column if not exists last_heartbeat_at timestamptz;

create index if not exists idx_research_jobs_watchdog
  on public.research_jobs (status, last_heartbeat_at)
  where status in ('planning','searching','synthesizing','queued');

-- Helper: atomically claim stale jobs and bump their attempt counter.
-- Returns rows that should be re-dispatched by the watchdog.
create or replace function public.claim_stale_background_jobs(stale_seconds int default 90)
returns setof public.background_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.background_jobs j
     set status = case
                    when j.attempt + 1 >= j.max_attempts then 'failed'
                    else 'queued'
                  end,
         attempt = j.attempt + 1,
         next_run_at = now(),
         last_heartbeat_at = null,
         error = case
                   when j.attempt + 1 >= j.max_attempts
                     then coalesce(j.error, 'Job exceeded max attempts after timeout')
                   else j.error
                 end,
         updated_at = now()
   where j.status = 'running'
     and j.resumable = true
     and (j.last_heartbeat_at is null
          or j.last_heartbeat_at < now() - make_interval(secs => stale_seconds))
  returning j.*;
end;
$$;

grant execute on function public.claim_stale_background_jobs(int) to service_role;

-- Helper for research_jobs
create or replace function public.claim_stale_research_jobs(stale_seconds int default 120)
returns setof public.research_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  update public.research_jobs j
     set status = case
                    when j.attempt + 1 >= j.max_attempts then 'failed'
                    else 'queued'
                  end,
         attempt = j.attempt + 1,
         next_run_at = now(),
         last_heartbeat_at = null,
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
$$;

grant execute on function public.claim_stale_research_jobs(int) to service_role;
