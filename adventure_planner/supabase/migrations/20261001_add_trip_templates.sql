ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;