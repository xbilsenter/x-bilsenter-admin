-- Fase 1: IMAP-mapper, vedlegg og utvidede e-postfelter
-- Trygg å kjøre på nytt (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS public.mail_mapper (
  id BIGSERIAL PRIMARY KEY,
  konto_id BIGINT NOT NULL REFERENCES public.mail_kontoer(id) ON DELETE CASCADE,
  imap_path TEXT NOT NULL,
  navn TEXT NOT NULL,
  mappe_type TEXT NOT NULL DEFAULT 'custom',
  parent_id BIGINT REFERENCES public.mail_mapper(id) ON DELETE SET NULL,
  sync_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  unread_count INTEGER NOT NULL DEFAULT 0,
  total_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (konto_id, imap_path)
);

CREATE INDEX IF NOT EXISTS idx_mail_mapper_konto ON public.mail_mapper (konto_id);
CREATE INDEX IF NOT EXISTS idx_mail_mapper_type ON public.mail_mapper (konto_id, mappe_type);

ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS mappe_id BIGINT REFERENCES public.mail_mapper(id) ON DELETE SET NULL;
ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS imap_uid BIGINT;
ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS flagged BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.eposter ADD COLUMN IF NOT EXISTS slettet BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_eposter_mappe ON public.eposter (mappe_id, mottatt_dato DESC);
CREATE INDEX IF NOT EXISTS idx_eposter_thread ON public.eposter (konto_id, thread_id);
CREATE INDEX IF NOT EXISTS idx_eposter_uid ON public.eposter (konto_id, mappe_id, imap_uid);

CREATE TABLE IF NOT EXISTS public.epost_vedlegg (
  id BIGSERIAL PRIMARY KEY,
  epost_id BIGINT NOT NULL REFERENCES public.eposter(id) ON DELETE CASCADE,
  filnavn TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  size_bytes BIGINT NOT NULL DEFAULT 0,
  lagring_path TEXT NOT NULL,
  content_id TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_epost_vedlegg_epost ON public.epost_vedlegg (epost_id);

GRANT ALL ON ALL TABLES IN SCHEMA public TO postgres, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO postgres, service_role;
