-- Chassis fra ønsket FINN-annonse, brukes til kobling mot bilkort
ALTER TABLE public.innbytte ADD COLUMN IF NOT EXISTS onsket_bil_chassis TEXT DEFAULT '';
