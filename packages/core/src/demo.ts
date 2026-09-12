/**
 * Demo identity — portable.
 *
 * The cookie *name* lives here because it is just a string; the functions that
 * read and write it are in `lib/demo-mode.ts` (which stays in the app), and is browser-only. Keeping
 * them apart is what lets this module, `routes.ts` and
 * `auth-session.ts` into the shared package.
 */
export const DEMO_COOKIE = 'tappet_demo';
export const DEMO_VEHICLE_IDS = [
  'a1000000-0000-0000-0000-000000000001',
  'a2000000-0000-0000-0000-000000000002',
  'a3000000-0000-0000-0000-000000000003',
] as const;

export function isDemoVehicleId(vehicleId: string): boolean {
  return DEMO_VEHICLE_IDS.includes(vehicleId as any);
}

/*
 * The three demo cars are read from the database, and only from the database.
 *
 * There used to be a `DEMO_IMAGES` map here that `VehicleCard` overrode demo
 * vehicles with, while `DiagnosticHero` read `vehicles.image_url` — two sources
 * of truth for one photograph, and the reason the card and the hero could show
 * different cars. It was always marked temporary, pending migration
 * `20260726230000_local_demo_photos_and_focal_points.sql` being applied
 * everywhere.
 *
 * **It has been.** Queried against the live database on 2 Aug 2026: all three
 * demo rows hold local paths — `/vehicles/{accord,wrx,m3}/hero-3x2.jpg` — and
 * no Pexels URL survives anywhere in the column. The audit that scheduled this
 * deletion assumed the opposite, which is why it asked for the migration to be
 * reverted alongside; reverting it would have *restored* the Pexels URLs.
 *
 * The map's own warning was the real constraint: "whoever deletes this must not
 * simply fall back to `image_url`" — the column holds the page-width hero, so a
 * bare fall-through puts three 650–861 KB files in a grid of ~400px cards.
 * `VehicleIdentity.cardScopedSource` answers that. The card derives
 * `card-800.jpg` from the hero path by the same naming convention the AVIF and
 * WebP siblings already use, so the card asks for a card-sized source without
 * anything needing to be kept in step with the seed data.
 */

/**
 * Demo vehicles that deliberately have **no** photograph.
 *
 * The M3 is unphotographed on purpose, so a visitor browsing the demo sees what
 * their own car will look like before they upload anything. Every real user
 * starts in this state and, until now, nothing in the product ever showed it.
 *
 * `components/VehicleIdentity.tsx` states the design case for it plainly: the
 * no-photo state is the *primary* design, not a fallback — and its docblock
 * records that `/vehicles/default/hero-3x2.jpg` and `/vehicles/placeholder.jpg`
 * could both 404 unnoticed precisely because all three seeded vehicles carried
 * hand-placed files, so no code path ever rendered the absent case. "The first
 * real user vehicle would have found it." This is that path, exercised on the
 * surface recruiters actually look at.
 *
 * ── Why this is a list and not just an absent key ───────────────────────────
 *
 * Dropping an id from DEMO_IMAGES is not enough. `VehicleCard` falls through to
 * the vehicle's own columns, and for the seeded demo rows those still hold the
 * old Pexels CDN URLs that DEMO_IMAGES was introduced to get off the page —
 * migration 20260726230000 has not been applied everywhere. An absent key would
 * therefore restore a remote photograph rather than remove one. Saying it out
 * loud makes the intent survive the database.
 *
 * The M3 was chosen because it is the least entangled of the three: the Accord
 * is `DEMO_SMOKE_EXPECTATIONS.dashboard`, and the WRX is
 * `CONSULTANT_ROUND_TRIP` (its Stage 1 seed data is what the gate asks about).
 */
/*
  ── ⚠ Empty since 12 Sep, and the list stays ─────────────────────────────

  The M3 stood unphotographed so the demo showed "what their own car will
  look like before they upload anything". Then every car without a
  photograph got a generated plate keyed by its model generation
  (`packages/core/src/plates.ts`), drawn in the background from the moment
  the VIN decodes — so what a real user sees before uploading is a plate,
  and for a few seconds "Drawing this car's plate". The bare bay is no longer
  anyone's home state; it is a wait, and the wait is shown on `/dev/garage`
  and `/dev/working` where design work looks at it.

  So the M3 shows its own committed night plate, one film with the other two
  (`public/vehicles/CREDITS.md`). The list and `isUnphotographedDemoVehicle`
  stay, because every surface still asks the question through them and a
  future demo may want a car in the bare state again — the day it does, an
  id goes back here and nothing else moves. David: "run with that plan".
*/
export const DEMO_UNPHOTOGRAPHED_VEHICLE_IDS = [] as const;

/** Whether a demo vehicle is one of the deliberately unphotographed ones. */
export function isUnphotographedDemoVehicle(id: string): boolean {
  return (DEMO_UNPHOTOGRAPHED_VEHICLE_IDS as readonly string[]).includes(id);
}
