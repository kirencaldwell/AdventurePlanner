CREATE TABLE IF NOT EXISTS public.ask_rate_limits (
  rate_key text PRIMARY KEY,
  minute_bucket timestamptz NOT NULL,
  minute_count integer NOT NULL DEFAULT 0,
  day_bucket date NOT NULL,
  day_count integer NOT NULL DEFAULT 0
);

ALTER TABLE public.ask_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ask_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.consume_ask_rate_limit(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  user_allowed boolean;
  project_allowed boolean;
  current_minute timestamptz := date_trunc('minute', now());
  current_day date := current_date;
BEGIN
  INSERT INTO public.ask_rate_limits (rate_key, minute_bucket, minute_count, day_bucket, day_count)
  VALUES ('user:' || p_user_id::text, current_minute, 1, current_day, 1)
  ON CONFLICT (rate_key) DO UPDATE SET
    minute_count = CASE
      WHEN public.ask_rate_limits.minute_bucket = current_minute THEN public.ask_rate_limits.minute_count + 1
      ELSE 1
    END,
    minute_bucket = current_minute,
    day_count = CASE
      WHEN public.ask_rate_limits.day_bucket = current_day THEN public.ask_rate_limits.day_count + 1
      ELSE 1
    END,
    day_bucket = current_day
  RETURNING minute_count <= 5 AND day_count <= 50 INTO user_allowed;

  INSERT INTO public.ask_rate_limits (rate_key, minute_bucket, minute_count, day_bucket, day_count)
  VALUES ('global', current_minute, 1, current_day, 1)
  ON CONFLICT (rate_key) DO UPDATE SET
    minute_count = CASE
      WHEN public.ask_rate_limits.minute_bucket = current_minute THEN public.ask_rate_limits.minute_count + 1
      ELSE 1
    END,
    minute_bucket = current_minute,
    day_count = CASE
      WHEN public.ask_rate_limits.day_bucket = current_day THEN public.ask_rate_limits.day_count + 1
      ELSE 1
    END,
    day_bucket = current_day
  RETURNING minute_count <= 15 AND day_count <= 100 INTO project_allowed;

  RETURN user_allowed AND project_allowed;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_ask_rate_limit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ask_rate_limit(uuid) TO service_role;