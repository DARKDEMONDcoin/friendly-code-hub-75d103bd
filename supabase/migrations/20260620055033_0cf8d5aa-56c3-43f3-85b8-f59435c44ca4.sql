-- Add workspace_id column to alibaba_keys, auto-populated from sk-ws-* keys.
ALTER TABLE public.alibaba_keys
  ADD COLUMN IF NOT EXISTS workspace_id TEXT;

CREATE OR REPLACE FUNCTION public.alibaba_keys_extract_workspace_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- For sk-ws-* keys, the workspace id is the segment after "sk-ws-" up to the first dot.
  IF NEW.api_key IS NOT NULL AND NEW.api_key LIKE 'sk-ws-%' THEN
    NEW.workspace_id := split_part(substring(NEW.api_key from 7), '.', 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_alibaba_keys_workspace_id ON public.alibaba_keys;
CREATE TRIGGER trg_alibaba_keys_workspace_id
  BEFORE INSERT OR UPDATE OF api_key ON public.alibaba_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.alibaba_keys_extract_workspace_id();

-- Backfill existing rows.
UPDATE public.alibaba_keys
SET workspace_id = split_part(substring(api_key from 7), '.', 1)
WHERE api_key LIKE 'sk-ws-%' AND workspace_id IS NULL;