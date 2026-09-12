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

/** The car the design loop has been grading since the first iteration. */
const M235I = {
  id: 'db143cdc-e68c-46f0-849e-69f7a1873f58',
  year: 2015,
  make: 'BMW',
  model: 'M235i',
  trim: 'xDrive',
  current_mileage: 66_000,
  vehicle_status: 'daily_driver',
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
      fixture calls the same function on its own facts. No schedule is on this
      fixture, so Maintenance reports that and scores nothing; two recalls
      score the recalls driver low; 66,000 miles on a 2015 car is a light
      load. Every sentence on the frame is one the product would write.
    */
    return {
      vehicle: M235I,
      health_drivers: driversForVehicle({
        schedule: undefined,
        historyRows: MAINTENANCE,
        recalls: M235I.nhtsa_data.recalls,
        currentMileage: M235I.current_mileage,
        year: M235I.year,
      }),
    };
  }
  if (path.startsWith('/load-maintenance-data')) {
    return { lineItems: [], maintenanceLineItems: MAINTENANCE };
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
