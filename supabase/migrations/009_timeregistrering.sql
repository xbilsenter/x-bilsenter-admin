CREATE TABLE IF NOT EXISTS public.timeregistrering (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  bruker_navn TEXT NOT NULL DEFAULT '',
  dato TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'fullfort',
  start_tid TEXT NOT NULL DEFAULT '',
  slutt_tid TEXT DEFAULT '',
  pauser JSONB NOT NULL DEFAULT '[]'::jsonb,
  notat TEXT DEFAULT '',
  timelonn INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_timeregistrering_user_dato ON public.timeregistrering (user_id, dato DESC);
CREATE INDEX IF NOT EXISTS idx_timeregistrering_dato ON public.timeregistrering (dato DESC);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS timelonn INTEGER NOT NULL DEFAULT 0;
