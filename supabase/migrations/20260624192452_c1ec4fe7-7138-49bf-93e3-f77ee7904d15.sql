ALTER TABLE public.generated_sites
  ADD COLUMN IF NOT EXISTS files jsonb,
  ADD COLUMN IF NOT EXISTS published_url text;

-- Make sure realtime delivers UPDATEs with old+new values for the file/progress UI.
ALTER TABLE public.generated_sites REPLICA IDENTITY FULL;

-- Add to realtime publication (no-op if already present).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'generated_sites'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.generated_sites';
  END IF;
END $$;