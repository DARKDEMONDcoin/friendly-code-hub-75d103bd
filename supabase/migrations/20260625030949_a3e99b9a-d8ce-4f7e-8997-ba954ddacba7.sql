
-- Marketing Automation System schema

CREATE TABLE IF NOT EXISTS public.marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  goal TEXT,
  tone TEXT DEFAULT 'professional',
  target_audience TEXT,
  languages TEXT[] DEFAULT ARRAY['ar','en'],
  hashtags TEXT[] DEFAULT ARRAY[]::TEXT[],
  schedule_cron TEXT DEFAULT '0 9 * * *',
  ai_model TEXT DEFAULT 'qwen-max',
  ai_prompt_template TEXT,
  topics TEXT[] DEFAULT ARRAY[]::TEXT[],
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO authenticated;
GRANT ALL ON public.marketing_campaigns TO service_role;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own campaigns" ON public.marketing_campaigns FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.marketing_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  handle TEXT,
  display_name TEXT,
  credentials JSONB NOT NULL DEFAULT '{}'::JSONB,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'active',
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_accounts TO authenticated;
GRANT ALL ON public.marketing_accounts TO service_role;
ALTER TABLE public.marketing_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own accounts" ON public.marketing_accounts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.marketing_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  campaign_id UUID REFERENCES public.marketing_campaigns(id) ON DELETE CASCADE,
  title TEXT,
  content TEXT NOT NULL,
  media_urls TEXT[] DEFAULT ARRAY[]::TEXT[],
  hashtags TEXT[] DEFAULT ARRAY[]::TEXT[],
  language TEXT DEFAULT 'ar',
  platform_variants JSONB NOT NULL DEFAULT '{}'::JSONB,
  target_platforms TEXT[] DEFAULT ARRAY[]::TEXT[],
  scheduled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  ai_generated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_posts TO authenticated;
GRANT ALL ON public.marketing_posts TO service_role;
ALTER TABLE public.marketing_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own posts" ON public.marketing_posts FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mkt_posts_status_sched ON public.marketing_posts(status, scheduled_at);

CREATE TABLE IF NOT EXISTS public.marketing_publish_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  post_id UUID REFERENCES public.marketing_posts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.marketing_accounts(id) ON DELETE SET NULL,
  platform TEXT NOT NULL,
  external_id TEXT,
  external_url TEXT,
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  metrics JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_publish_log TO authenticated;
GRANT ALL ON public.marketing_publish_log TO service_role;
ALTER TABLE public.marketing_publish_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own publish log" ON public.marketing_publish_log FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_mkt_log_post ON public.marketing_publish_log(post_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.marketing_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_mkt_campaigns_uat BEFORE UPDATE ON public.marketing_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_updated_at();
CREATE TRIGGER trg_mkt_accounts_uat BEFORE UPDATE ON public.marketing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_updated_at();
CREATE TRIGGER trg_mkt_posts_uat BEFORE UPDATE ON public.marketing_posts
  FOR EACH ROW EXECUTE FUNCTION public.marketing_touch_updated_at();
