/*
  # A rotation is a record with a provenance

  The second half of the tire tracker (v1.1). **Additive only**: one new table,
  nothing dropped. Depends on `20260920200000` (`tire_sets`).

  ## Why not `maintenance_line_items`

  A rotation is a service, and the invoice-vision path already reads
  "Tire rotation" lines off receipts into `maintenance_line_items` — so reusing
  that table was the first thing to consider, and the brief asked for it to be
  read before deciding. Read, and not reused, for three reasons:

    1. **A rotation belongs to a set.** The reading "miles since the last
       rotation" and the axis it is drawn on are per set: a rotation logged on
       last year's tires says nothing about this year's. A line item has a
       vehicle and no set, so every read would have to guess which set a
       "Tire rotation" line was about from its date — an inference, and the
       axis's ticks would be plotted on it.
    2. **Matching on description text is a guess wearing a record's clothes.**
       "Rotate & balance", "Tire rotation", "Rot/bal" — a regex over
       `item_description` would find some and miss others silently, and a
       missed rotation reads as an overrun. `20260801120000` refused exactly
       this kind of inference for provenance; it is refused here for identity.
    3. **The columns are wrong for the job.** A line item carries costs,
       part numbers and quantities a rotation does not have, and lacks the one
       thing a rotation needs — the set.

  So: its own table, with `line_item_id` as an optional pointer back. When the
  vision path is wired to log a rotation it read off an invoice, the row here
  carries `provenance = 'invoice'` and points at the line item, and the record
  row's filled mark is the tap target to the document it came from (the B9
  hook in the design). Until then every row is `'typed'`.

  ## `vehicle_id` is here too, on purpose

  Denormalised from the set, so `user_owns_vehicle(vehicle_id)` scopes the
  policies without a join and `authorizeVehicleScopedRow('tire_rotations', id)`
  can prove ownership the way it does for every other row it guards. The route
  writes it from the set it just authorized; the two cannot disagree without a
  bug in the one place that writes both.

  ## What is not here

  No cost, no shop, no notes. A rotation is a date, an odometer and how we
  know — the three things the record row draws and the axis plots. A shop that
  did it is on the invoice, if there was one, and that is what `line_item_id`
  is for.

  ## RLS

  Owner-scoped through `user_owns_vehicle`, `authenticated` only, no blanket
  policy — see `20260920200000` for the posture and the reasons.

  Applied state is a PostgREST check: `GET /rest/v1/tire_rotations?select=id&limit=1`
  answers 200 after, `PGRST205` before.
*/

CREATE TABLE IF NOT EXISTS public.tire_rotations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.tire_sets(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,

  /* `date`, not a timestamp — see `tire_sets.installed_on`. Required: a rotation with no date is not a record. */
  rotated_on date NOT NULL,
  odometer integer NOT NULL CHECK (odometer >= 0),

  provenance text NOT NULL DEFAULT 'typed'
    CHECK (provenance IN ('invoice', 'typed')),
  /*
    The invoice line this rotation was read off, when it was. `SET NULL` rather
    than cascade: deleting a line item should not delete the rotation it
    evidenced — the record stands, it just loses its document.
  */
  line_item_id uuid REFERENCES public.maintenance_line_items(id) ON DELETE SET NULL,

  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tire_rotations_set_id_idx ON public.tire_rotations (set_id, odometer);
CREATE INDEX IF NOT EXISTS tire_rotations_vehicle_id_idx ON public.tire_rotations (vehicle_id);

COMMENT ON TABLE public.tire_rotations IS
  'One rotation of one tire set: when, at what odometer, and how Tappet knows '
  '(typed by the owner, or read off a scanned invoice it points at). The axis '
  'and the record rows in packages/core/src/tires.ts are drawn from these.';

ALTER TABLE public.tire_rotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owners read their tire rotations" ON public.tire_rotations;
CREATE POLICY "Owners read their tire rotations"
  ON public.tire_rotations FOR SELECT
  TO authenticated
  USING (user_owns_vehicle(vehicle_id));

DROP POLICY IF EXISTS "Owners log rotations on their tire sets" ON public.tire_rotations;
CREATE POLICY "Owners log rotations on their tire sets"
  ON public.tire_rotations FOR INSERT
  TO authenticated
  WITH CHECK (user_owns_vehicle(vehicle_id));

DROP POLICY IF EXISTS "Owners correct their tire rotations" ON public.tire_rotations;
CREATE POLICY "Owners correct their tire rotations"
  ON public.tire_rotations FOR UPDATE
  TO authenticated
  USING (user_owns_vehicle(vehicle_id))
  WITH CHECK (user_owns_vehicle(vehicle_id));

DROP POLICY IF EXISTS "Owners delete their tire rotations" ON public.tire_rotations;
CREATE POLICY "Owners delete their tire rotations"
  ON public.tire_rotations FOR DELETE
  TO authenticated
  USING (user_owns_vehicle(vehicle_id));

REVOKE ALL ON public.tire_rotations FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tire_rotations TO authenticated;
REVOKE TRUNCATE ON public.tire_rotations FROM authenticated;
