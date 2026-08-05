-- Utvidelser etter 001 – kjør ETTER 001_initial_schema.sql
-- Trygg å kjøre på nytt (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS public.kunder (
  id BIGSERIAL PRIMARY KEY,
  navn TEXT NOT NULL,
  epost TEXT NOT NULL DEFAULT '',
  tlf TEXT DEFAULT '',
  adresse TEXT DEFAULT '',
  postnr TEXT DEFAULT '',
  poststed TEXT DEFAULT '',
  organisasjonsnummer TEXT DEFAULT '',
  type TEXT NOT NULL DEFAULT 'Privat',
  notater TEXT DEFAULT '',
  kilde TEXT NOT NULL DEFAULT 'Manuell',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kunder_epost ON public.kunder (epost);

CREATE TABLE IF NOT EXISTS public.bil_kunder (
  bil_id BIGINT NOT NULL REFERENCES public.biler(id) ON DELETE CASCADE,
  kunde_id BIGINT NOT NULL REFERENCES public.kunder(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (bil_id, kunde_id)
);

CREATE INDEX IF NOT EXISTS idx_bil_kunder_kunde ON public.bil_kunder (kunde_id);

ALTER TABLE public.henvendelser ADD COLUMN IF NOT EXISTS kunde_id BIGINT REFERENCES public.kunder(id) ON DELETE SET NULL;
ALTER TABLE public.innbytte ADD COLUMN IF NOT EXISTS kunde_id BIGINT REFERENCES public.kunder(id) ON DELETE SET NULL;
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS kunde_id BIGINT REFERENCES public.kunder(id) ON DELETE SET NULL;
ALTER TABLE public.kalender ADD COLUMN IF NOT EXISTS kunde_id BIGINT REFERENCES public.kunder(id) ON DELETE SET NULL;
ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS kunde_id BIGINT REFERENCES public.kunder(id) ON DELETE SET NULL;

ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT '';
ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS ansvarlig TEXT NOT NULL DEFAULT '';

ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS sjekklister JSONB DEFAULT NULL;
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS archived_at TEXT DEFAULT NULL;
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
