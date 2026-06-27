ALTER TABLE public.alibaba_keys ADD COLUMN IF NOT EXISTS endpoint_host text;
ALTER TABLE public.media_provider_keys ADD COLUMN IF NOT EXISTS endpoint_host text;