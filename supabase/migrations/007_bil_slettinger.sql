CREATE TABLE IF NOT EXISTS public.bil_slettinger (
  id BIGSERIAL PRIMARY KEY,
  bil_id BIGINT,
  reg TEXT NOT NULL,
  merke TEXT DEFAULT '',
  modell TEXT DEFAULT '',
  status TEXT DEFAULT '',
  slettet_av_id BIGINT,
  slettet_av_navn TEXT NOT NULL,
  slettet_av_rolle TEXT DEFAULT '',
  slettet_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bil_slettinger_at ON public.bil_slettinger (slettet_at DESC);
