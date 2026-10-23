-- Link sharing: when a trip's owner turns on is_public, anyone with the trip
-- link can edit it. Signed-in visitors join the trip (they are added to
-- shared_with and edit it like any helper). Signed-out visitors load and save
-- the trip through get_public_trip / save_public_trip.
--
-- No new table policies are added. Every entry point is a SECURITY DEFINER
-- function that works on a single trip by id and only while it is public, so
-- nobody can list public trips, and signed-out visitors can never touch the
-- owner, the shared list, the debrief, or link sharing itself.

ALTER TABLE public.trips
ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

-- Only the owner can turn link sharing on or off. A helper's autosave sends
-- every column back, so a stale value is ignored instead of failing the save.
CREATE OR REPLACE FUNCTION public.keep_trip_is_public_owner_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_public IS DISTINCT FROM OLD.is_public
     AND auth.uid() IS NOT NULL
     AND auth.uid()::text IS DISTINCT FROM OLD.user_id::text THEN
    NEW.is_public := OLD.is_public;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_is_public_owner_only ON public.trips;
CREATE TRIGGER trips_is_public_owner_only
BEFORE UPDATE ON public.trips
FOR EACH ROW EXECUTE FUNCTION public.keep_trip_is_public_owner_only();

-- A signed-in user opening the link of a public trip joins it.
-- Returns true when the caller can now access the trip.
CREATE OR REPLACE FUNCTION public.join_public_trip(p_trip_id text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  caller_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
BEGIN
  IF auth.uid() IS NULL OR caller_email = '' THEN
    RETURN false;
  END IF;

  UPDATE public.trips
  SET shared_with = CASE
    WHEN caller_email = ANY (coalesce(shared_with, ARRAY[]::text[])) THEN shared_with
    ELSE array_append(coalesce(shared_with, ARRAY[]::text[]), caller_email)
  END
  WHERE id::text = p_trip_id
    AND is_public
    AND NOT is_template;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.join_public_trip(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_public_trip(text) TO authenticated;

-- A public trip for signed-out visitors. Leaves out the owner id, the shared
-- email list, debrief discussions and Strava embeds, and strips account ids
-- from the people list.
CREATE OR REPLACE FUNCTION public.get_public_trip(p_trip_id text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'id', t.id,
    'name', t.name,
    'people', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', p ->> 'id', 'name', p ->> 'name'))
      FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(to_jsonb(t.people)) = 'array' THEN to_jsonb(t.people) ELSE '[]'::jsonb END
      ) AS p
    ), '[]'::jsonb),
    'categories', coalesce(to_jsonb(t.categories), '[]'::jsonb),
    'tags', coalesce(to_jsonb(t.tags), '[]'::jsonb),
    'completed', t.completed,
    'start_date', t.start_date,
    'days', coalesce(to_jsonb(t.days), '[]'::jsonb),
    'caltopo_url', t.caltopo_url,
    'last_modified', t.last_modified
  )
  FROM public.trips t
  WHERE t.id::text = p_trip_id
    AND t.is_public
    AND NOT t.is_template;
$$;

REVOKE ALL ON FUNCTION public.get_public_trip(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_trip(text) TO anon, authenticated;

-- Saves a signed-out visitor's edits to a public trip. Only the planning
-- fields are written; account links on packers are kept from the stored
-- trip, and the CalTopo link only accepts caltopo.com URLs.
CREATE OR REPLACE FUNCTION public.save_public_trip(p_trip_id text, p_trip jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  stored_people jsonb;
  stored_caltopo text;
  new_caltopo text := coalesce(p_trip ->> 'caltopo_url', '');
BEGIN
  IF p_trip IS NULL
     OR jsonb_typeof(p_trip) <> 'object'
     OR octet_length(p_trip::text) > 2000000
     OR jsonb_typeof(p_trip -> 'people') <> 'array'
     OR jsonb_typeof(p_trip -> 'categories') <> 'array'
     OR jsonb_typeof(p_trip -> 'days') <> 'array'
     OR jsonb_typeof(p_trip -> 'tags') <> 'array'
     OR length(coalesce(p_trip ->> 'name', '')) > 200 THEN
    RETURN false;
  END IF;

  SELECT to_jsonb(t.people), t.caltopo_url
  INTO stored_people, stored_caltopo
  FROM public.trips t
  WHERE t.id::text = p_trip_id
    AND t.is_public
    AND NOT t.is_template
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF jsonb_typeof(stored_people) IS DISTINCT FROM 'array' THEN
    stored_people := '[]'::jsonb;
  END IF;

  IF new_caltopo <> '' AND new_caltopo !~* '^https://(www\.)?caltopo\.com/' THEN
    new_caltopo := stored_caltopo;
  END IF;

  UPDATE public.trips
  SET
    name = coalesce(nullif(trim(p_trip ->> 'name'), ''), name),
    people = (
      SELECT coalesce(jsonb_agg(
        (np - 'userId') || coalesce((
          SELECT jsonb_build_object('userId', op ->> 'userId')
          FROM jsonb_array_elements(stored_people) AS op
          WHERE op ->> 'id' = np ->> 'id' AND op ->> 'userId' IS NOT NULL
          LIMIT 1
        ), '{}'::jsonb)
        ORDER BY ord
      ), '[]'::jsonb)
      FROM jsonb_array_elements(p_trip -> 'people') WITH ORDINALITY AS incoming(np, ord)
    ),
    categories = p_trip -> 'categories',
    tags = p_trip -> 'tags',
    days = p_trip -> 'days',
    completed = coalesce((p_trip ->> 'completed')::boolean, completed),
    start_date = coalesce(p_trip ->> 'start_date', ''),
    caltopo_url = new_caltopo,
    last_modified = coalesce((p_trip ->> 'last_modified')::bigint, last_modified)
  WHERE id::text = p_trip_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.save_public_trip(text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_public_trip(text, jsonb) TO anon, authenticated;
