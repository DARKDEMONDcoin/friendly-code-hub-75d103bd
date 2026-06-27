
-- 1. Signup claim RPC — grants 15 credits to the referred user, creates referral row
CREATE OR REPLACE FUNCTION public.claim_referral_signup(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email_confirmed timestamptz;
  v_clean_code text;
  v_referrer_id uuid;
  v_existing uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT email_confirmed_at INTO v_email_confirmed
    FROM auth.users WHERE id = v_user_id;
  IF v_email_confirmed IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_not_confirmed');
  END IF;

  SELECT id INTO v_existing FROM public.referrals
    WHERE referred_id = v_user_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'already', true);
  END IF;

  v_clean_code := upper(trim(coalesce(p_code, '')));
  IF v_clean_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_code');
  END IF;

  SELECT user_id INTO v_referrer_id
    FROM public.referral_codes
    WHERE upper(code) = v_clean_code
    LIMIT 1;
  IF v_referrer_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_code');
  END IF;
  IF v_referrer_id = v_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'self_referral');
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, referral_code, status)
  VALUES (v_referrer_id, v_user_id, v_clean_code, 'pending');

  PERFORM public.add_credits(v_user_id, 15::numeric, 'Referral signup bonus (invited by friend)');

  RETURN jsonb_build_object(
    'ok', true,
    'referrer_id', v_referrer_id,
    'credits_granted', 15
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_referral_signup(text) TO authenticated;

-- 2. Purchase trigger — first successful payment grants reward to inviter
CREATE OR REPLACE FUNCTION public.process_referral_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prior_count int;
  v_ref_id uuid;
  v_referrer_id uuid;
  v_mode text;
  v_amount_cents bigint;
  v_commission numeric;
BEGIN
  -- Only on the user's FIRST successful order
  SELECT COUNT(*) INTO v_prior_count
    FROM public.processed_orders
    WHERE user_id = NEW.user_id AND id <> NEW.id;
  IF v_prior_count > 0 THEN RETURN NEW; END IF;

  -- Find pending referral for this user
  SELECT id, referrer_id INTO v_ref_id, v_referrer_id
    FROM public.referrals
    WHERE referred_id = NEW.user_id AND status = 'pending'
    LIMIT 1;
  IF v_ref_id IS NULL THEN RETURN NEW; END IF;

  -- Resolve referrer's chosen reward mode
  SELECT COALESCE(referral_mode, 'cash') INTO v_mode
    FROM public.referral_codes
    WHERE user_id = v_referrer_id LIMIT 1;

  IF v_mode = 'credits' THEN
    PERFORM public.add_credits(v_referrer_id, 15::numeric, 'Referral reward: friend subscribed');
    INSERT INTO public.referral_earnings
      (referrer_id, referred_id, amount, source_action, available_at)
    VALUES
      (v_referrer_id, NEW.user_id, 0, 'credits_15', now());
  ELSE
    -- Cash 20% of the first successful payment
    SELECT (payload->'data'->>'total_amount')::bigint INTO v_amount_cents
      FROM public.payment_events
      WHERE payload->'data'->>'id' = NEW.polar_order_id
        AND event_type IN ('order.paid','order.created','order.updated')
        AND (payload->'data'->>'total_amount') IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1;

    IF v_amount_cents IS NULL OR v_amount_cents <= 0 THEN
      RETURN NEW;
    END IF;

    v_commission := round((v_amount_cents::numeric / 100.0) * 0.20, 2);

    INSERT INTO public.referral_earnings
      (referrer_id, referred_id, amount, source_action, available_at)
    VALUES
      (v_referrer_id, NEW.user_id, v_commission, 'cash_20', now() + interval '30 days');
  END IF;

  UPDATE public.referrals SET status = 'converted' WHERE id = v_ref_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_process_referral_purchase ON public.processed_orders;
CREATE TRIGGER trg_process_referral_purchase
  AFTER INSERT ON public.processed_orders
  FOR EACH ROW EXECUTE FUNCTION public.process_referral_purchase();
