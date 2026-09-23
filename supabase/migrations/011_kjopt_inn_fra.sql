ALTER TABLE public.biler ADD COLUMN IF NOT EXISTS kjopt_inn_fra TEXT DEFAULT '';

INSERT INTO public.innstillinger (key, value)
VALUES ('innkjopskilder', '["Rebil","AYVENS","BCA","DNB","Autoringen","Nettbil","Autoproff","Drivalia","Auksjonen.no","Stadssalg","FINN.no","Privat/Annet"]'::jsonb)
ON CONFLICT (key) DO NOTHING;
