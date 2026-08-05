ALTER TABLE public.innkjopskalkyle
  ADD COLUMN IF NOT EXISTS autosys_data JSONB;
