-- ═══════════════════════════════════════════════════════════════
-- X Bilsenter CRM – KOMPLETT SKJEMA (kjør denne filen alene)
-- Supabase Dashboard → SQL Editor → lim inn → Run
-- ═══════════════════════════════════════════════════════════════

-- ─── 001: Grunn-tabeller ───

CREATE TABLE IF NOT EXISTS public.users (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT DEFAULT '',
  role TEXT NOT NULL DEFAULT 'Selger',
  permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_username_lower_idx ON public.users (LOWER(username));

CREATE TABLE IF NOT EXISTS public.innstillinger (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.mail_kontoer (
  id BIGSERIAL PRIMARY KEY,
  navn TEXT NOT NULL,
  epost TEXT NOT NULL,
  imap_host TEXT NOT NULL DEFAULT '',
  imap_port INTEGER NOT NULL DEFAULT 993,
  imap_secure BOOLEAN NOT NULL DEFAULT TRUE,
  imap_user TEXT NOT NULL DEFAULT '',
  imap_pass TEXT NOT NULL DEFAULT '',
  smtp_host TEXT NOT NULL DEFAULT '',
  smtp_port INTEGER NOT NULL DEFAULT 587,
  smtp_secure BOOLEAN NOT NULL DEFAULT FALSE,
  smtp_user TEXT NOT NULL DEFAULT '',
  smtp_pass TEXT NOT NULL DEFAULT '',
  from_name TEXT DEFAULT 'X Bilsenter AS',
  signatur TEXT DEFAULT '',
  aktiv BOOLEAN NOT NULL DEFAULT TRUE,
  standard BOOLEAN NOT NULL DEFAULT FALSE,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.henvendelser (
  id BIGSERIAL PRIMARY KEY,
  navn TEXT NOT NULL,
  epost TEXT NOT NULL,
  tlf TEXT DEFAULT '',
  emne TEXT NOT NULL,
  melding TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Ny',
  ansvarlig TEXT DEFAULT '',
  svar TEXT DEFAULT '',
  kommentarer JSONB NOT NULL DEFAULT '[]'::jsonb,
  kilde TEXT NOT NULL DEFAULT 'Nettside',
  bil_ref TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.innbytte (
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
  finn_kode TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Ny',
  ansvarlig TEXT DEFAULT '',
  tilbud TEXT DEFAULT '',
  kommentarer JSONB NOT NULL DEFAULT '[]'::jsonb,
  bilder JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.biler (
  id BIGSERIAL PRIMARY KEY,
  reg TEXT NOT NULL,
  merke TEXT NOT NULL,
  modell TEXT NOT NULL,
  aar INTEGER NOT NULL DEFAULT 0,
  km INTEGER NOT NULL DEFAULT 0,
  innkjop INTEGER NOT NULL DEFAULT 0,
  salg INTEGER NOT NULL DEFAULT 0,
  farge TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Innkjøpt',
  ansvarlig TEXT DEFAULT '',
  frist TEXT DEFAULT '',
  notater TEXT DEFAULT '',
  eu_kontroll TEXT DEFAULT '',
  forsikring TEXT DEFAULT '',
  sjekkliste JSONB NOT NULL DEFAULT '[]'::jsonb,
  logg JSONB NOT NULL DEFAULT '[]'::jsonb,
  svv_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kalender (
  id BIGSERIAL PRIMARY KEY,
  tittel TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'Annet',
  dato TEXT NOT NULL,
  tid TEXT NOT NULL DEFAULT '10:00',
  tid_slutt TEXT DEFAULT '',
  ansvarlig TEXT DEFAULT '',
  bil_ref TEXT DEFAULT '',
  notat TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.eposter (
  id BIGSERIAL PRIMARY KEY,
  konto_id BIGINT REFERENCES public.mail_kontoer(id) ON DELETE SET NULL,
  message_id TEXT NOT NULL,
  thread_id TEXT DEFAULT '',
  in_reply_to TEXT DEFAULT '',
  retning TEXT NOT NULL DEFAULT 'inn',
  fra_navn TEXT DEFAULT '',
  fra_epost TEXT NOT NULL DEFAULT '',
  til_epost TEXT DEFAULT '',
  emne TEXT NOT NULL DEFAULT '',
  innhold TEXT DEFAULT '',
  innhold_html TEXT DEFAULT '',
  lest BOOLEAN NOT NULL DEFAULT FALSE,
  henvendelse_id BIGINT REFERENCES public.henvendelser(id) ON DELETE SET NULL,
  mottatt_dato TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (konto_id, message_id)
);

CREATE TABLE IF NOT EXISTS public.epost_utkast (
  id BIGSERIAL PRIMARY KEY,
  konto_id BIGINT REFERENCES public.mail_kontoer(id) ON DELETE SET NULL,
  til TEXT DEFAULT '',
  kopi TEXT DEFAULT '',
  blindkopi TEXT DEFAULT '',
  emne TEXT DEFAULT '',
  innhold_html TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.epost_maler (
  id BIGSERIAL PRIMARY KEY,
  navn TEXT NOT NULL,
  emne TEXT DEFAULT '',
  innhold_html TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── 002: Kunder, bil_kunder, ekstra kolonner ───

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
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS finn_kode TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS chassisnr TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS drivstoff TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS girkasse TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS utstyr TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS intern_info TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS kommentarer JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS dokumenter JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─── 004: Selg bil (oppkjøp) ───

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

-- ─── Tilganger + verifisering ───

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;

SELECT tablename
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'users', 'innstillinger', 'mail_kontoer', 'henvendelser', 'innbytte', 'selg_bil',
    'biler', 'kalender', 'eposter', 'epost_utkast', 'epost_maler',
    'kunder', 'bil_kunder'
  )
ORDER BY tablename;
