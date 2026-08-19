-- Bruktimport ja/nei på innbytte og oppkjøp

ALTER TABLE public.innbytte ADD COLUMN IF NOT EXISTS bruktimport TEXT DEFAULT '';
ALTER TABLE public.selg_bil ADD COLUMN IF NOT EXISTS bruktimport TEXT DEFAULT '';
