
-- ============================================================
-- Phase 1: Security hardening + audit log + DLQ scaffolding
-- لا يمس جداول المفاتيح ولا الواجهة الأمامية
-- ============================================================

-- 1) إغلاق watchdog RPCs أمام anon/public (تستدعى فقط من pg_cron عبر service_role)
REVOKE EXECUTE ON FUNCTION public.claim_stale_background_jobs(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.claim_stale_research_jobs(integer)   FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.claim_stale_background_jobs(integer) TO service_role;
GRANT  EXECUTE ON FUNCTION public.claim_stale_research_jobs(integer)   TO service_role;

-- 2) جدول سجل الأمان الموحّد (audit log) — للقراءة من بوت تليجرام فقط
CREATE TABLE IF NOT EXISTS public.security_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   text NOT NULL,                    -- 'key_used','role_changed','rls_denied','provider_error','rate_limited','dlq_enqueued'
  severity     text NOT NULL DEFAULT 'info',     -- 'info','warn','critical'
  actor_user_id uuid,
  target_id    text,                             -- e.g. key_id, conversation_id...
  function_name text,
  provider     text,
  details      jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash      text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.security_audit_log TO service_role;
-- لا anon ولا authenticated — القراءة عبر بوت تليجرام بـ service_role

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages audit log"
  ON public.security_audit_log
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_security_audit_event_time
  ON public.security_audit_log (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_security_audit_severity_time
  ON public.security_audit_log (severity, created_at DESC)
  WHERE severity IN ('warn','critical');
CREATE INDEX IF NOT EXISTS idx_security_audit_user_time
  ON public.security_audit_log (actor_user_id, created_at DESC)
  WHERE actor_user_id IS NOT NULL;

-- 3) Dead Letter Queue للمهام التي فشلت 3 مرات
CREATE TABLE IF NOT EXISTS public.dead_letter_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_id   uuid NOT NULL,
  source_table  text NOT NULL,                   -- 'background_jobs' | 'research_jobs' | 'operator_runs'
  user_id       uuid,
  runner        text,
  kind          text,
  input         jsonb,
  last_error    text,
  attempts      integer NOT NULL DEFAULT 0,
  provider_errors jsonb,
  enqueued_at   timestamptz NOT NULL DEFAULT now(),
  notified_admin_at timestamptz,
  resolved_at   timestamptz,
  resolution    text
);

GRANT ALL ON public.dead_letter_jobs TO service_role;
ALTER TABLE public.dead_letter_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role manages dlq"
  ON public.dead_letter_jobs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_dlq_unresolved
  ON public.dead_letter_jobs (enqueued_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_dlq_user
  ON public.dead_letter_jobs (user_id, enqueued_at DESC)
  WHERE user_id IS NOT NULL;

-- 4) Provider circuit breaker state (لكل مزود/مفتاح)
CREATE TABLE IF NOT EXISTS public.provider_circuit_state (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope        text NOT NULL,            -- 'provider' | 'key'
  scope_id     text NOT NULL,            -- e.g. 'openai' or '<key_id>'
  state        text NOT NULL DEFAULT 'closed',  -- 'closed' | 'open' | 'half_open'
  failure_count integer NOT NULL DEFAULT 0,
  success_count integer NOT NULL DEFAULT 0,
  opened_at    timestamptz,
  reopens_at   timestamptz,
  last_error   text,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(scope, scope_id)
);

GRANT ALL ON public.provider_circuit_state TO service_role;
ALTER TABLE public.provider_circuit_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role manages breaker"
  ON public.provider_circuit_state
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_circuit_open
  ON public.provider_circuit_state (scope, scope_id)
  WHERE state <> 'closed';

-- 5) Helper RPC: log audit (callable by service_role from edge functions)
CREATE OR REPLACE FUNCTION public.log_security_event(
  p_event_type text,
  p_severity   text DEFAULT 'info',
  p_actor_user_id uuid DEFAULT NULL,
  p_target_id  text DEFAULT NULL,
  p_function_name text DEFAULT NULL,
  p_provider   text DEFAULT NULL,
  p_details    jsonb DEFAULT '{}'::jsonb,
  p_ip_hash    text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.security_audit_log (
    event_type, severity, actor_user_id, target_id, function_name, provider, details, ip_hash
  ) VALUES (
    p_event_type, p_severity, p_actor_user_id, p_target_id, p_function_name, p_provider, COALESCE(p_details,'{}'::jsonb), p_ip_hash
  ) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_security_event(text,text,uuid,text,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.log_security_event(text,text,uuid,text,text,text,jsonb,text) TO service_role;

-- 6) Helper RPC: dead letter (يُستدعى عند فشل watchdog 3 مرات)
CREATE OR REPLACE FUNCTION public.move_to_dead_letter(
  p_original_id uuid,
  p_source_table text,
  p_last_error text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_id  uuid;
BEGIN
  IF p_source_table = 'background_jobs' THEN
    SELECT user_id, runner, kind, input, error, attempt, provider_errors
      INTO v_row FROM public.background_jobs WHERE id = p_original_id;
  ELSIF p_source_table = 'research_jobs' THEN
    SELECT user_id, NULL::text AS runner, 'research'::text AS kind,
           jsonb_build_object('query', query) AS input,
           error_message AS error, attempt, provider_errors
      INTO v_row FROM public.research_jobs WHERE id = p_original_id;
  ELSE
    RAISE EXCEPTION 'unknown source_table %', p_source_table;
  END IF;

  INSERT INTO public.dead_letter_jobs (
    original_id, source_table, user_id, runner, kind, input,
    last_error, attempts, provider_errors
  ) VALUES (
    p_original_id, p_source_table, v_row.user_id, v_row.runner, v_row.kind, v_row.input,
    COALESCE(p_last_error, v_row.error), COALESCE(v_row.attempt,0), v_row.provider_errors
  ) RETURNING id INTO v_id;

  PERFORM public.log_security_event(
    'dlq_enqueued','warn', v_row.user_id, p_original_id::text, NULL, NULL,
    jsonb_build_object('source', p_source_table, 'error', p_last_error)
  );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.move_to_dead_letter(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.move_to_dead_letter(uuid,text,text) TO service_role;
