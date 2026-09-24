/*
  # A tire set is an object on the vehicle

  v1.1, the tire tracker — decided by David 18–20 Sep 2026, designed in
  `design-loop/tires/` (graded 8/10, round 4), derived in
  `packages/core/src/tires.ts`. **Additive only**: one new table, nothing
  dropped, no existing row changes.

  ## The feature in one sentence

  A tire set becomes an object on the vehicle, the owner tells us its rotation
  interval, and we tell them when they are outside it.

  ⚠ It is not a warranty-claim product, and no column here records a claim.
  What is recorded is what the owner can read off the sidewall and the receipt,
  plus two figures they read off the warranty card — the rotation interval and
  the treadwear mileage — **as they typed them, never derived**.

  ## Per axle from the start

  `size_front` and `size_rear` are two columns, always both written, even when
  they are the same size. Retrofitting axles later is a data migration; the
  common square set costs one duplicated string. Staggered detection is
  `size_front <> size_rear` in core, and it is the consequence that matters: no
  front-to-rear rotation, and on five of eight majors the rear tires' mileage
  warranty is halved.

  ## The interval is asked, never assumed

  `rotation_interval_miles` is nullable, and **there is no default**.
  `service-due.ts` deleted a hardcoded interval table because "a generic table
  is a reasonable placeholder on a screen someone chose to open and a bad basis
  for an unprompted notification"; this table does not reintroduce one. A set
  with no interval has no obligation: no overrun on screen, no sodium mark, no
  push.

  `interval_source` says **who** stated it, and the CHECK keeps the two columns
  honest together — a figure with no source, or a source with no figure, is
  refused by the database rather than left for core to guess about:

    'owner'    typed from the warranty card. The only source that licenses the
               notification's sentence "you are currently outside your
               warranty's terms", because only the card can source a claim
               about the warranty.
    'vehicle'  a figure Tappet holds for the vehicle itself. ⚠ Nothing writes
               this yet. It is in the CHECK so a third meaning cannot arrive
               unannounced, the way `maintenance_line_items.source` is
               constrained.

  ## Provenance, because the two clients draw it

  `provenance` is how the set's own facts were recorded — `'invoice'` when read
  off a scanned document, `'typed'` when the owner entered them — and the screens
  draw the two differently (`service-provenance.ts` already makes this
  distinction for service rows). Nothing today writes `'invoice'` for a set; the
  value exists because the invoice-vision path already reads a rotation line
  off a receipt, and the column is where that lands when it is wired.

  ## The dedupe lives on the set

  `rotation_notified_at` is when the sweep last pushed about this set, and it is
  a column here rather than a third table (compare `service_notifications`,
  which argued for a separate table to keep the sweep's write off the garage's
  hot read path). This table is read only on the tire screen, never on the
  garage, so the hot-path argument does not apply, and the obligation belongs to
  the set: a new set is a new obligation with no history of having been told.
  The cooldown itself is `SERVICE_COOLDOWN_DAYS` in
  `packages/core/src/notification-sweep.ts`, not here.

  ## One current set per vehicle

  `retired_at` is null on the set the vehicle is wearing. A replacement set
  retires the old one rather than deleting it — the old set's rotations are the
  owner's records — and the partial unique index is what makes "the current set"
  a single row rather than a convention. v1.1 writes and reads one set; the
  column is what stops the second set being a data migration.

  ## RLS

  Owner-scoped through `user_owns_vehicle(vid)`, the same function every other
  vehicle-scoped table's policies use, for `authenticated` only. No `anon`
  policy: demo vehicles carry no tire sets, and `authorizeVehicleAccess` refuses
  every write intent on them regardless. The web reads this table through the
  browser client under these policies; the phone and the sweep go through the
  service role after ownership is proven. No blanket policy — see
  `rls-blanket-policies.test.ts` for why `USING (true)` is refused here.

  Applied state is a PostgREST check: `GET /rest/v1/tire_sets?select=id&limit=1`
  answers 200 after, `PGRST205` before (probed 20 Sep, before this was written).
*/

CREATE TABLE IF NOT EXISTS public.tire_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,

  brand text NOT NULL,
  line text NOT NULL,
  size_front text NOT NULL,
  size_rear text NOT NULL,

  /*
    `date`, not `timestamptz`: the owner says "12 March", never a moment, and
    a timestamp printed in a western zone reads as the day before. Nullable —
    an owner who does not remember is not made to invent one.
  */
  installed_on date,
  install_odometer integer CHECK (install_odometer IS NULL OR install_odometer >= 0),
  purchase_place text,

  rotation_interval_miles integer
    CHECK (rotation_interval_miles IS NULL OR rotation_interval_miles > 0),
  interval_source text
    CHECK (interval_source IS NULL OR interval_source IN ('owner', 'vehicle')),
  /* A figure without a source, or a source without a figure, asserts nothing and is refused. */
  CONSTRAINT tire_sets_interval_has_a_source
    CHECK ((rotation_interval_miles IS NULL) = (interval_source IS NULL)),

  treadwear_miles_entered integer
    CHECK (treadwear_miles_entered IS NULL OR treadwear_miles_entered > 0),

  provenance text NOT NULL DEFAULT 'typed'
    CHECK (provenance IN ('invoice', 'typed')),

  /* When the sweep last pushed about this set. Null until it has. */
  rotation_notified_at timestamptz,

  retired_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

/* One current set per vehicle. Retired sets are history and may be many. */
CREATE UNIQUE INDEX IF NOT EXISTS tire_sets_one_current_per_vehicle
  ON public.tire_sets (vehicle_id)
  WHERE retired_at IS NULL;

CREATE INDEX IF NOT EXISTS tire_sets_vehicle_id_idx ON public.tire_sets (vehicle_id);

COMMENT ON TABLE public.tire_sets IS
  'A tire set on a vehicle: what is on the sidewall and the receipt, plus the '
  'rotation interval and treadwear mileage as the owner typed them off the '
  'warranty card. Never a warranty claim. Derivations live in '
  'packages/core/src/tires.ts; the interval is asked, never defaulted.';

COMMENT ON COLUMN public.tire_sets.rotation_interval_miles IS
  'The rotation interval the set is held to. NULL means none was stated, and '
  'a set with none has no obligation: no overrun, no notification. No default, '
  'on purpose — see service-due.ts on generic interval tables.';

COMMENT ON COLUMN public.tire_sets.interval_source IS
  'Who stated the interval: owner (from the warranty card — the only source '
  'that licenses "outside your warranty''s terms") or vehicle (a figure Tappet '
  'holds; nothing writes it yet). Paired with rotation_interval_miles by CHECK.';

COMMENT ON COLUMN public.tire_sets.rotation_notified_at IS
  'When the nightly sweep last pushed about this set being past its interval. '
  'The cooldown is SERVICE_COOLDOWN_DAYS in notification-sweep.ts, not here.';

ALTER TABLE public.tire_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read their tire sets" ON public.tire_sets;
CREATE POLICY "Owners read their tire sets"
  ON public.tire_sets FOR SELECT
  TO authenticated
  USING (user_owns_vehicle(vehicle_id));

DROP POLICY IF EXISTS "Owners add tire sets to their vehicles" ON public.tire_sets;
CREATE POLICY "Owners add tire sets to their vehicles"
  ON public.tire_sets FOR INSERT
  TO authenticated
  WITH CHECK (user_owns_vehicle(vehicle_id));

DROP POLICY IF EXISTS "Owners update their tire sets" ON public.tire_sets;
CREATE POLICY "Owners update their tire sets"
  ON public.tire_sets FOR UPDATE
  TO authenticated
  USING (user_owns_vehicle(vehicle_id))
  WITH CHECK (user_owns_vehicle(vehicle_id));

DROP POLICY IF EXISTS "Owners delete their tire sets" ON public.tire_sets;
CREATE POLICY "Owners delete their tire sets"
  ON public.tire_sets FOR DELETE
  TO authenticated
  USING (user_owns_vehicle(vehicle_id));

/*
  The same grant posture as the other vehicle-scoped tables since
  20260629202102: authenticated may reach the table (RLS decides the rows),
  anon may not reach it at all, and nobody but the service role truncates.
*/
REVOKE ALL ON public.tire_sets FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tire_sets TO authenticated;
REVOKE TRUNCATE ON public.tire_sets FROM authenticated;
