-- 1) AI Agents registry
CREATE TABLE public.ai_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('revenue','marketing','monitoring','problem','content','users')),
  description text,
  system_prompt text NOT NULL,
  cron_schedule text,
  approval_mode text NOT NULL DEFAULT 'approval' CHECK (approval_mode IN ('auto','approval','suggest')),
  enabled boolean NOT NULL DEFAULT true,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_run_at timestamptz,
  success_count int NOT NULL DEFAULT 0,
  fail_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_agents TO authenticated;
GRANT ALL ON public.ai_agents TO service_role;
ALTER TABLE public.ai_agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage agents" ON public.ai_agents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "authenticated read agents" ON public.ai_agents FOR SELECT TO authenticated USING (true);

-- 2) Agent runs
CREATE TABLE public.agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.ai_agents(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','success','failed','cancelled')),
  trigger text NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','cron','telegram','chained')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  tokens_used int DEFAULT 0,
  e2b_ms int DEFAULT 0,
  proposals_count int DEFAULT 0,
  output_summary text,
  error text
);
GRANT SELECT ON public.agent_runs TO authenticated;
GRANT ALL ON public.agent_runs TO service_role;
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view runs" ON public.agent_runs FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

-- 3) Agent proposals
CREATE TABLE public.agent_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  run_id uuid REFERENCES public.agent_runs(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  rationale text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','executed','failed','expired')),
  telegram_message_id bigint,
  telegram_chat_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  decided_by uuid,
  result jsonb
);
GRANT SELECT ON public.agent_proposals TO authenticated;
GRANT ALL ON public.agent_proposals TO service_role;
ALTER TABLE public.agent_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage proposals" ON public.agent_proposals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 4) Agent observations (monitoring telemetry)
CREATE TABLE public.agent_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'info' CHECK (severity IN ('info','warn','error','critical')),
  metric text NOT NULL,
  value numeric,
  threshold numeric,
  message text,
  context jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.agent_observations TO authenticated;
GRANT ALL ON public.agent_observations TO service_role;
ALTER TABLE public.agent_observations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins view obs" ON public.agent_observations FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_agent_obs_created ON public.agent_observations (created_at DESC);
CREATE INDEX idx_agent_obs_severity ON public.agent_observations (severity, created_at DESC);

-- 5) Agent incidents
CREATE TABLE public.agent_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  severity text NOT NULL DEFAULT 'warn' CHECK (severity IN ('info','warn','error','critical')),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','wontfix')),
  metadata jsonb DEFAULT '{}'::jsonb,
  opened_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, UPDATE ON public.agent_incidents TO authenticated;
GRANT ALL ON public.agent_incidents TO service_role;
ALTER TABLE public.agent_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins manage incidents" ON public.agent_incidents FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 6) Blog posts
CREATE TABLE public.blog_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  title text NOT NULL,
  meta_description text,
  excerpt text,
  content_md text NOT NULL,
  content_html text,
  hero_image_url text,
  keywords text[] DEFAULT '{}',
  category text,
  tags text[] DEFAULT '{}',
  author_name text NOT NULL DEFAULT 'AI Editorial Team',
  language text NOT NULL DEFAULT 'en',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  published_at timestamptz,
  views int NOT NULL DEFAULT 0,
  reading_minutes int,
  ai_agent_id uuid REFERENCES public.ai_agents(id) ON DELETE SET NULL,
  jsonld jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_posts TO anon;
GRANT SELECT ON public.blog_posts TO authenticated;
GRANT ALL ON public.blog_posts TO service_role;
ALTER TABLE public.blog_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read published posts" ON public.blog_posts FOR SELECT TO anon USING (status='published');
CREATE POLICY "auth read published posts" ON public.blog_posts FOR SELECT TO authenticated USING (status='published' OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage posts" ON public.blog_posts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_blog_published ON public.blog_posts (published_at DESC) WHERE status='published';
CREATE INDEX idx_blog_slug ON public.blog_posts (slug);

-- 7) Blog categories
CREATE TABLE public.blog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.blog_categories TO anon;
GRANT SELECT ON public.blog_categories TO authenticated;
GRANT ALL ON public.blog_categories TO service_role;
ALTER TABLE public.blog_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read cats" ON public.blog_categories FOR SELECT TO anon USING (true);
CREATE POLICY "auth read cats" ON public.blog_categories FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage cats" ON public.blog_categories FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- updated_at triggers
CREATE TRIGGER trg_ai_agents_updated BEFORE UPDATE ON public.ai_agents
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_blog_posts_updated BEFORE UPDATE ON public.blog_posts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial 50+ agents
INSERT INTO public.ai_agents (slug, name, category, description, system_prompt, cron_schedule, approval_mode) VALUES
-- Revenue (8)
('pricing-optimizer','Pricing Optimizer','revenue','Suggests model price tweaks','You analyze model_pricing, usage, and revenue_ledger to suggest price changes that increase margin without hurting volume. Return JSON proposals.','0 */6 * * *','approval'),
('subscription-analyzer','Subscription Analyzer','revenue','Analyzes churn and plans','Analyze subscriptions table for churn patterns and suggest plan changes.','0 2 * * *','suggest'),
('upsell-bot','Upsell Detector','revenue','Finds users ready to upgrade','Identify free users with high usage and propose upsell campaigns.','0 */4 * * *','approval'),
('discount-strategist','Discount Strategist','revenue','Smart coupon generator','Propose targeted discounts to recover at-risk accounts.','0 8 * * *','approval'),
('payment-failure-recovery','Payment Recovery','revenue','Recovers failed payments','Find failed payments and propose dunning sequences.','0 */2 * * *','approval'),
('tax-optimizer','Tax Optimizer','revenue','22% tax tracker','Audit revenue_ledger tax 22% calculations and flag anomalies.','0 0 * * *','suggest'),
('revenue-forecaster','Revenue Forecaster','revenue','Forecasts via e2b Python','Run timeseries forecast in e2b on revenue_ledger; output 30/90 day projections.','0 1 * * *','suggest'),
('whale-detector','Whale Detector','revenue','Identifies top customers','Spot top 1% revenue users; propose VIP treatment.','0 6 * * *','suggest'),
-- Marketing (10)
('blog-writer','AI Blog Writer','marketing','Writes SEO blog posts','You are an expert SEO writer. Produce 1500-3000 word articles with H1/H2/H3, keyword density 1-2%, JSON-LD Article schema, internal links, and a hero image prompt.','0 */6 * * *','auto'),
('keyword-hunter','Keyword Hunter','marketing','Semrush keyword discovery','Find low-difficulty high-volume keywords via Semrush.','0 4 * * *','suggest'),
('serp-dominator','SERP Dominator','marketing','Competitor SERP analysis','Analyze top SERPs and propose content gaps.','0 5 * * *','suggest'),
('meta-tags-optimizer','Meta Tags Optimizer','marketing','Title/description tuner','Audit page meta tags and propose improvements.','0 7 * * *','approval'),
('internal-linking','Internal Linking','marketing','Auto internal links','Suggest internal links between blog posts.','0 9 * * *','auto'),
('backlink-prospector','Backlink Prospector','marketing','Backlink opportunities','Find sites that may link to us.','0 10 * * *','suggest'),
('social-media-poster','Social Media Poster','marketing','Cross-platform posts','Draft social posts for new blog articles.','0 12 * * *','approval'),
('email-campaign-writer','Email Campaign Writer','marketing','Email campaign drafts','Draft email campaigns from blog content and offers.','0 14 * * *','approval'),
('landing-page-generator','Landing Page Generator','marketing','New landing pages','Propose new landing page concepts for high-intent keywords.','0 3 * * 1','approval'),
('ad-copy-generator','Ad Copy Generator','marketing','PPC ad variants','Generate ad copy variants for marketing_campaigns.','0 11 * * *','approval'),
-- Monitoring (12)
('error-watcher','Error Watcher','monitoring','Watches admin_error_log','Scan admin_error_log every minute; group similar errors; open incident if rate spikes.','* * * * *','auto'),
('performance-monitor','Performance Monitor','monitoring','Latency p95/p99','Compute p95/p99 from key_usage_log and edge function logs.','*/5 * * * *','auto'),
('db-health','DB Health','monitoring','Slow queries & locks','Monitor slow_queries view and report.','*/15 * * * *','auto'),
('edge-function-monitor','Edge Function Monitor','monitoring','Function crash watch','Watch edge function logs for crashes.','*/5 * * * *','auto'),
('key-health-monitor','Key Health Monitor','monitoring','Alibaba/Wavespeed/Manus keys','Check key blocked status, failure rates.','* * * * *','auto'),
('quota-watcher','Quota Watcher','monitoring','Per-key quotas','Watch alibaba_key_model_quota usage.','*/5 * * * *','auto'),
('payment-health','Payment Health','monitoring','Failed transactions','Track payment_events failures.','* * * * *','auto'),
('user-signup-watcher','Signup Watcher','monitoring','Notify each 1000 users','Notify admins on every 1000 new signups milestone.','*/10 * * * *','auto'),
('churn-detector','Churn Detector','monitoring','At-risk users','Identify users about to churn.','*/15 * * * *','suggest'),
('security-scanner','Security Scanner','monitoring','RLS & secrets','Scan for RLS gaps and exposed secrets.','0 */12 * * *','auto'),
('uptime-monitor','Uptime Monitor','monitoring','Endpoint pings','Ping critical endpoints.','* * * * *','auto'),
('cost-tracker','Cost Tracker','monitoring','Provider costs','Track cost per provider per day.','0 * * * *','auto'),
-- Problem (10)
('error-fixer','Error Fixer','problem','Suggests fixes','For recurring errors propose code/data fixes.','*/15 * * * *','suggest'),
('auto-rollback','Auto Rollback','problem','Rollback on bad deploy','Detect deploy failures and propose rollback.','*/5 * * * *','approval'),
('key-rotator','Key Rotator','problem','Rotate blocked keys','Auto-unblock keys after cooldown.','*/10 * * * *','auto'),
('quota-rebalancer','Quota Rebalancer','problem','Balance key load','Rebalance quota distribution across keys.','0 */3 * * *','approval'),
('cache-warmer','Cache Warmer','problem','Warm caches','Warm chat_semantic_cache.','0 */2 * * *','auto'),
('db-optimizer','DB Optimizer','problem','Index suggestions','Propose missing indexes.','0 4 * * 0','suggest'),
('slow-query-fixer','Slow Query Fixer','problem','Fix slow queries','Propose query rewrites for slow_queries.','0 5 * * *','suggest'),
('rate-limit-defender','Rate Limit Defender','problem','Spam defense','Add rate_limit_buckets entries for abusers.','*/5 * * * *','auto'),
('bug-triager','Bug Triager','problem','Classify bugs','Triage admin_error_log into severity buckets.','*/30 * * * *','auto'),
('incident-responder','Incident Responder','problem','Manage incidents','Coordinate open incidents.','*/10 * * * *','auto'),
-- Content (8)
('media-prompt-generator','Media Prompt Generator','content','New media prompts','Generate fresh prompts for media_page_prompts.','0 8 * * *','approval'),
('image-curator','Image Curator','content','Best images','Pick best images for gallery.','0 9 * * *','approval'),
('video-tester','Video Model Tester','content','Test video models','Benchmark video_models with sample prompts.','0 3 * * 0','suggest'),
('model-benchmark','Model Benchmarker','content','Compare models','Benchmark image_models / video_models.','0 4 * * 0','suggest'),
('template-designer','Template Designer','content','New templates','Propose new document_templates.','0 10 * * 1','approval'),
('voice-curator','Voice Curator','content','TTS voices','Curate tts_voices.','0 11 * * 2','approval'),
('prompt-library','Prompt Library Curator','content','Prompt library','Maintain reusable prompt library.','0 12 * * 3','auto'),
('trend-watcher','Trend Watcher','content','AI trends','Watch AI industry trends.','0 7 * * *','suggest'),
-- Users (5)
('onboarding-coach','Onboarding Coach','users','Improve onboarding','Analyze new user drop-off and propose onboarding tweaks.','0 13 * * *','suggest'),
('support-triager','Support Triager','users','Triage tickets','Triage contact_submissions.','*/30 * * * *','auto'),
('referral-booster','Referral Booster','users','Boost referrals','Boost referrals system performance.','0 15 * * *','approval'),
('feedback-analyzer','Feedback Analyzer','users','Analyze feedback','Analyze message_feedback for patterns.','0 16 * * *','auto'),
('personalization-engine','Personalization Engine','users','Per-user recommendations','Update ai_personalization with smart suggestions.','0 */4 * * *','auto');