
-- ============================================================
-- 1) Extend image_models with billing + capability columns
-- ============================================================
ALTER TABLE public.image_models
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'credit_based',
  ADD COLUMN IF NOT EXISTS free_trial_count integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS provider_pool text,
  ADD COLUMN IF NOT EXISTS model_id_api text,
  ADD COLUMN IF NOT EXISTS supports_image_editing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_text_rendering boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_vector_output boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS max_resolution text;

ALTER TABLE public.image_models
  DROP CONSTRAINT IF EXISTS image_models_billing_mode_check;
ALTER TABLE public.image_models
  ADD CONSTRAINT image_models_billing_mode_check
  CHECK (billing_mode IN ('unlimited_subscriber','credit_based','free_trial'));

-- ============================================================
-- 2) Extend video_models with billing + capability columns
-- ============================================================
ALTER TABLE public.video_models
  ADD COLUMN IF NOT EXISTS billing_mode text NOT NULL DEFAULT 'credit_based',
  ADD COLUMN IF NOT EXISTS free_trial_count integer NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS provider_pool text,
  ADD COLUMN IF NOT EXISTS model_id_api text,
  ADD COLUMN IF NOT EXISTS supports_first_frame boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_last_frame boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_voice_clone boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_camera_control boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_multi_shot boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_lipsync boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS supports_video_editing boolean NOT NULL DEFAULT false;

ALTER TABLE public.video_models
  DROP CONSTRAINT IF EXISTS video_models_billing_mode_check;
ALTER TABLE public.video_models
  ADD CONSTRAINT video_models_billing_mode_check
  CHECK (billing_mode IN ('unlimited_subscriber','credit_based','free_trial'));

-- ============================================================
-- 3) Free-trial usage tracker (per user / provider / model)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.free_trial_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider_pool text NOT NULL,
  model_slug text NOT NULL,
  used_count integer NOT NULL DEFAULT 0,
  last_used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider_pool, model_slug)
);

GRANT SELECT ON public.free_trial_usage TO authenticated;
GRANT ALL ON public.free_trial_usage TO service_role;

ALTER TABLE public.free_trial_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read their own free trial usage" ON public.free_trial_usage;
CREATE POLICY "Users read their own free trial usage"
  ON public.free_trial_usage FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_free_trial_usage_user
  ON public.free_trial_usage(user_id, provider_pool, model_slug);

-- ============================================================
-- 4) Seed VIDEO models (premium catalog, June 15 2026)
--    Wipe existing rows to keep catalog clean and predictable.
-- ============================================================
DELETE FROM public.video_models;

INSERT INTO public.video_models (
  slug, display_name, provider, provider_pool, model_id_api,
  description, unit, cost_per_second_usd,
  supports_first_frame, supports_last_frame, supports_multi_image, max_input_images,
  supports_audio, supports_voice_clone, supports_camera_control, supports_multi_shot,
  supports_lipsync, supports_video_editing,
  supported_resolutions, supported_durations, default_resolution, default_duration,
  billing_mode, free_trial_count,
  is_premium, is_new, is_featured, sort_order, is_active
) VALUES
-- ─── DashScope (Alibaba) ────────────────────────────────────
('wan-2-7-i2v','Wan 2.7 Image-to-Video','dashscope','dashscope','wan2.7-i2v',
 'Flagship I2V with First+Last frame, lipsync via driving_audio, multi-ref up to 5','second',0.28,
 true,true,true,5,true,true,true,true,true,false,
 '["720p","1080p"]'::jsonb,'[5,8,10,15]'::jsonb,'1080p',8,
 'unlimited_subscriber',3,true,true,true,10,true),

('wan-2-7-t2v','Wan 2.7 Text-to-Video','dashscope','dashscope','wan2.7-t2v',
 'Multi-shot T2V with native audio, 1080p','second',0.28,
 false,false,false,0,true,false,true,true,false,false,
 '["720p","1080p"]'::jsonb,'[5,8,10,15]'::jsonb,'1080p',8,
 'unlimited_subscriber',3,true,true,true,20,true),

('wan-2-7-videoedit','Wan 2.7 VideoEdit','dashscope','dashscope','wan2.7-videoedit',
 'Local video editing: outfit/background/object swap','second',0.28,
 false,false,true,5,true,false,false,false,false,true,
 '["720p","1080p"]'::jsonb,'[5,8,10]'::jsonb,'1080p',5,
 'unlimited_subscriber',3,true,true,false,30,true),

('wan-2-1-vace-plus','Wan 2.1 VACE Plus','dashscope','dashscope','wan2.1-vace-plus',
 'Video repaint, local edit, extension, frame expansion','second',0.07,
 false,false,true,5,true,false,false,false,false,true,
 '["720p","1080p"]'::jsonb,'[5,8,10]'::jsonb,'1080p',5,
 'unlimited_subscriber',3,true,false,false,40,true),

('happyhorse-r2v','HappyHorse R2V','dashscope','dashscope','happyhorse-1.0-r2v',
 'Reference-to-Video with up to 9 reference images (#1 globally)','second',0.28,
 true,false,true,9,false,false,true,false,false,false,
 '["720p","1080p"]'::jsonb,'[5,8,10,15]'::jsonb,'1080p',8,
 'unlimited_subscriber',3,true,true,true,50,true),

('happyhorse-i2v','HappyHorse I2V','dashscope','dashscope','happyhorse-1.0-i2v',
 'Image-to-Video, first frame, cinematic camera control','second',0.28,
 true,false,false,0,false,false,true,false,false,false,
 '["720p","1080p"]'::jsonb,'[5,8,10,15]'::jsonb,'1080p',8,
 'unlimited_subscriber',3,true,true,false,60,true),

('happyhorse-t2v','HappyHorse T2V','dashscope','dashscope','happyhorse-1.0-t2v',
 'Text-to-Video, 1080p with camera control','second',0.28,
 false,false,false,0,false,false,true,false,false,false,
 '["720p","1080p"]'::jsonb,'[5,8,10,15]'::jsonb,'1080p',8,
 'unlimited_subscriber',3,true,true,false,70,true),

('happyhorse-videoedit','HappyHorse VideoEdit','dashscope','dashscope','happyhorse-1.0-video-edit',
 'Video editing with up to 5 reference images','second',0.28,
 false,false,true,5,false,false,false,false,false,true,
 '["720p","1080p"]'::jsonb,'[5,8,10]'::jsonb,'1080p',5,
 'unlimited_subscriber',3,true,true,false,80,true),

-- ─── Vercel AI Gateway ──────────────────────────────────────
('veo-3-1','Veo 3.1','vercel','vercel','google/veo-3.1-generate-001',
 'Google flagship: 4K, native A/V sync, timestamp multi-shot','second',0.50,
 true,false,false,0,true,false,true,true,false,false,
 '["1080p","4k"]'::jsonb,'[4,6,8]'::jsonb,'1080p',8,
 'credit_based',3,true,true,true,100,true),

('veo-3-1-fast','Veo 3.1 Fast','vercel','vercel','google/veo-3.1-fast-generate-001',
 'Veo 3.1 fast tier, 1080p with native audio','second',0.20,
 true,false,false,0,true,false,true,true,false,false,
 '["720p","1080p"]'::jsonb,'[4,6,8]'::jsonb,'1080p',6,
 'credit_based',3,true,true,true,110,true),

('seedance-2-0','Seedance 2.0','vercel','vercel','bytedance/seedance-2.0',
 'T2V + I2V + Ref2V + Edit + Extension + multilingual audio','second',0.14,
 true,false,true,5,true,false,true,true,false,true,
 '["720p","1080p"]'::jsonb,'[5,8,10]'::jsonb,'1080p',8,
 'credit_based',3,true,true,true,120,true),

('seedance-2-0-fast','Seedance 2.0 Fast','vercel','vercel','bytedance/seedance-2.0-fast',
 'Seedance 2.0 fast tier, full features, 16x cheaper','second',0.07,
 true,false,true,5,true,false,true,true,false,true,
 '["720p"]'::jsonb,'[5,8,10]'::jsonb,'720p',6,
 'credit_based',3,true,true,true,130,true),

('kling-v3-0-i2v','Kling v3.0 I2V','vercel','vercel','klingai/kling-v3.0-i2v',
 'First+Last frame, 6-axis camera control, physics-aware','second',0.126,
 true,true,false,0,true,false,true,true,false,false,
 '["1080p"]'::jsonb,'[5,8,10,15]'::jsonb,'1080p',8,
 'credit_based',3,true,true,true,140,true),

('kling-v3-0-t2v','Kling v3.0 T2V','vercel','vercel','klingai/kling-v3.0-t2v',
 'Multi-shot T2V, 15s max, native multilingual audio','second',0.126,
 false,false,false,0,true,false,true,true,false,false,
 '["1080p"]'::jsonb,'[5,8,10,15]'::jsonb,'1080p',8,
 'credit_based',3,true,true,false,150,true);

-- ============================================================
-- 5) Seed IMAGE models (premium catalog, June 15 2026)
-- ============================================================
DELETE FROM public.image_models;

INSERT INTO public.image_models (
  slug, display_name, provider, provider_pool, model_id_api,
  description, unit, unit_cost_usd,
  supports_multi_image, max_input_images,
  supports_image_editing, supports_text_rendering, supports_vector_output,
  supported_aspects, supported_resolutions, default_aspect, default_resolution, max_resolution,
  billing_mode, free_trial_count,
  is_premium, is_new, is_featured, sort_order, is_active
) VALUES
-- ─── DashScope (Alibaba) ────────────────────────────────────
('wan-2-7-image-pro','Wan 2.7 Image Pro','dashscope','dashscope','wan2.7-image-pro',
 '4K output, multi-ref, 1000-token text rendering','image',0.08,
 true,9,true,true,false,
 '["1:1","16:9","9:16","4:3","3:4"]'::jsonb,'["1024","2048","4096"]'::jsonb,'1:1','4096','4096x4096',
 'unlimited_subscriber',3,true,true,true,10,true),

('wan-2-7-image','Wan 2.7 Image','dashscope','dashscope','wan2.7-image',
 '2K standard, multi-ref, full editing suite','image',0.04,
 true,5,true,true,false,
 '["1:1","16:9","9:16","4:3","3:4"]'::jsonb,'["1024","2048"]'::jsonb,'1:1','2048','2048x2048',
 'unlimited_subscriber',3,true,true,false,20,true),

('qwen-image-2-0-pro','Qwen-Image 2.0 Pro','dashscope','dashscope','qwen-image-2.0-pro',
 'Best-in-class typography, style/pose/object editing, up to 3 inputs','image',0.04,
 true,3,true,true,false,
 '["1:1","16:9","9:16","4:3","3:4"]'::jsonb,'["1024","2048"]'::jsonb,'1:1','2048','2048x2048',
 'unlimited_subscriber',3,true,true,true,30,true),

('qwen-image-2-0','Qwen-Image 2.0','dashscope','dashscope','qwen-image-2.0',
 'Pure T2I with strong text rendering','image',0.02,
 false,0,false,true,false,
 '["1:1","16:9","9:16","4:3","3:4"]'::jsonb,'["1024"]'::jsonb,'1:1','1024','1024x1024',
 'unlimited_subscriber',3,true,true,false,40,true),

-- ─── Vercel AI Gateway ──────────────────────────────────────
('flux-2-max','FLUX.2 [max]','vercel','vercel','bfl/flux-2-max',
 'Up to 10 reference images, 4 MP, exact color match','image',0.12,
 true,10,false,true,false,
 '["1:1","16:9","9:16","4:3","3:4"]'::jsonb,'["2048"]'::jsonb,'1:1','2048','2000x2000',
 'unlimited_subscriber',3,true,true,true,100,true),

('flux-2-pro','FLUX.2 [pro]','vercel','vercel','bfl/flux-2-pro',
 'Commercial grade, 4 MP, multi-ref','image',0.08,
 true,6,false,true,false,
 '["1:1","16:9","9:16","4:3","3:4"]'::jsonb,'["2048"]'::jsonb,'1:1','2048','2000x2000',
 'unlimited_subscriber',3,true,true,false,110,true),

('flux-kontext-max','FLUX Kontext [max]','vercel','vercel','bfl/flux-kontext-max',
 'Best image editing + typography, context-aware','image',0.08,
 true,4,true,true,false,
 '["1:1","16:9","9:16","4:3","3:4"]'::jsonb,'["2048"]'::jsonb,'1:1','2048','2048x2048',
 'unlimited_subscriber',3,true,true,true,120,true),

('flux-kontext-pro','FLUX Kontext [pro]','vercel','vercel','bfl/flux-kontext-pro',
 'Image editing pro tier','image',0.04,
 true,4,true,true,false,
 '["1:1","16:9","9:16","4:3","3:4"]'::jsonb,'["2048"]'::jsonb,'1:1','2048','2048x2048',
 'unlimited_subscriber',3,true,true,false,130,true),

('gpt-image-2','GPT Image 2','vercel','vercel','openai/gpt-image-2',
 'OpenAI native editing + inpainting, flexible sizes','image',0.08,
 true,4,true,true,false,
 '["1:1","16:9","9:16","3:2"]'::jsonb,'["1024","1536"]'::jsonb,'1:1','1536','1536x1024',
 'unlimited_subscriber',3,true,true,true,140,true),

('gemini-3-pro-image','Gemini 3 Pro Image','vercel','vercel','google/gemini-3-pro-image',
 'Google Search grounded + high-res reasoning (Nano Banana Pro)','image',0.06,
 true,6,true,true,false,
 '["1:1","16:9","9:16"]'::jsonb,'["1024","2048"]'::jsonb,'1:1','2048','2048x2048',
 'unlimited_subscriber',3,true,true,true,150,true),

('nano-banana-2','Nano Banana 2 (Gemini 3.1 Flash Image)','vercel','vercel','google/gemini-3.1-flash-image',
 'Fast Gemini image gen + editing','image',0.02,
 true,4,true,true,false,
 '["1:1","16:9","9:16"]'::jsonb,'["1024"]'::jsonb,'1:1','1024','1024x1024',
 'unlimited_subscriber',3,true,true,false,160,true),

('seedream-4-5','Seedream 4.5','vercel','vercel','bytedance/seedream-4.5',
 'Strong stylization + SOTA editing','image',0.04,
 false,0,true,true,false,
 '["1:1","16:9","9:16","4:3","3:4"]'::jsonb,'["1024","2048"]'::jsonb,'1:1','2048','2048x2048',
 'unlimited_subscriber',3,true,true,false,170,true),

('recraft-v4-1','Recraft V4.1','vercel','vercel','recraft/recraft-v4.1',
 'Brand illustration, 20+ presets, vector output','image',0.04,
 false,0,true,true,true,
 '["1:1","16:9","9:16","4:3","3:4"]'::jsonb,'["1024","2048"]'::jsonb,'1:1','2048','2048x2048',
 'unlimited_subscriber',3,true,true,false,180,true);
