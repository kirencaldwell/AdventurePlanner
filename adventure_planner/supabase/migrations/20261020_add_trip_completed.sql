ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS completed boolean NOT NULL DEFAULT false;

-- Trips that already have a Strava post in the debrief count as completed.
UPDATE public.trips
SET completed = true
WHERE completed = false
  AND debrief_strava_embeds IS NOT NULL
  AND debrief_strava_embeds::text NOT IN ('[]', '{}', 'null');
