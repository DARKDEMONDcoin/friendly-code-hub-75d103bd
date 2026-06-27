DROP FUNCTION IF EXISTS public.acquire_media_key(text, text);

CREATE OR REPLACE FUNCTION public.acquire_media_key(p_provider text, p_model_id text)
RETURNS TABLE(o_key_id uuid, o_api_key text, o_workspace_id text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_key RECORD;
BEGIN
  UPDATE public.media_key_usage u
  SET used_count = 0, period_start = now()
  FROM public.media_key_limits l
  WHERE u.key_id = l.key_id AND u.model_id = l.model_id
    AND ((l.reset_period = 'daily' AND u.period_start < now() - INTERVAL '1 day')
      OR (l.reset_period = 'monthly' AND u.period_start < now() - INTERVAL '30 days'));

  FOR v_key IN
    SELECT k.id, k.api_key, k.workspace_id
    FROM public.media_provider_keys k
    LEFT JOIN public.media_key_limits l ON l.key_id = k.id AND l.model_id = p_model_id
    LEFT JOIN public.media_key_usage u ON u.key_id = k.id AND u.model_id = p_model_id
    WHERE k.provider = p_provider AND k.status = 'active'
      AND (l.max_uses IS NULL OR COALESCE(u.used_count, 0) < l.max_uses)
    ORDER BY k.priority ASC, k.created_at ASC
    LIMIT 1
  LOOP
    INSERT INTO public.media_key_usage AS mku (key_id, model_id, used_count, last_used_at)
    VALUES (v_key.id, p_model_id, 1, now())
    ON CONFLICT (key_id, model_id) DO UPDATE
      SET used_count = mku.used_count + 1, last_used_at = now();

    o_key_id := v_key.id;
    o_api_key := v_key.api_key;
    o_workspace_id := v_key.workspace_id;
    RETURN NEXT;
    RETURN;
  END LOOP;
  RETURN;
END; $function$;