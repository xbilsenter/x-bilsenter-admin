-- X Bilsenter CRM – PostgreSQL schema for Supabase
-- Kjør i Supabase Dashboard → SQL Editor (eller via supabase CLI)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Brukere ───
CREATE TABLE IF NOT EXISTS users (
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

CREATE INDEX IF NOT EXISTS users_username_lower_idx ON users (LOWER(username));

-- ─── Innstillinger (key-value) ───
CREATE TABLE IF NOT EXISTS innstillinger (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Mailkontoer ───
CREATE TABLE IF NOT EXISTS mail_kontoer (
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

-- ─── CRM-data ───
CREATE TABLE IF NOT EXISTS henvendelser (
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

CREATE TABLE IF NOT EXISTS innbytte (
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

CREATE TABLE IF NOT EXISTS biler (
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

CREATE TABLE IF NOT EXISTS kalender (
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

CREATE TABLE IF NOT EXISTS eposter (
  id BIGSERIAL PRIMARY KEY,
  konto_id BIGINT REFERENCES mail_kontoer(id) ON DELETE SET NULL,
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
  henvendelse_id BIGINT REFERENCES henvendelser(id) ON DELETE SET NULL,
  mottatt_dato TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (konto_id, message_id)
);

CREATE TABLE IF NOT EXISTS epost_utkast (
  id BIGSERIAL PRIMARY KEY,
  konto_id BIGINT REFERENCES mail_kontoer(id) ON DELETE SET NULL,
  til TEXT DEFAULT '',
  kopi TEXT DEFAULT '',
  blindkopi TEXT DEFAULT '',
  emne TEXT DEFAULT '',
  innhold_html TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS epost_maler (
  id BIGSERIAL PRIMARY KEY,
  navn TEXT NOT NULL,
  emne TEXT DEFAULT '',
  innhold_html TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sekvenser – sett til max(id) etter import fra SQLite
SELECT setval(pg_get_serial_sequence('users', 'id'), COALESCE((SELECT MAX(id) FROM users), 1), (SELECT COUNT(*) > 0 FROM users));
