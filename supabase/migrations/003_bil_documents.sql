-- Utvidet bilinformasjon: dokumenter, kommentarer og ekstra felter

ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS finn_kode TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS chassisnr TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS drivstoff TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS girkasse TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS utstyr TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS intern_info TEXT DEFAULT '';
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS kommentarer JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS dokumenter JSONB NOT NULL DEFAULT '[]'::jsonb;
