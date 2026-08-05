-- Selg bil / direkte oppkjøp (skjema fra xbilsenter.no/selg-bil)
-- Kjør ETTER 002_schema_extensions.sql (krever public.kunder)
-- Trygg å kjøre på nytt (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS public.selg_bil (
  id BIGSERIAL PRIMARY KEY,
  navn TEXT NOT NULL,
  epost TEXT NOT NULL,
  tlf TEXT NOT NULL,
  regnr TEXT NOT NULL,
  merke TEXT DEFAULT '',
  modell TEXT DEFAULT '',
  arsmodell TEXT DEFAULT '',
  drivstoff TEXT DEFAULT '',
  farge TEXT DEFAULT '',
  kjoretoy_type TEXT DEFAULT '',
  hjuldrift TEXT DEFAULT '',
  effekt_hk TEXT DEFAULT '',
  siste_eu_kontroll TEXT DEFAULT '',
  neste_eu_kontroll TEXT DEFAULT '',
  kilometerstand TEXT DEFAULT '',
  servicehistorikk TEXT DEFAULT '',
  siste_service TEXT DEFAULT '',
  utstyr JSONB NOT NULL DEFAULT '[]'::jsonb,
  sommerdekk TEXT DEFAULT '',
  vinterdekk TEXT DEFAULT '',
  forventning TEXT DEFAULT '',
  kommentar TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Ny',
  ansvarlig TEXT DEFAULT '',
  tilbud TEXT DEFAULT '',
  kommentarer JSONB NOT NULL DEFAULT '[]'::jsonb,
  bilder JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.selg_bil ADD COLUMN IF NOT EXISTS kunde_id BIGINT REFERENCES public.kunder(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_selg_bil_status ON public.selg_bil (status);
CREATE INDEX IF NOT EXISTS idx_selg_bil_kunde ON public.selg_bil (kunde_id);

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
