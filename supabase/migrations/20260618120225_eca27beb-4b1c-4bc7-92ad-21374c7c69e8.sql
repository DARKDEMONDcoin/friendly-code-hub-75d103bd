CREATE TABLE public.telegram_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  file_id text NOT NULL,
  file_unique_id text,
  kind text NOT NULL CHECK (kind IN ('photo','video','document','audio','voice','animation')),
  mime_type text,
  size_bytes bigint,
  width int,
  height int,
  duration int,
  thumbnail_file_id text,
  cached_url text,
  cached_until timestamptz,
  storage_provider text NOT NULL DEFAULT 'telegram' CHECK (storage_provider IN ('telegram','supabase')),
  fallback_path text,
  original_filename text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_media_user_id ON public.telegram_media(user_id);
CREATE INDEX idx_telegram_media_file_unique_id ON public.telegram_media(file_unique_id);
CREATE INDEX idx_telegram_media_created_at ON public.telegram_media(created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_media TO authenticated;
GRANT ALL ON public.telegram_media TO service_role;

ALTER TABLE public.telegram_media ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own media"
  ON public.telegram_media FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own media"
  ON public.telegram_media FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own media"
  ON public.telegram_media FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own media"
  ON public.telegram_media FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.update_telegram_media_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_telegram_media_updated_at
BEFORE UPDATE ON public.telegram_media
FOR EACH ROW
EXECUTE FUNCTION public.update_telegram_media_updated_at();