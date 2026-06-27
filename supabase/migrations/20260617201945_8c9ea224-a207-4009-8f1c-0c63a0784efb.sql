
-- =============== VIDEO MODELS ===============
-- Premium video brands actually run on Alibaba HappyHorse / Wan pipelines.

UPDATE public.video_models SET description = 'Cinematic text-to-video, 16:9 · 9:16 · 1:1, up to 1080p, 5–8s, native audio. Powered by the HappyHorse T2V pipeline on Alibaba DashScope.' WHERE slug = 'veo-3';
UPDATE public.video_models SET description = 'Video editing & text-to-video, up to 1080p, 5–10s. Powered by the HappyHorse Video-Edit pipeline (Alibaba).' WHERE slug = 'runway-gen-4-5';
UPDATE public.video_models SET description = 'Cinematic text-to-video, up to 1080p, 5–10s, native audio. Powered by the HappyHorse T2V pipeline (Alibaba).' WHERE slug = 'kling-3-t2v';
UPDATE public.video_models SET description = 'Image-to-video from a single frame, up to 1080p, 5–10s. Powered by the HappyHorse I2V pipeline (Alibaba).' WHERE slug = 'kling-3-i2v';
UPDATE public.video_models SET description = 'T2V with native multilingual audio, up to 1080p, 5–10s. Powered by the HappyHorse T2V pipeline (Alibaba).' WHERE slug = 'seedance-2';
UPDATE public.video_models SET description = 'Smooth cinematic image-to-video, up to 1080p, 5–9s. Powered by the HappyHorse I2V pipeline (Alibaba).' WHERE slug = 'luma-ray-3';
UPDATE public.video_models SET description = 'Cinematic text-to-video with native audio, up to 1080p, 5–10s. Powered by the HappyHorse T2V pipeline (Alibaba).' WHERE slug = 'sora-2';
UPDATE public.video_models SET description = 'Stylized text-to-video, 720p, 5s. Powered by the Wan 2.7 T2V pipeline (Alibaba).' WHERE slug = 'pika-2-5';
UPDATE public.video_models SET description = 'Affordable text-to-video, 720p, 5–8s. Powered by the Wan 2.7 T2V pipeline (Alibaba).' WHERE slug = 'pixverse-6';
UPDATE public.video_models SET description = 'Realistic image-to-video, up to 1080p, 6–10s. Powered by the Wan 2.7 I2V pipeline (Alibaba).' WHERE slug = 'hailuo-2-3';
UPDATE public.video_models SET description = 'Video editing & generation, 1080p, 5s. Powered by the HappyHorse Video-Edit pipeline (Alibaba).' WHERE slug = 'firefly-video';
UPDATE public.video_models SET description = 'Text-to-video, up to 1080p, 5–8s. Powered by the HappyHorse T2V pipeline (Alibaba).' WHERE slug = 'grok-video';
UPDATE public.video_models SET description = 'Text-to-video, up to 1080p, 5–8s. Powered by the HappyHorse T2V pipeline (Alibaba).' WHERE slug = 'gemini-video';

-- Native HappyHorse / Wan slugs — keep the brand name explicit.
UPDATE public.video_models SET description = 'Reference-to-Video with up to 9 reference images. 16:9 · 9:16 · 1:1, up to 1080p, 5/8/10/15s. Direct HappyHorse R2V on Alibaba DashScope.' WHERE slug = 'happyhorse-r2v';
UPDATE public.video_models SET description = 'Image-to-Video with first frame + cinematic camera control. Up to 1080p, default 8s. Direct HappyHorse I2V on Alibaba DashScope.' WHERE slug = 'happyhorse-i2v';
UPDATE public.video_models SET description = 'Text-to-Video, 1080p with camera control, default 8s. Direct HappyHorse T2V on Alibaba DashScope.' WHERE slug = 'happyhorse-t2v';
UPDATE public.video_models SET description = 'Video editing with up to 5 reference images. 1080p, 5s. Direct HappyHorse Video-Edit on Alibaba DashScope.' WHERE slug = 'happyhorse-videoedit';

UPDATE public.video_models SET description = 'Flagship multi-shot T2V with native audio, up to 1080p, default 8s. Direct Wan 2.7 T2V on Alibaba DashScope.' WHERE slug = 'wan-2-7-t2v';
UPDATE public.video_models SET description = 'Flagship I2V with first + last frame, lipsync, multi-ref up to 5. Up to 1080p, 8s, audio. Direct Wan 2.7 I2V on Alibaba DashScope.' WHERE slug = 'wan-2-7-i2v';
UPDATE public.video_models SET description = 'Local video editing — outfit / background / object swap. 1080p, 5s, audio. Direct Wan 2.7 VideoEdit on Alibaba DashScope.' WHERE slug = 'wan-2-7-videoedit';
UPDATE public.video_models SET description = 'Video repaint, local edit, extension and frame expansion. 1080p, 5s, up to 5 references. Direct Wan 2.1 VACE-Plus on Alibaba DashScope.' WHERE slug = 'wan-2-1-vace-plus';

UPDATE public.video_models SET description = 'Text-to-Video, 1080p, 5s, native audio. Wan 2.5 family — routes to Wan 2.7 T2V on Alibaba DashScope.' WHERE slug = 'wan-2-5-t2v';
UPDATE public.video_models SET description = 'T2V Plus, 1080p, 5s. Wan 2.2 family — routes to Wan 2.7 T2V on Alibaba DashScope.' WHERE slug = 'wan-2-2-t2v-plus';
UPDATE public.video_models SET description = 'I2V Plus, 1080p, 5s. Wan 2.2 family — routes to Wan 2.7 I2V on Alibaba DashScope.' WHERE slug = 'wan-2-2-i2v-plus';
UPDATE public.video_models SET description = 'Turbo text-to-video, 720p, 5s. Wanx 2.1 backup — routes to Wan 2.7 T2V on Alibaba DashScope.' WHERE slug = 'wanx-2-1-t2v-turbo';
UPDATE public.video_models SET description = 'Plus text-to-video, 720p, 5s. Wanx 2.1 backup — routes to Wan 2.7 T2V on Alibaba DashScope.' WHERE slug = 'wanx-2-1-t2v-plus';
UPDATE public.video_models SET description = 'Turbo image-to-video, 720p, 5s. Wanx 2.1 backup — routes to Wan 2.7 I2V on Alibaba DashScope.' WHERE slug = 'wanx-2-1-i2v-turbo';
UPDATE public.video_models SET description = 'Plus image-to-video, 720p, 5s. Wanx 2.1 backup — routes to Wan 2.7 I2V on Alibaba DashScope.' WHERE slug = 'wanx-2-1-i2v-plus';
UPDATE public.video_models SET description = 'Keyframe-to-Video Plus, 720p, 5s. Wanx 2.1 backup — routes to Wan 2.7 I2V on Alibaba DashScope.' WHERE slug = 'wanx-2-1-kf2v-plus';

-- =============== IMAGE MODELS ===============
-- Premium image brands run on Vercel AI Gateway; Alibaba Wan/Wanx run on Alibaba.

UPDATE public.image_models SET description = 'FLUX.2 image generation, 1:1 · 3:2 · 2:3 · 16:9 · 9:16, 1K. Routes to FLUX.2 Pro on Vercel AI Gateway.' WHERE slug = 'flux-2-dev';
UPDATE public.image_models SET description = 'FLUX.2 flexible aspect generation, 1K. Routes to FLUX.2 Pro on Vercel AI Gateway.' WHERE slug = 'flux-2-flex';
UPDATE public.image_models SET description = 'Commercial-grade FLUX.2 Pro, 1K, up to 4 inputs for editing. Powered by Vercel AI Gateway (BFL).' WHERE slug = 'flux-2-pro';
UPDATE public.image_models SET description = 'Smart context-aware editing with up to 4 inputs, 1K. Powered by Vercel AI Gateway (BFL FLUX Kontext Max).' WHERE slug = 'flux-kontext-max';
UPDATE public.image_models SET description = 'Context-aware editing with up to 4 inputs, 1K. Powered by Vercel AI Gateway (BFL FLUX Kontext Pro).' WHERE slug = 'flux-kontext-pro';
UPDATE public.image_models SET description = 'OpenAI native editing & inpainting, 1K. Routes to GPT Image 2 on Vercel AI Gateway.' WHERE slug = 'gpt-image-1';
UPDATE public.image_models SET description = 'OpenAI native editing & inpainting, 1K. Routes to GPT Image 2 on Vercel AI Gateway.' WHERE slug = 'gpt-image-1-5';
UPDATE public.image_models SET description = 'Flagship OpenAI image generation & editing, 1K, up to 4 inputs. Powered by Vercel AI Gateway.' WHERE slug = 'gpt-image-2';
UPDATE public.image_models SET description = 'Typography & style/pose/object editing. Routes to Qwen-Image 2.0 on Alibaba DashScope.' WHERE slug = 'qwen-image';
UPDATE public.image_models SET description = 'Original Nano Banana image generation. Routes to Nano Banana 2 (Gemini 3.1 Flash Image) on Vercel AI Gateway.' WHERE slug = 'gemini-2-5-flash-image';
UPDATE public.image_models SET description = 'High-res reasoning image generation. Powered by Vercel AI Gateway (Google Gemini 3 Pro Image).' WHERE slug = 'gemini-3-pro-image';
UPDATE public.image_models SET description = 'Fast Gemini image generation & editing, 1K, up to 4 inputs. Powered by Vercel AI Gateway (Nano Banana 2).' WHERE slug = 'gemini-3-1-flash-image';

UPDATE public.image_models SET description = 'Text-to-image, 1:1 · 16:9 · 9:16 · 4:3 · 3:4, up to 1280×720. Wan 2.5 backup — routes to Wan 2.7 Image on Alibaba DashScope.' WHERE slug = 'wan-2-5-t2i';
UPDATE public.image_models SET description = 'Plus tier text-to-image, up to 1280×720. Wanx 2.1 backup — routes to Wan 2.7 Image Pro on Alibaba DashScope.' WHERE slug = 'wanx-2-1-t2i-plus';
UPDATE public.image_models SET description = 'Turbo text-to-image, up to 1280×720. Wanx 2.1 backup — routes to Wan 2.7 Image on Alibaba DashScope.' WHERE slug = 'wanx-2-1-t2i-turbo';
UPDATE public.image_models SET description = 'Lightweight text-to-image, up to 1280×720. Wanx 2.0 backup — routes to Wan 2.7 Image on Alibaba DashScope.' WHERE slug = 'wanx-2-0-t2i-turbo';
