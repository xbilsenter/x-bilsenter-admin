ALTER TABLE public.users ADD COLUMN IF NOT EXISTS daglig_overtid_min INTEGER NOT NULL DEFAULT 540;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS ukentlig_overtid_min INTEGER NOT NULL DEFAULT 2400;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS uke_start TEXT NOT NULL DEFAULT 'monday';

ALTER TABLE public.timeregistrering ADD COLUMN IF NOT EXISTS worked_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.timeregistrering ADD COLUMN IF NOT EXISTS daily_overtime_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.timeregistrering ADD COLUMN IF NOT EXISTS weekly_overtime_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.timeregistrering ADD COLUMN IF NOT EXISTS total_overtime_minutes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.timeregistrering ADD COLUMN IF NOT EXISTS overtime_amount_ore INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.timeregistrering ADD COLUMN IF NOT EXISTS ordinary_amount_ore INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.timeregistrering ADD COLUMN IF NOT EXISTS daily_threshold_minutes INTEGER NOT NULL DEFAULT 540;
ALTER TABLE public.timeregistrering ADD COLUMN IF NOT EXISTS weekly_threshold_minutes INTEGER NOT NULL DEFAULT 2400;
ALTER TABLE public.timeregistrering ADD COLUMN IF NOT EXISTS uke_start TEXT NOT NULL DEFAULT 'monday';
