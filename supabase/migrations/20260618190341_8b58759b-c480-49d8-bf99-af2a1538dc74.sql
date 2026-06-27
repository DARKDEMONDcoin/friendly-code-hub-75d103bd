ALTER TABLE public.bot_admin_pending
  DROP CONSTRAINT IF EXISTS bot_admin_pending_awaiting_service_check;

ALTER TABLE public.bot_admin_pending
  ADD CONSTRAINT bot_admin_pending_awaiting_service_check
  CHECK (
    awaiting_service = ANY (ARRAY['serper'::text, 'firecrawl'::text, 'leonardo'::text, 'manus'::text, 'media'::text, 'prompt'::text, 'alibaba'::text, 'vercel'::text])
    OR awaiting_service LIKE 'slide:%'
  );