-- Utvid innbytte/selg_bil med Vegvesen-felter for intern visning ved mottak

ALTER TABLE public.innbytte ADD COLUMN IF NOT EXISTS effekt_kw TEXT DEFAULT '';
ALTER TABLE public.innbytte ADD COLUMN IF NOT EXISTS forstegangsregistrert TEXT DEFAULT '';
ALTER TABLE public.innbytte ADD COLUMN IF NOT EXISTS antall_motorer TEXT DEFAULT '';
ALTER TABLE public.innbytte ADD COLUMN IF NOT EXISTS rekkevidde TEXT DEFAULT '';
ALTER TABLE public.innbytte ADD COLUMN IF NOT EXISTS motorer JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.selg_bil ADD COLUMN IF NOT EXISTS effekt_kw TEXT DEFAULT '';
ALTER TABLE public.selg_bil ADD COLUMN IF NOT EXISTS forstegangsregistrert TEXT DEFAULT '';
ALTER TABLE public.selg_bil ADD COLUMN IF NOT EXISTS antall_motorer TEXT DEFAULT '';
ALTER TABLE public.selg_bil ADD COLUMN IF NOT EXISTS rekkevidde TEXT DEFAULT '';
ALTER TABLE public.selg_bil ADD COLUMN IF NOT EXISTS motorer JSONB NOT NULL DEFAULT '[]'::jsonb;
