
-- 1) Roles system
DO $$ BEGIN
  CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "users read own roles" ON public.user_roles;
CREATE POLICY "users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2) Alibaba keys + per-model quota
CREATE TABLE IF NOT EXISTS public.alibaba_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  api_key text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'active',
  failure_count int NOT NULL DEFAULT 0,
  notes text,
  last_error text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alibaba_keys TO authenticated;
GRANT ALL ON public.alibaba_keys TO service_role;
ALTER TABLE public.alibaba_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage alibaba keys" ON public.alibaba_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.alibaba_key_model_quota (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id uuid NOT NULL REFERENCES public.alibaba_keys(id) ON DELETE CASCADE,
  model_id text NOT NULL,
  quota_total int NOT NULL DEFAULT 100,
  quota_used int NOT NULL DEFAULT 0,
  is_blocked boolean NOT NULL DEFAULT false,
  model_failure_count int NOT NULL DEFAULT 0,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key_id, model_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alibaba_key_model_quota TO authenticated;
GRANT ALL ON public.alibaba_key_model_quota TO service_role;
ALTER TABLE public.alibaba_key_model_quota ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage alibaba quota" ON public.alibaba_key_model_quota FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 3) WaveSpeed keys (USD-based)
CREATE TABLE IF NOT EXISTS public.wavespeed_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  api_key text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'active',
  balance_usd numeric(12,4) NOT NULL DEFAULT 0,
  spent_usd numeric(12,4) NOT NULL DEFAULT 0,
  failure_count int NOT NULL DEFAULT 0,
  last_error text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wavespeed_keys TO authenticated;
GRANT ALL ON public.wavespeed_keys TO service_role;
ALTER TABLE public.wavespeed_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage ws keys" ON public.wavespeed_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4) Manus keys
CREATE TABLE IF NOT EXISTS public.manus_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  api_key text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'active',
  failure_count int NOT NULL DEFAULT 0,
  last_error text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manus_keys TO authenticated;
GRANT ALL ON public.manus_keys TO service_role;
ALTER TABLE public.manus_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage manus keys" ON public.manus_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 5) Unified key usage log
CREATE TABLE IF NOT EXISTS public.key_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  key_id uuid,
  model_id text,
  success boolean NOT NULL,
  cost_usd numeric(12,6),
  error_message text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_kul_created ON public.key_usage_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_kul_provider_model ON public.key_usage_log(provider, model_id);
GRANT SELECT ON public.key_usage_log TO authenticated;
GRANT ALL ON public.key_usage_log TO service_role;
ALTER TABLE public.key_usage_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read usage" ON public.key_usage_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 6) Admin notifications
CREATE TABLE IF NOT EXISTS public.admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_notif_created ON public.admin_notifications(created_at DESC);
GRANT SELECT, UPDATE ON public.admin_notifications TO authenticated;
GRANT ALL ON public.admin_notifications TO service_role;
ALTER TABLE public.admin_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read notif" ON public.admin_notifications FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin update notif" ON public.admin_notifications FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 7) Revenue ledger (22% tax)
CREATE TABLE IF NOT EXISTS public.revenue_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id text,
  user_id uuid,
  gross_amount numeric(12,2) NOT NULL,
  tax_rate numeric(5,4) NOT NULL DEFAULT 0.22,
  tax_amount numeric(12,2) NOT NULL,
  net_amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  source text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rev_created ON public.revenue_ledger(created_at DESC);
GRANT SELECT ON public.revenue_ledger TO authenticated;
GRANT ALL ON public.revenue_ledger TO service_role;
ALTER TABLE public.revenue_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read revenue" ON public.revenue_ledger FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'));

-- 8) Media page prompts
CREATE TABLE IF NOT EXISTS public.media_page_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_slug text NOT NULL,
  model_id text,
  title text,
  prompt_text text NOT NULL,
  example_image_url text,
  position int NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mpp_slug ON public.media_page_prompts(page_slug, position);
GRANT SELECT ON public.media_page_prompts TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.media_page_prompts TO authenticated;
GRANT ALL ON public.media_page_prompts TO service_role;
ALTER TABLE public.media_page_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read prompts" ON public.media_page_prompts FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "admin manage prompts" ON public.media_page_prompts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 9) Trigger: notify every 1000 new users
CREATE OR REPLACE FUNCTION public.notify_user_milestone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  total bigint;
BEGIN
  SELECT count(*) INTO total FROM auth.users;
  IF total > 0 AND total % 1000 = 0 THEN
    INSERT INTO public.admin_notifications(type, payload)
    VALUES ('user_milestone', jsonb_build_object('total_users', total));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_user_milestone ON auth.users;
CREATE TRIGGER trg_user_milestone AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.notify_user_milestone();

-- 10) updated_at helper
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_ali_keys_touch BEFORE UPDATE ON public.alibaba_keys
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_ws_keys_touch BEFORE UPDATE ON public.wavespeed_keys
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_manus_keys_touch BEFORE UPDATE ON public.manus_keys
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_mpp_touch BEFORE UPDATE ON public.media_page_prompts
    FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
