CREATE TABLE IF NOT EXISTS public.innkjopskalkyle (
  id BIGSERIAL PRIMARY KEY,
  auksjon TEXT NOT NULL DEFAULT '',
  auksjonsslutt TIMESTAMPTZ,
  partinummer TEXT NOT NULL DEFAULT '',
  regnr TEXT NOT NULL DEFAULT '',
  kmstand INTEGER NOT NULL DEFAULT 0,
  modell TEXT NOT NULL DEFAULT '',
  utstyrsnivaa TEXT NOT NULL DEFAULT '',
  utsalgspris INTEGER NOT NULL DEFAULT 0,
  pakost INTEGER NOT NULL DEFAULT 0,
  auk_gebyr INTEGER NOT NULL DEFAULT 0,
  garantikost INTEGER NOT NULL DEFAULT 0,
  omreg_avgift INTEGER NOT NULL DEFAULT 0,
  avanse INTEGER NOT NULL DEFAULT 0,
  innkjopspris INTEGER NOT NULL DEFAULT 0,
  kommentarer TEXT NOT NULL DEFAULT '',
  created_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_innkjopskalkyle_auksjon ON public.innkjopskalkyle (auksjon);
CREATE INDEX IF NOT EXISTS idx_innkjopskalkyle_auksjonsslutt ON public.innkjopskalkyle (auksjonsslutt);
CREATE INDEX IF NOT EXISTS idx_innkjopskalkyle_regnr ON public.innkjopskalkyle (regnr);
