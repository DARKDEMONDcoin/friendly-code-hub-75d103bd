
CREATE TABLE IF NOT EXISTS public.runbase_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text NOT NULL UNIQUE,
  label text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','exhausted')),
  balance_usd numeric NOT NULL DEFAULT 0,
  spent_usd numeric NOT NULL DEFAULT 0,
  failure_count integer NOT NULL DEFAULT 0,
  blocked_reason text,
  last_used_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.runbase_keys TO service_role;

ALTER TABLE public.runbase_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service role only" ON public.runbase_keys
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_runbase_keys_status_last_used
  ON public.runbase_keys (status, last_used_at NULLS FIRST);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS update_runbase_keys_updated_at ON public.runbase_keys;
CREATE TRIGGER update_runbase_keys_updated_at
  BEFORE UPDATE ON public.runbase_keys
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
