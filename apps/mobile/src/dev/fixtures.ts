/**
 * Canned API responses, so the product screens can be driven with no server.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * The design loop grades screenshots of real screens. Twice now that has been
 * called blocked — once when the simulator's disk filled, once when its auth
 * path to Supabase wedged — and both times the reasoning was the same and wrong:
 * *the screens need data, not a session.* Auth is only the gate in front of the
 * data.
 *
 * The suite has always known this. `GarageScreen.test.tsx` and its siblings
 * render these exact screens against a mocked `apiRequest` and assert what they
 * draw. The capability existed; it was reachable only from jest.
 *
 * ⚠ **The shapes are lifted from those tests, not invented.** That matters more
 * than it sounds: `GarageScreen.test.tsx` carries a note about a fixture whose
 * recalls were `{ id: 1 }` — a shape NHTSA could never return — which passed
 * while the chip counted the raw array and stopped passing when it counted what
 * the recall screen would actually draw. A fixture that lies produces a
 * screenshot that lies, and a design critique of a screenshot that lies is worse
 * than no critique.
 *
 * ── Gating ──────────────────────────────────────────────────────────────────
 *
 * Read only by `api/client.ts`, behind `__DEV__` **and**
 * `EXPO_PUBLIC_DESIGN_FIXTURES=1`. Never in a release bundle, and never when the
 * flag is off — a build that quietly serves fixtures instead of the API is the
 * worst failure this file could have, because every screen would look perfect.
 */

import { driversForVehicle } from '@tappet/core/health-drivers';
import type { PlateStatus } from '@tappet/core/plates';

/**
 * The plate's status on the fixture car, from the environment.
 *
 * ── 12 Sep · so the loop can shoot the plate being drawn ────────────────────
 *
 * Both mobile routes carry `plate_status` beside `photo_url` — `pending` |
 * `generating` | `ready` | `failed` | `null` — and the empty plate says
 * "Drawing this car's plate" on the first two (`PlateStatusLine`). That state
 * lasts as long as a generation does, which is not a thing to sit and wait
 * for with a simulator, so the fixture reads it from
 * `EXPO_PUBLIC_DESIGN_PLATE_STATUS`: unset or anything the API would never
 * send is `null`, which is the route's own "nothing to say". The shape is the
 * route's; only the value is chosen.
 */
const PLATE_STATUSES: readonly PlateStatus[] = ['pending', 'generating', 'ready', 'failed'];
const DESIGN_PLATE_STATUS: PlateStatus | null = (() => {
  const raw = process.env.EXPO_PUBLIC_DESIGN_PLATE_STATUS;
  return PLATE_STATUSES.find((status) => status === raw) ?? null;
})();

/** The car the design loop has been grading since the first iteration. */
const M235I = {
  id: 'db143cdc-e68c-46f0-849e-69f7a1873f58',
  year: 2015,
  make: 'BMW',
  model: 'M235i',
  trim: 'xDrive',
  current_mileage: 66_000,
  vehicle_status: 'daily_driver',
  /*
    ── 12 Sep · what the nightly sweep would have written ──────────────────

    The garage's NEXT SERVICE row and the hub's SERVICE row read the three
    `next_service_*` columns the sweep stores (`notify-sweep/route.ts`:
    `nextService(services)` — the most urgent bookable service and the
    reading it is due at), not the schedule. Without them both rows said "No
    schedule yet" beside a Due segment listing eight services — the
    two-screens-disagree shape. These are what that sweep computes from
    `SCHEDULE` and `MAINTENANCE` below: the drive-belt check, counted from
    the recollection at 48,000, due at 63,000. `GarageScreen.test.tsx` drives
    the row with the same two fields.
  */
  next_service_label: 'Drive belt and tensioner, inspect',
  next_service_at_miles: 63_000,
  /**
   * ⚠ Read from the environment, not hard-coded.
   *
   * A vehicle photo lives in a **private** bucket, so the only URL that renders
   * one is a signed URL — and a signed URL is a bearer token with an expiry.
   * Committing one would put a read credential for a real owner's photograph in
   * the repository, which is not a thing a fixture file should carry however
   * short-lived it is.
   *
   * `EXPO_PUBLIC_DESIGN_PHOTO_URL` in `apps/mobile/.env` (gitignored). Absent,
   * the plate renders its placeholder, which is the honest empty state anyway.
   * Refresh it by signing the object again — it expires.
   */
  photo_url: process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL ?? null,
  /* `null` under a photograph, as the route does it — the plate is not showing. */
  plate_status: process.env.EXPO_PUBLIC_DESIGN_PHOTO_URL ? null : DESIGN_PLATE_STATUS,
  /*
    ── ⚠ 11 Sep · the reading is genuinely stale, not a sentence pretending ──

    This carried the app's own *stale* sentence — "This reading was taken
    before your 5 service records were filed…" — as if the model had written
    it. It had not: that sentence is what `healthVerdict` composes when a
    stored summary predates the record, and storing it here as the summary
    meant the verdict came out `current`, and printed "Based on 5 recorded
    services" under a sentence saying the opposite. The critique caught the
    contradiction twice before anyone noticed the fixture was the liar.

    So the fixture now holds what the table holds: the model's sentence and
    the moment it was written — the M235i pair `health-claims.test.ts` was
    written around — and the rows below carry `created_at` after it, so the
    verdict is stale for the reason a real one is.
  */
  vehicle_health_summary: {
    health_score: 70,
    summary:
      "Based on your provided service history, the vehicle's health is highly uncertain due to a complete lack of documented maintenance.",
    last_generated: '2026-07-30T01:05:47.583+00:00',
  },
  /*
    ⚠ Real NHTSA field names. The same note in `GarageScreen.test.tsx` explains
    what a bare `{ id: 1 }` costs: `normaliseRecall` drops it, and an entry that
    renders as a blank card is not information.
  */
  nhtsa_data: {
    recalls: [
      /*
        ⚠ Real taxonomy strings, not tidy ones. NHTSA returns
        `FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP`, and the recall card
        deliberately shows the *mapped* name at its head and the *raw* string at
        its foot — one is readable, the other is what a service desk recognises.

        A fixture that says `'FUEL SYSTEM'` collapses those two into the same
        text, which made a design critique report "printed twice per recall" and
        very nearly cost the raw string its place. A fixture that cannot tell two
        fields apart is a fixture that hides the reason they are both there.
      */
      {
        NHTSACampaignNumber: '23V-441',
        Component: 'FUEL SYSTEM, GASOLINE:DELIVERY:FUEL PUMP',
        Summary: 'The fuel pump may fail without warning, causing an engine stall.',
      },
      {
        NHTSACampaignNumber: '21V-100',
        Component: 'AIR BAGS:SIDE/WINDOW:HEAD',
        Summary: 'The inflator may rupture, propelling metal fragments into the cabin.',
      },
    ],
  },
};

const MAINTENANCE = [
  {
    id: 'm1',
    item_description: 'Front brake pads & rotors, replace',
    service_date: '2026-08-02',
    shop_name: 'BLACKMARKET MOTORSPORTS',
    total_cost: 678,
    mileage_at_service: 61_400,
    source: 'vision',
    source_document_id: 'doc-1',
    created_at: '2026-08-06T02:43:11.903661+00:00',
  },
  {
    id: 'm2',
    item_description: 'Oil change — Motul 5W-30, OEM filter',
    service_date: '2026-08-02',
    shop_name: 'BLACKMARKET MOTORSPORTS',
    total_cost: 152,
    mileage_at_service: 61_400,
    source: 'vision',
    source_document_id: 'doc-1',
    created_at: '2026-08-06T02:43:11.903661+00:00',
  },
  {
    id: 'm3',
    item_description: 'Spark plugs (6), NGK — replace',
    service_date: '2026-08-02',
    shop_name: 'BLACKMARKET MOTORSPORTS',
    total_cost: 294,
    mileage_at_service: 61_400,
    source: 'vision',
    source_document_id: 'doc-1',
    created_at: '2026-08-06T02:43:11.903661+00:00',
  },
  {
    id: 'm4',
    item_description: 'Coolant flush & refill',
    service_date: '2026-08-02',
    shop_name: 'BLACKMARKET MOTORSPORTS',
    total_cost: 189,
    mileage_at_service: 61_400,
    source: 'vision',
    source_document_id: 'doc-1',
    created_at: '2026-08-06T02:43:11.903661+00:00',
  },
  {
    id: 'm5',
    item_description: 'Timing belt',
    service_date: '2024-05-01',
    total_cost: null,
    mileage_at_service: 48_000,
    source: 'owner-onboarding',
    created_at: '2026-08-01T15:02:00.000+00:00',
  },
];

/**
 * The typical schedule the knowledge base holds for this car.
 *
 * ── 12 Sep · so the Due segment can be shot with something to compute ───────
 *
 * `/load-vehicle` answered with the vehicle alone, so `ServiceMilestoneScreen`
 * opened on "no structured service schedule yet" and the loop graded a Due
 * segment that had never drawn a row. The shape is `ScheduleEntry`'s — the one
 * `service-due.test.ts` and `ServiceMilestoneScreen.test.tsx` drive
 * `evaluateSchedule` with: `service`, `interval_miles` and/or
 * `interval_months`, `description`, `priority` — and the intervals are what a
 * "typical schedule" for a turbocharged BMW would say, not what makes a good
 * frame.
 *
 * ⚠ The positions are computed, never written. Against `MAINTENANCE` above
 * and the 66,000 on the odometer: the oil and the brake inspection count
 * from the invoice at 61,400 and come due at 66,400; the drive-belt check
 * counts from the *recollection* at 48,000 — `categoryFor` puts "Timing belt"
 * and "drive belt" in one category, which is the product's own matching rule
 * — and is 3,000 miles past, so the frame carries one genuine warning resting
 * on "what you told us at sign-up", which is exactly the claim the provenance
 * line exists to qualify; the brake fluid has no date to count from and says
 * so. Every sentence on the frame is one the product would write.
 *
 * ⚠ Fed to `driversForVehicle` as well, because the route feeds the same
 * schedule to both: a fixture whose Health said "no schedule on record" while
 * its Service listed eight rows would be two screens disagreeing about one
 * car, which is the lie a fixture must not tell.
 */
const SCHEDULE = [
  {
    service: 'Engine oil and filter',
    interval_miles: 5_000,
    interval_months: 12,
    description: 'Drain the oil, replace the filter, reset the service counter.',
    priority: 'Critical',
  },
  {
    service: 'Brake pads and rotors, inspect',
    interval_miles: 5_000,
    description: 'Measure pad depth and rotor thickness at all four corners.',
    priority: 'Recommended',
  },
  {
    service: 'Tire rotation',
    interval_miles: 7_500,
    description: 'Even out the wear, and check the pressures while it is up.',
    priority: 'Recommended',
  },
  {
    service: 'Drive belt and tensioner, inspect',
    interval_miles: 15_000,
    description: 'Look for cracks and glazing; a failed belt on this engine can be drawn into the crank seal.',
    priority: 'Recommended',
  },
  {
    service: 'Cabin air filter',
    interval_miles: 15_000,
    interval_months: 12,
    description: 'Replace the pollen filter behind the glovebox.',
    priority: 'Optional',
  },
  {
    service: 'Spark plugs',
    interval_miles: 30_000,
    description: 'Six plugs; the turbocharged engine is hard on them.',
    priority: 'Recommended',
  },
  {
    service: 'Coolant flush',
    interval_miles: 60_000,
    interval_months: 48,
    description: 'Drain, flush and refill with the BMW-spec coolant.',
    priority: 'Recommended',
  },
  {
    service: 'Brake fluid replacement',
    interval_months: 24,
    description: 'Bleed and replace; the fluid absorbs water whether the car is driven or not.',
    priority: 'Critical',
  },
];

/**
 * Whether a path should be held open forever, so its wait can be seen.
 *
 * ── 12 Sep · the only way to photograph a wait without spending the call ────
 *
 * Web's `/dev/working` exists because the only other way to see a loading
 * state is to make the request it waits on and watch. The phone's fixtures
 * answer in the same frame — which is right for every graded screen and
 * useless for the one state this pass adds to all of them. So
 * `EXPO_PUBLIC_DESIGN_HOLD` names path prefixes, comma-separated, whose
 * requests never resolve: `/consultant` holds the advisor on ANSWERING,
 * `/upload-document` holds the scanner on READING THE INVOICE, `/vehicles`
 * holds the garage on its page load. The screen draws exactly what it would
 * draw for a slow network, and no model is called.
 *
 * Same double gate as everything in this file, read by `api/client.ts` after
 * `fixtureFor` — a held path is held whether or not it has a canned answer.
 */
export function fixtureHolds(path: string): boolean {
  const raw = process.env.EXPO_PUBLIC_DESIGN_HOLD;
  if (!raw) return false;
  return raw
    .split(',')
    .map((prefix: string) => prefix.trim())
    .filter(Boolean)
    .some((prefix: string) => path.startsWith(prefix));
}

/**
 * Which stores the fixture car should answer *empty* for, from the environment.
 *
 * ── 12 Sep · the empty states are states too ────────────────────────────────
 *
 * The Service tab has two empties the loop grades — a history with nothing
 * filed, a car with no schedule — and the only way to photograph them had
 * been to edit this file and remember to put it back. `EXPO_PUBLIC_DESIGN_
 * EMPTY` names them instead, comma-separated: `history` answers
 * `/load-maintenance-data` with no rows, `schedule` answers `/load-vehicle`
 * with no `maintenance_schedule` — each the shape the screens' own suites
 * drive them with (`respondWith([])`; a `VEHICLE` without a schedule), so the
 * frame is one the product would draw. Anything else in the list is ignored
 * rather than guessed at, the way `DESIGN_PLATE_STATUS` treats a value the
 * API would never send.
 *
 * The drivers are recomputed from the same emptiness, for the reason
 * `SCHEDULE` gives: two screens must not disagree about one car.
 */
const DESIGN_EMPTY = new Set(
  (process.env.EXPO_PUBLIC_DESIGN_EMPTY ?? '')
    .split(',')
    .map((store: string) => store.trim())
    .filter(Boolean)
);

/**
 * The canned response for a path, or `undefined` when nothing matches.
 *
 * ⚠ Returning `undefined` rather than an empty object is deliberate: the caller
 * falls through to the real network for anything unmapped, so a screen this file
 * does not cover behaves normally instead of silently rendering as empty. An
 * un-fixtured screen should look broken, not finished.
 */
export function fixtureFor(path: string): unknown | undefined {
  if (path.startsWith('/vehicles')) return { vehicles: [M235I] };
  if (path.startsWith('/load-vehicle')) {
    /*
      ── 12 Sep · the drivers, computed rather than written ───────────────────

      The loop could never show the factors table: this returned the vehicle
      alone, so `HealthScreen` opened on a dial with nothing under it and the
      critique marked B6 unconfirmed for want of a frame. The route derives
      `health_drivers` at read from facts already on the response
      (`load-vehicle/route.ts`, D10), and `driversForVehicle` is pure — so the
      fixture calls the same function on its own facts. The schedule is
      `SCHEDULE` above (12 Sep; it was `undefined`, so Maintenance reported
      no schedule and scored nothing); two recalls score the recalls driver
      low; 66,000 miles on a 2015 car is a light load. Every sentence on the
      frame is one the product would write.
    */
    const schedule = DESIGN_EMPTY.has('schedule') ? [] : SCHEDULE;
    return {
      vehicle: M235I,
      /*
        ⚠ A top-level sibling of `vehicle`, as the route returns it — the
        screen's own docblock records that reading it off the vehicle is
        `undefined` forever with no error anywhere.
      */
      knowledge: { maintenance_schedule: schedule },
      health_drivers: driversForVehicle({
        schedule,
        historyRows: DESIGN_EMPTY.has('history') ? [] : MAINTENANCE,
        recalls: M235I.nhtsa_data.recalls,
        currentMileage: M235I.current_mileage,
        year: M235I.year,
      }),
    };
  }
  if (path.startsWith('/load-maintenance-data')) {
    return {
      lineItems: [],
      maintenanceLineItems: DESIGN_EMPTY.has('history') ? [] : MAINTENANCE,
    };
  }
  /*
    ⚠ `wishlistItems`, the route's own field (12 Sep). This answered `{ items:
    [] }`, a key no consumer reads, so the vehicle hub's PLAN row carried
    nothing where the real API's empty list gives it a 0 — and the critique
    called the row "valueless" on the strength of the fixture's lie.
  */
  if (path.startsWith('/wishlist')) return { wishlistItems: [] };
  return undefined;
}
