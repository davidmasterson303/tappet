/**
 * Where a wishlist row came from — the three words the table accepts.
 *
 * ── ⚠ 13 Sep · two of the phone's three ADDs had never worked ─────────────
 *
 * `wishlist_items.source` carries `CHECK (source IN ('dossier', 'consultant',
 * 'manual'))` — `20260314142241_seed_demo_vehicles.sql`, and verified live
 * on 13 Sep with a probe insert that came back `23514` and stored nothing.
 * The phone's catalogue ("What this car needs") sent `'suggestions'` and the
 * Build ladder sent `'progression-ladder'`; the database refused both, the
 * route turned the refusal into a 500, and the screen said *"Failed to add
 * item to wishlist"* — David, on his phone, the same night. The Due row's
 * ADD sent nothing, took the route's `'manual'` default, and worked, which
 * is why one of three ADDs on the same tab succeeded.
 *
 * The set lives here so the route can refuse an unknown word **before** the
 * insert — a 400 that names the field, not a 500 that names nothing — and so
 * the phone cannot invent a fourth one: `wishlist-source.test.ts` and the
 * mobile source scan hold every `'/wishlist'` POST to this list.
 *
 * What the words mean, so the right one gets chosen:
 *
 *   `dossier`     the app suggested it from what it knows about the car — the
 *                 catalogue, the schedule, the modification ladder. The web
 *                 has used it for exactly these adds since July
 *                 (`lib/actions/wishlist.ts`).
 *   `consultant`  the advisor proposed it in an answer.
 *   `manual`      the owner typed it.
 *
 * ⚠ The CHECK is the authority, not this file. If a fourth source is ever
 * needed it is a migration first, applied and verified (CLAUDE.md §2), and a
 * word here second.
 */
export const WISHLIST_SOURCES = ['dossier', 'consultant', 'manual'] as const;

export type WishlistSource = (typeof WISHLIST_SOURCES)[number];

export function isWishlistSource(value: unknown): value is WishlistSource {
  return typeof value === 'string' && (WISHLIST_SOURCES as readonly string[]).includes(value);
}
