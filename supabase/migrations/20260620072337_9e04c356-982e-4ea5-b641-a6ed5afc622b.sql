CREATE TABLE IF NOT EXISTS public.e2b_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  api_key text NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'active',
  failure_count integer NOT NULL DEFAULT 0,
  notes text,
  last_error text,
  last_used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.e2b_keys TO authenticated;
GRANT ALL ON public.e2b_keys TO service_role;

ALTER TABLE public.e2b_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage e2b keys"
ON public.e2b_keys
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_e2b_keys_updated_at
BEFORE UPDATE ON public.e2b_keys
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();