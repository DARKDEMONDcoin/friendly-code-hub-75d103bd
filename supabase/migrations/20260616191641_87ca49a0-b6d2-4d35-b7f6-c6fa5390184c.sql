
-- 1) Add referral_mode to referral_codes
ALTER TABLE public.referral_codes
  ADD COLUMN IF NOT EXISTS referral_mode text NOT NULL DEFAULT 'cash'
  CHECK (referral_mode IN ('cash','credits'));

-- 2) Reward tasks catalog
CREATE TABLE IF NOT EXISTS public.reward_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_key text UNIQUE NOT NULL,
  title text NOT NULL,
  description text,
  reward_credits numeric NOT NULL DEFAULT 0,
  action_type text NOT NULL CHECK (action_type IN (
    'follow_x','follow_instagram','follow_facebook','follow_linkedin',
    'follow_tiktok','follow_youtube','join_telegram','invite_friends','custom'
  )),
  action_url text,
  target_count integer NOT NULL DEFAULT 1,
  icon text,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.reward_tasks TO anon, authenticated;
GRANT ALL ON public.reward_tasks TO service_role;

ALTER TABLE public.reward_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read active reward tasks" ON public.reward_tasks;
CREATE POLICY "Anyone can read active reward tasks"
  ON public.reward_tasks FOR SELECT
  USING (active = true);

DROP POLICY IF EXISTS "Service role manages reward tasks" ON public.reward_tasks;
CREATE POLICY "Service role manages reward tasks"
  ON public.reward_tasks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- 3) User progress on reward tasks
CREATE TABLE IF NOT EXISTS public.user_reward_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  task_id uuid NOT NULL REFERENCES public.reward_tasks(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  awarded_credits numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, task_id)
);

GRANT SELECT, INSERT, UPDATE ON public.user_reward_tasks TO authenticated;
GRANT ALL ON public.user_reward_tasks TO service_role;

ALTER TABLE public.user_reward_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own task progress" ON public.user_reward_tasks;
CREATE POLICY "Users read own task progress"
  ON public.user_reward_tasks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own task progress" ON public.user_reward_tasks;
CREATE POLICY "Users insert own task progress"
  ON public.user_reward_tasks FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own task progress" ON public.user_reward_tasks;
CREATE POLICY "Users update own task progress"
  ON public.user_reward_tasks FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role manages task progress" ON public.user_reward_tasks;
CREATE POLICY "Service role manages task progress"
  ON public.user_reward_tasks FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_reward_tasks_updated ON public.reward_tasks;
CREATE TRIGGER trg_reward_tasks_updated BEFORE UPDATE ON public.reward_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_user_reward_tasks_updated ON public.user_reward_tasks;
CREATE TRIGGER trg_user_reward_tasks_updated BEFORE UPDATE ON public.user_reward_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed default tasks
INSERT INTO public.reward_tasks (task_key, title, description, reward_credits, action_type, action_url, target_count, icon, sort_order)
VALUES
  ('follow_x', 'Follow us on X', 'Follow @MegsyAI on X (Twitter) to earn credits', 5, 'follow_x', 'https://x.com/MegsyAI', 1, '𝕏', 10),
  ('follow_instagram', 'Follow us on Instagram', 'Follow @megsy.ai on Instagram', 5, 'follow_instagram', 'https://instagram.com/megsy.ai', 1, 'IG', 20),
  ('follow_facebook', 'Like us on Facebook', 'Like the Megsy AI page on Facebook', 5, 'follow_facebook', 'https://facebook.com/megsy.ai', 1, 'f', 30),
  ('follow_linkedin', 'Follow us on LinkedIn', 'Follow Megsy AI on LinkedIn', 5, 'follow_linkedin', 'https://linkedin.com/company/megsy-ai', 1, 'in', 40),
  ('join_telegram', 'Join our Telegram', 'Join the Megsy AI Telegram channel', 5, 'join_telegram', 'https://t.me/megsyai', 1, 'TG', 50),
  ('invite_3', 'Invite 3 friends', 'Get 3 friends to sign up with your referral link', 25, 'invite_friends', NULL, 3, '👥', 60),
  ('invite_10', 'Invite 10 friends', 'Get 10 friends to sign up with your referral link', 100, 'invite_friends', NULL, 10, '🚀', 70)
ON CONFLICT (task_key) DO NOTHING;
