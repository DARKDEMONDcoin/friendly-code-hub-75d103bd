ALTER TABLE public.generated_sites ADD COLUMN IF NOT EXISTS progress integer NOT NULL DEFAULT 0;
ALTER TABLE public.generated_sites ADD COLUMN IF NOT EXISTS tasks jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.generated_sites REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.generated_sites;