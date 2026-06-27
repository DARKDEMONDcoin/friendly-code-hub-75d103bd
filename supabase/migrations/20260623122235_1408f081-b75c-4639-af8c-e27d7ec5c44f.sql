
CREATE OR REPLACE FUNCTION public.cleanup_high_volume_tables()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted jsonb := '{}'::jsonb;
  v_count bigint;
BEGIN
  DELETE FROM public.service_status WHERE checked_at < now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('service_status', v_count);

  DELETE FROM public.admin_error_log WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('admin_error_log', v_count);

  DELETE FROM public.key_usage_log WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('key_usage_log', v_count);

  DELETE FROM public.chat_router_logs WHERE created_at < now() - interval '14 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('chat_router_logs', v_count);

  DELETE FROM public.agent_runs
    WHERE status IN ('success','failed','error','completed','cancelled')
      AND COALESCE(ended_at, started_at) < now() - interval '30 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('agent_runs', v_count);

  DELETE FROM public.background_jobs
    WHERE status IN ('completed','failed','cancelled')
      AND created_at < now() - interval '7 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('background_jobs', v_count);

  DELETE FROM public.rate_limit_buckets WHERE updated_at < now() - interval '2 days';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('rate_limit_buckets', v_count);

  DELETE FROM public.otp_codes WHERE created_at < now() - interval '1 day';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('otp_codes', v_count);

  DELETE FROM public.oauth_codes WHERE expires_at < now() - interval '1 day';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  v_deleted := v_deleted || jsonb_build_object('oauth_codes', v_count);

  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_high_volume_tables() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_high_volume_tables() TO service_role;

-- Schedule daily cleanup at 3:30 AM
SELECT cron.unschedule('cleanup-high-volume-tables') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'cleanup-high-volume-tables'
);

SELECT cron.schedule(
  'cleanup-high-volume-tables',
  '30 3 * * *',
  $cron$ SELECT public.cleanup_high_volume_tables(); $cron$
);
