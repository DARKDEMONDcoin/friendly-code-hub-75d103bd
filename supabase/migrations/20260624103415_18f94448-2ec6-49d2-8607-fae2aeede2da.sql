
-- 1. Extend blog_posts for multilingual / hreflang
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS translation_group_id uuid,
  ADD COLUMN IF NOT EXISTS is_original boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS faq jsonb;

CREATE INDEX IF NOT EXISTS idx_blog_posts_translation_group ON public.blog_posts(translation_group_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_lang_status ON public.blog_posts(language, status);

-- Backfill existing rows: each becomes its own group, original = true
UPDATE public.blog_posts
SET translation_group_id = COALESCE(translation_group_id, gen_random_uuid()),
    is_original = true,
    language = COALESCE(language, 'en')
WHERE translation_group_id IS NULL;

-- 2. Topic queue table
CREATE TABLE IF NOT EXISTS public.blog_topic_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  angle text,
  language text NOT NULL DEFAULT 'en',
  source text NOT NULL DEFAULT 'auto', -- 'auto' | 'telegram' | 'manual'
  requested_by text,
  status text NOT NULL DEFAULT 'queued', -- 'queued' | 'picked' | 'done' | 'failed'
  priority int NOT NULL DEFAULT 0,
  result_post_id uuid REFERENCES public.blog_posts(id) ON DELETE SET NULL,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  picked_at timestamptz,
  done_at timestamptz
);

GRANT SELECT, INSERT, UPDATE ON public.blog_topic_queue TO authenticated;
GRANT ALL ON public.blog_topic_queue TO service_role;

ALTER TABLE public.blog_topic_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "topic_queue_admin_read" ON public.blog_topic_queue
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "topic_queue_admin_write" ON public.blog_topic_queue
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_topic_queue_status_priority
  ON public.blog_topic_queue(status, priority DESC, created_at);

-- 3. Cron schedule for daily multilingual publishing
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.unschedule('blog-daily-publish') WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'blog-daily-publish'
);

SELECT cron.schedule(
  'blog-daily-publish',
  '0 6 * * *', -- every day at 06:00 UTC
  $cron$
  SELECT net.http_post(
    url := 'https://ltgampdtawuefwwayncx.supabase.co/functions/v1/blog-daily-publish',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0Z2FtcGR0YXd1ZWZ3d2F5bmN4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3Njk5ODAsImV4cCI6MjA4ODM0NTk4MH0.5ZOzuxCrm-TO4zzRDJ68LrCLH3f0itiznUxhbEupvGg"}'::jsonb,
    body := jsonb_build_object('trigger','cron','at', now())
  );
  $cron$
);
