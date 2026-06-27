GRANT ALL ON TABLE public.bot_pending_actions TO service_role;

ALTER TABLE public.bot_pending_actions ENABLE ROW LEVEL SECURITY;