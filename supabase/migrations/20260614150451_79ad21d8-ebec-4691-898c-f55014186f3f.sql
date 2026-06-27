
-- 1. media_provider_keys
CREATE TABLE public.media_provider_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('alibaba','byteplus')),
  api_key TEXT NOT NULL,
  workspace_id TEXT,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled','exhausted')),
  priority INT NOT NULL DEFAULT 100,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mpk_provider_status ON public.media_provider_keys(provider, status, priority);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_provider_keys TO authenticated;
GRANT ALL ON public.media_provider_keys TO service_role;
ALTER TABLE public.media_provider_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage keys" ON public.media_provider_keys FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.bot_admins ba WHERE ba.telegram_chat_id::text = (auth.jwt() ->> 'telegram_chat_id')))
WITH CHECK (EXISTS (SELECT 1 FROM public.bot_admins ba WHERE ba.telegram_chat_id::text = (auth.jwt() ->> 'telegram_chat_id')));

-- 2. media_key_limits
CREATE TABLE public.media_key_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES public.media_provider_keys(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  max_uses INT NOT NULL,
  reset_period TEXT NOT NULL DEFAULT 'none' CHECK (reset_period IN ('none','daily','monthly')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (key_id, model_id)
);
CREATE INDEX idx_mkl_key_model ON public.media_key_limits(key_id, model_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_key_limits TO authenticated;
GRANT ALL ON public.media_key_limits TO service_role;
ALTER TABLE public.media_key_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage limits" ON public.media_key_limits FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.bot_admins ba WHERE ba.telegram_chat_id::text = (auth.jwt() ->> 'telegram_chat_id')))
WITH CHECK (EXISTS (SELECT 1 FROM public.bot_admins ba WHERE ba.telegram_chat_id::text = (auth.jwt() ->> 'telegram_chat_id')));

-- 3. media_key_usage
CREATE TABLE public.media_key_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID NOT NULL REFERENCES public.media_provider_keys(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  used_count INT NOT NULL DEFAULT 0,
  period_start TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  UNIQUE (key_id, model_id)
);
CREATE INDEX idx_mku_key_model ON public.media_key_usage(key_id, model_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_key_usage TO authenticated;
GRANT ALL ON public.media_key_usage TO service_role;
ALTER TABLE public.media_key_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read usage" ON public.media_key_usage FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.bot_admins ba WHERE ba.telegram_chat_id::text = (auth.jwt() ->> 'telegram_chat_id')));

-- 4. media_generation_log
CREATE TABLE public.media_generation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key_id UUID REFERENCES public.media_provider_keys(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  user_id UUID,
  kind TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success','failed','quota_exceeded')),
  error_message TEXT,
  duration_ms INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_mgl_created ON public.media_generation_log(created_at DESC);
CREATE INDEX idx_mgl_key ON public.media_generation_log(key_id, created_at DESC);

GRANT SELECT ON public.media_generation_log TO authenticated;
GRANT ALL ON public.media_generation_log TO service_role;
ALTER TABLE public.media_generation_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read logs" ON public.media_generation_log FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.bot_admins ba WHERE ba.telegram_chat_id::text = (auth.jwt() ->> 'telegram_chat_id')));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_mpk_updated BEFORE UPDATE ON public.media_provider_keys FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER trg_mkl_updated BEFORE UPDATE ON public.media_key_limits FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Atomic key-acquisition RPC: picks the highest-priority active key for (provider, model_id)
-- that still has capacity, increments its usage atomically, and returns the key + workspace.
CREATE OR REPLACE FUNCTION public.acquire_media_key(p_provider TEXT, p_model_id TEXT)
RETURNS TABLE (key_id UUID, api_key TEXT, workspace_id TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_key RECORD;
BEGIN
  -- Reset expired periods first
  UPDATE public.media_key_usage u
  SET used_count = 0, period_start = now()
  FROM public.media_key_limits l
  WHERE u.key_id = l.key_id AND u.model_id = l.model_id
    AND ((l.reset_period = 'daily' AND u.period_start < now() - INTERVAL '1 day')
      OR (l.reset_period = 'monthly' AND u.period_start < now() - INTERVAL '30 days'));

  -- Pick first available key with capacity
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
    -- Increment usage counter
    INSERT INTO public.media_key_usage (key_id, model_id, used_count, last_used_at)
    VALUES (v_key.id, p_model_id, 1, now())
    ON CONFLICT (key_id, model_id) DO UPDATE
      SET used_count = media_key_usage.used_count + 1, last_used_at = now();

    key_id := v_key.id;
    api_key := v_key.api_key;
    workspace_id := v_key.workspace_id;
    RETURN NEXT;
    RETURN;
  END LOOP;
  RETURN;
END; $$;

GRANT EXECUTE ON FUNCTION public.acquire_media_key(TEXT, TEXT) TO service_role;

-- Mark key as exhausted (call when provider returns quota error)
CREATE OR REPLACE FUNCTION public.mark_media_key_exhausted(p_key_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.media_provider_keys SET status = 'exhausted', notes = COALESCE(p_reason, notes) WHERE id = p_key_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_media_key_exhausted(UUID, TEXT) TO service_role;
