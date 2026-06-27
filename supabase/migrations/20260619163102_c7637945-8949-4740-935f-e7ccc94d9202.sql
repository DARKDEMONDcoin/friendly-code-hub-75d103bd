
CREATE TABLE IF NOT EXISTS public.bot_pending_actions (
  chat_id bigint PRIMARY KEY,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.bot_pending_actions TO service_role;
ALTER TABLE public.bot_pending_actions ENABLE ROW LEVEL SECURITY;
-- Service-role only; no policies for anon/authenticated.
