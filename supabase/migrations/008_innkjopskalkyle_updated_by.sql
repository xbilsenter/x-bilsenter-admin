ALTER TABLE public.innkjopskalkyle
  ADD COLUMN IF NOT EXISTS updated_by BIGINT REFERENCES public.users(id) ON DELETE SET NULL;
