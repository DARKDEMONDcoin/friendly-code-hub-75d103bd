
CREATE TABLE public.i18n_translations (
  entry_key TEXT NOT NULL,
  language TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  translated_value JSONB NOT NULL,
  source_value JSONB,
  namespace TEXT NOT NULL DEFAULT 'docs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_key, language)
);

CREATE INDEX idx_i18n_translations_namespace ON public.i18n_translations(namespace);
CREATE INDEX idx_i18n_translations_lang ON public.i18n_translations(language);

GRANT SELECT ON public.i18n_translations TO anon;
GRANT SELECT ON public.i18n_translations TO authenticated;
GRANT ALL ON public.i18n_translations TO service_role;

ALTER TABLE public.i18n_translations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read translations"
  ON public.i18n_translations FOR SELECT
  USING (true);

CREATE TABLE public.i18n_sync_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  namespace TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'cron',
  entries_scanned INTEGER NOT NULL DEFAULT 0,
  entries_translated INTEGER NOT NULL DEFAULT 0,
  entries_skipped INTEGER NOT NULL DEFAULT 0,
  errors JSONB,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

GRANT SELECT ON public.i18n_sync_runs TO authenticated;
GRANT ALL ON public.i18n_sync_runs TO service_role;

ALTER TABLE public.i18n_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read sync runs"
  ON public.i18n_sync_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.touch_i18n_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_i18n_translations_touch
  BEFORE UPDATE ON public.i18n_translations
  FOR EACH ROW EXECUTE FUNCTION public.touch_i18n_updated_at();
