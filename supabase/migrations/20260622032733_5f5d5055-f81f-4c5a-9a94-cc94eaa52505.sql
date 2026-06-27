
CREATE OR REPLACE FUNCTION public.pick_api_key(p_service text)
RETURNS TABLE(id uuid, api_key text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  (
    SELECT k.id, k.api_key
    FROM public.alibaba_keys k
    WHERE p_service = 'alibaba'
      AND COALESCE(k.status, 'active') = 'active'
      AND COALESCE(k.failure_count, 0) < 5
    ORDER BY k.last_used_at NULLS FIRST, COALESCE(k.failure_count, 0) ASC
    LIMIT 1
  )
  UNION ALL
  (
    SELECT k.id, k.api_key
    FROM public.api_keys k
    WHERE p_service <> 'alibaba'
      AND k.service = p_service
      AND k.is_active = true
      AND k.is_blocked = false
      AND k.credit_used_usd < k.credit_limit_usd
    ORDER BY k.last_used_at NULLS FIRST, k.credit_used_usd ASC
    LIMIT 1
  )
  LIMIT 1;
$function$;

CREATE OR REPLACE FUNCTION public.record_api_key_usage(
  p_id uuid,
  p_cost_usd numeric DEFAULT 0,
  p_ok boolean DEFAULT true,
  p_error text DEFAULT NULL::text,
  p_status_code integer DEFAULT NULL::integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  k record;
BEGIN
  SELECT * INTO k FROM public.api_keys WHERE id = p_id FOR UPDATE;
  IF FOUND THEN
    UPDATE public.api_keys
    SET usage_count    = usage_count + 1,
        credit_used_usd = credit_used_usd + COALESCE(p_cost_usd, 0),
        last_used_at   = now(),
        error_count    = error_count + CASE WHEN p_ok THEN 0 ELSE 1 END,
        last_error_at  = CASE WHEN p_ok THEN last_error_at ELSE now() END,
        is_blocked     = CASE
                            WHEN credit_used_usd + COALESCE(p_cost_usd, 0) >= credit_limit_usd THEN true
                            WHEN p_status_code IN (401, 402, 403) THEN true
                            WHEN p_status_code = 429 AND COALESCE(p_error, '') ILIKE '%quota%' THEN true
                            ELSE is_blocked
                          END,
        block_reason   = CASE
                            WHEN credit_used_usd + COALESCE(p_cost_usd, 0) >= credit_limit_usd THEN 'credit_exhausted'
                            WHEN p_status_code IN (401, 402, 403) THEN 'auth_or_payment'
                            WHEN p_status_code = 429 AND COALESCE(p_error, '') ILIKE '%quota%' THEN 'quota_exhausted'
                            ELSE block_reason
                          END
    WHERE id = p_id;
    RETURN;
  END IF;

  UPDATE public.alibaba_keys
  SET last_used_at  = now(),
      failure_count = CASE WHEN p_ok THEN 0 ELSE COALESCE(failure_count, 0) + 1 END,
      last_error    = CASE WHEN p_ok THEN last_error ELSE LEFT(COALESCE(p_error, ''), 500) END,
      status        = CASE
                        WHEN NOT p_ok AND p_status_code IN (401, 402, 403) THEN 'blocked'
                        WHEN NOT p_ok AND COALESCE(failure_count, 0) + 1 >= 5 THEN 'blocked'
                        ELSE COALESCE(status, 'active')
                      END,
      updated_at    = now()
  WHERE id = p_id;
END;
$function$;
