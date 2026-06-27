CREATE OR REPLACE FUNCTION public.admin_grant_pro_monthly(target_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_period_end timestamptz := now() + interval '30 days';
  v_sub_id text := 'comp:influencer:' || extract(epoch from now())::bigint::text;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(target_email) LIMIT 1;
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO public.subscriptions (user_id, plan, status, current_period_end, polar_subscription_id, amount_cents, currency)
  VALUES (v_user_id, 'pro', 'active', v_period_end, v_sub_id, 0, 'USD');

  UPDATE public.profiles SET plan = 'pro', updated_at = now() WHERE id = v_user_id;

  RETURN jsonb_build_object('ok', true, 'user_id', v_user_id, 'period_end', v_period_end, 'plan', 'pro', 'duration', '1 month');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_grant_pro_monthly(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_grant_pro_monthly(text) TO service_role;