
-- Add columns for dedup + adapter flags
ALTER TABLE public.marketing_posts ADD COLUMN IF NOT EXISTS content_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_marketing_posts_content_hash ON public.marketing_posts(user_id, content_hash);

ALTER TABLE public.marketing_accounts ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE public.marketing_accounts ADD COLUMN IF NOT EXISTS last_test_at TIMESTAMPTZ;
ALTER TABLE public.marketing_accounts ADD COLUMN IF NOT EXISTS last_test_ok BOOLEAN;
ALTER TABLE public.marketing_accounts ADD COLUMN IF NOT EXISTS last_test_error TEXT;

-- Publish queue
CREATE TABLE IF NOT EXISTS public.marketing_publish_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  post_id UUID NOT NULL REFERENCES public.marketing_posts(id) ON DELETE CASCADE,
  account_id UUID NOT NULL REFERENCES public.marketing_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  last_error_code TEXT,
  external_id TEXT,
  external_url TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_publish_queue TO authenticated;
GRANT ALL ON public.marketing_publish_queue TO service_role;
ALTER TABLE public.marketing_publish_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "queue owner manages" ON public.marketing_publish_queue FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_mpq_status_next ON public.marketing_publish_queue(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS idx_mpq_user ON public.marketing_publish_queue(user_id);

-- Platform limits
CREATE TABLE IF NOT EXISTS public.marketing_platform_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  account_id UUID REFERENCES public.marketing_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  count_minute INTEGER NOT NULL DEFAULT 0,
  count_hour INTEGER NOT NULL DEFAULT 0,
  count_day INTEGER NOT NULL DEFAULT 0,
  last_published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_platform_limits TO authenticated;
GRANT ALL ON public.marketing_platform_limits TO service_role;
ALTER TABLE public.marketing_platform_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "limits owner manages" ON public.marketing_platform_limits FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_mpl_user_platform ON public.marketing_platform_limits(user_id, platform, account_id);

-- Analytics snapshots
CREATE TABLE IF NOT EXISTS public.marketing_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  post_id UUID REFERENCES public.marketing_posts(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.marketing_accounts(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  external_id TEXT,
  likes INTEGER,
  reshares INTEGER,
  comments INTEGER,
  impressions INTEGER,
  clicks INTEGER,
  raw JSONB NOT NULL DEFAULT '{}'::jsonb,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_analytics TO authenticated;
GRANT ALL ON public.marketing_analytics TO service_role;
ALTER TABLE public.marketing_analytics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "analytics owner reads" ON public.marketing_analytics FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_ma_post ON public.marketing_analytics(post_id, fetched_at DESC);

-- Generic updated_at trigger fn (reuse if exists)
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS mpq_touch ON public.marketing_publish_queue;
CREATE TRIGGER mpq_touch BEFORE UPDATE ON public.marketing_publish_queue
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS mpl_touch ON public.marketing_platform_limits;
CREATE TRIGGER mpl_touch BEFORE UPDATE ON public.marketing_platform_limits
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
