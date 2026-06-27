-- Add remaining models from Vercel catalog
INSERT INTO public.image_models (
  slug, display_name, provider, provider_pool, model_id_api,
  description, unit, unit_cost_usd,
  supports_multi_image, max_input_images,
  supports_image_editing, supports_text_rendering, supports_vector_output,
  supported_aspects, supported_resolutions, default_aspect, default_resolution, max_resolution,
  billing_mode, free_trial_count,
  is_premium, is_new, is_featured, sort_order, is_active
) VALUES
('gpt-image-1','GPT Image 1','vercel','vercel','openai/gpt-image-1',
 'OpenAI original GPT Image 1 — native editing','image',0.04,
 true,4,true,true,false,
 '["1:1","16:9","9:16","3:2"]'::jsonb,'["1024","2048"]'::jsonb,'1:1','1024','2048x2048',
 'unlimited_subscriber',3,true,false,false,142,true),
('flux-fast-schnell','FLUX Fast Schnell','vercel','vercel','prodia/flux-fast-schnell',
 'Ultra-fast, low-cost FLUX schnell via Prodia','image',0.001,
 false,0,false,false,false,
 '["1:1","16:9","9:16"]'::jsonb,'["512"]'::jsonb,'1:1','512','1024x1024',
 'unlimited_subscriber',5,false,false,false,200,true)
ON CONFLICT (slug) DO NOTHING;

-- Tidy display names
UPDATE public.image_models SET display_name = 'FLUX.2 Max'        WHERE slug = 'flux-2-max';
UPDATE public.image_models SET display_name = 'FLUX.2 Pro'        WHERE slug = 'flux-2-pro';
UPDATE public.image_models SET display_name = 'FLUX Kontext Max'  WHERE slug = 'flux-kontext-max';
UPDATE public.image_models SET display_name = 'FLUX Kontext Pro'  WHERE slug = 'flux-kontext-pro';