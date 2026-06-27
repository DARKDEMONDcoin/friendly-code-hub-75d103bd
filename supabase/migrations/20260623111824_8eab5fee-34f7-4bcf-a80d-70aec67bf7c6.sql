-- Phase 2a: Drop 14 unused tables (0 rows + 0 code references)
DROP TABLE IF EXISTS public.agent_artifacts CASCADE;
DROP TABLE IF EXISTS public.agent_squads CASCADE;
DROP TABLE IF EXISTS public.corn_agents CASCADE;
DROP TABLE IF EXISTS public.corn_events CASCADE;
DROP TABLE IF EXISTS public.corn_runs CASCADE;
DROP TABLE IF EXISTS public.code_agent_events CASCADE;
DROP TABLE IF EXISTS public.code_project_deployments CASCADE;
DROP TABLE IF EXISTS public.code_publishes CASCADE;
DROP TABLE IF EXISTS public.code_v0_tasks CASCADE;
DROP TABLE IF EXISTS public.deapi_keys CASCADE;
DROP TABLE IF EXISTS public.workspace_api_keys CASCADE;
DROP TABLE IF EXISTS public.referral_milestones CASCADE;
DROP TABLE IF EXISTS public.referral_shortlinks CASCADE;
DROP TABLE IF EXISTS public.user_installed_agents CASCADE;