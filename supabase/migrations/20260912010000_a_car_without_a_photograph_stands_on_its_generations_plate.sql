/*
  # A car without a photograph stands on its generation's plate

  11 Sep. **Additive only** — one new table, one nullable column on `vehicles`.
  Nothing is dropped, no existing row changes, no existing policy or grant is
  touched.

  ## The decision this carries (David, 11 Sep)

  The three demo cars stand on generated night plates — wet asphalt, sodium
  against cyan, the direction's own photography — and David wants every car to:
  *"I want to use such images for all cars as default image. I'm fine with the
  implications … I can use them but can't claim rights to them."*

  Three constraints he set, and each is a column here:

  - **Per model generation, not per year.** *"They don't always change much
    year to year and these stylized images are forgiving to super minor
    differences."* So a plate is keyed by make + model family + generation,
    and carries the year range it stands for (`year_from`, `year_to`). A 2015
    and a 2018 of the same generation share one row.
  - **A library, not a per-user render.** *"We need to create a library of
    these photos so we don't create new for two users who have the same model
    generation."* `key` is the primary key; the second car of a generation
    finds the row and generates nothing.
  - **Colour is not honoured.** *"Let's say no for now, that's exponentially
    more."* Every plate is the same dark graphite, which reads as the
    product's colour rather than a claim about the owner's car.

  ## What a row means

  One row per generation the product has been asked for. `status` is the whole
  story of that request:

  - `pending`    — asked for, not yet generated. The car stands on the house
                   plate meanwhile; the garage says the plate is being drawn.
  - `generating` — a background job has claimed it. `claimed_at` says when; a
                   claim older than ten minutes is stale and may be re-claimed.
  - `ready`      — `hero_path` and `card_path` exist in the `garage-images`
                   bucket, under `plates/<key>/`.
  - `failed`     — the last attempt failed; `error` says why, `attempts` says
                   how often. Retried by the next request for the same key.

  ⚠ **`pending` is not a wait the owner is made to sit through.** Generation
  starts at VIN decode, before the onboarding form is even filled in, so it
  runs behind the form and the research call. The status exists so the card
  can say the truth ("drawing this car's plate") instead of showing a broken
  image or a spinner that could mean anything.

  ## Why `vehicles.plate_key` and not a join by make/model/year

  A vehicle's generation is decided once, when the plate is asked for, by a
  model call that names the family and its year range. Storing the answer on
  the vehicle means every surface that shows the car resolves its plate with
  one lookup and no arithmetic — and a later, better answer for the same
  generation does not silently re-point cars that already stand on a plate.

  ## The spend is bounded here, not by vigilance

  Every generation is a paid image call (~US$0.13 at the size used). `created_at`
  and `generated_at` are what the daily cap counts against
  (`PLATE_DAILY_CAP` in `packages/core/src/plates.ts`), and `cost_usd_estimate`
  is written per row so the bill is legible from this table alone without
  joining the token meter — image calls are metered in tokens too, but a row
  per plate is the honest unit for "what did the library cost".

  ## Reads and writes

  The garage and dashboard read `vehicle_plates` from the browser with the anon
  key, exactly as they read the demo vehicles, so the card can show the plate
  the moment it is ready. There is nothing private in a row: a make, a model
  family, a year range, a status and two public paths. SELECT is granted to
  `anon` and `authenticated`; every write goes through the service role.

  ## Grants

  `20260801150000` revoked TRUNCATE from `authenticated` across the schema, and
  that grant does not extend to tables created afterwards — Postgres expands
  `ALL TABLES` once. So this migration carries its own REVOKE, and
  `truncate-revoked.test.ts` fails the build if it does not.
*/

CREATE TABLE IF NOT EXISTS public.vehicle_plates (
  -- `<make>/<family>/<generation>` as slugs, e.g. `bmw/2-series/f22`. Derived
  -- by `plateKey` in packages/core/src/plates.ts and nowhere else.
  key text PRIMARY KEY,
  -- What the key was derived from, kept legible.
  make text NOT NULL,
  family text NOT NULL,
  generation text NOT NULL,
  -- The years this plate stands for, inclusive. A car's year must fall inside.
  year_from integer NOT NULL,
  year_to integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'ready', 'failed')),
  -- Paths inside the public `garage-images` bucket, set when `ready`.
  hero_path text,
  card_path text,
  -- The prompt actually sent, verbatim, so a plate can be regenerated in the
  -- same style — the same rule public/vehicles/CREDITS.md keeps by hand.
  prompt text,
  model text,
  attempts integer NOT NULL DEFAULT 0,
  error text,
  claimed_at timestamptz,
  generated_at timestamptz,
  -- Estimated, from the image model's published price at the size used.
  cost_usd_estimate numeric(6, 3),
  -- ⚠ No column names a person or a car, on purpose. Every row is public
  -- (see "Reads and writes"), and `rls-blanket-policies.test.ts` allows a
  -- blanket read only on a table with no ownership-shaped column — so an
  -- informational "who asked first" would have cost the public read.
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (year_from <= year_to)
);

-- The lookup at VIN decode: "is there a plate for this make and family that
-- covers this year". Family is matched after normalisation in code; the index
-- narrows to the make.
CREATE INDEX IF NOT EXISTS vehicle_plates_make_family_idx
  ON public.vehicle_plates (make, family);

-- The cap's query: generations in the last day.
CREATE INDEX IF NOT EXISTS vehicle_plates_generated_at_idx
  ON public.vehicle_plates (generated_at DESC);

ALTER TABLE public.vehicle_plates ENABLE ROW LEVEL SECURITY;

-- Public rows, public reads. Writes are the service role's alone: no INSERT,
-- UPDATE or DELETE policy exists, so the anon and authenticated roles cannot
-- reach a write by any path.
DROP POLICY IF EXISTS "vehicle_plates are readable by everyone" ON public.vehicle_plates;
CREATE POLICY "vehicle_plates are readable by everyone"
  ON public.vehicle_plates FOR SELECT
  TO anon, authenticated
  USING (true);

-- Everything off first, one role per statement (`truncate-revoked.test.ts`
-- reads them one at a time), then the single grant back.
REVOKE ALL ON public.vehicle_plates FROM anon;
REVOKE ALL ON public.vehicle_plates FROM authenticated;
GRANT SELECT ON public.vehicle_plates TO anon, authenticated;

COMMENT ON TABLE public.vehicle_plates IS
  'The library of generated night plates, one per model generation. A car with no owner photograph stands on the plate its plate_key names. Keyed by make/family/generation; carries the year range it covers, its status, and the prompt that made it. Service role writes only.';
COMMENT ON COLUMN public.vehicle_plates.status IS
  'pending = asked for; generating = a job holds it (claimed_at); ready = hero_path and card_path exist; failed = see error and attempts. The car stands on the house plate in every state but ready.';
COMMENT ON COLUMN public.vehicle_plates.cost_usd_estimate IS
  'Estimated from the image model''s published price at the size generated. The daily cap counts rows, not this figure.';

-- The vehicle's answer, decided once. Nullable: every existing car, and any
-- car whose generation could not be named, has none and stands on the house
-- plate exactly as before.
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS plate_key text
    REFERENCES public.vehicle_plates (key) ON DELETE SET NULL;

COMMENT ON COLUMN public.vehicles.plate_key IS
  'Which generation plate this car stands on when it has no owner photograph. Null means none was asked for or the generation could not be named; the house plate renders. Never overrides custom_image_url or image_url.';
