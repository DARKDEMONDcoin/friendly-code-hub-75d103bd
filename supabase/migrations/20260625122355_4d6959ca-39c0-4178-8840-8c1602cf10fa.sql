
CREATE OR REPLACE FUNCTION public.admin_grant_pro_monthly(target_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(coalesce(target_email, '')));
  v_user_id uuid;
  v_existing_id uuid;
  v_existing_end timestamptz;
  v_period_end timestamptz := now() + interval '30 days';
  v_sub_id text := 'comp:influencer:' || extract(epoch from now())::bigint::text;
BEGIN
  IF v_email = '' OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email', 'email', v_email);
  END IF;

  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = v_email LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found', 'email', v_email);
  END IF;

  -- Extend any currently active Pro sub instead of creating a duplicate.
  SELECT id, current_period_end
    INTO v_existing_id, v_existing_end
  FROM public.subscriptions
  WHERE user_id = v_user_id
    AND plan = 'pro'
    AND status = 'active'
    AND (current_period_end IS NULL OR current_period_end > now())
  ORDER BY current_period_end DESC NULLS LAST
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    v_period_end := greatest(coalesce(v_existing_end, now()), now()) + interval '30 days';
    UPDATE public.subscriptions
       SET current_period_end = v_period_end,
           status = 'active',
           updated_at = now()
     WHERE id = v_existing_id;
  ELSE
    INSERT INTO public.subscriptions
      (user_id, plan, status, current_period_end, polar_subscription_id, amount_cents, currency)
    VALUES
      (v_user_id, 'pro', 'active', v_period_end, v_sub_id, 0, 'USD');
  END IF;

  -- Ensure a profile row exists and is set to pro.
  INSERT INTO public.profiles (id, plan, updated_at)
  VALUES (v_user_id, 'pro', now())
  ON CONFLICT (id) DO UPDATE
    SET plan = 'pro', updated_at = now();

  RETURN jsonb_build_object(
    'ok', true,
    'user_id', v_user_id,
    'email', v_email,
    'period_end', v_period_end,
    'plan', 'pro',
    'extended', v_existing_id IS NOT NULL
  );
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'exception', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_pro_monthly(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_pro_monthly(text) TO service_role;
