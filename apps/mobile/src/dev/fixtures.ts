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
  vehicle_health_summary: {
    health_score: 70,
    summary:
      'This reading was taken before your 5 service records were filed, so it does not account for them.',
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
  },
  {
    id: 'm5',
    item_description: 'Timing belt',
    service_date: '2024-05-01',
    total_cost: null,
    mileage_at_service: 48_000,
    source: 'owner-onboarding',
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
  if (path.startsWith('/load-vehicle')) return { vehicle: M235I };
  if (path.startsWith('/load-maintenance-data')) {
    return { lineItems: [], maintenanceLineItems: MAINTENANCE };
  }
  if (path.startsWith('/wishlist')) return { items: [] };
  return undefined;
}
