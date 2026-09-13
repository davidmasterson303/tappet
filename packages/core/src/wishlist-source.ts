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

/**
 * What a client may write into `wishlist_items.source_data` — a `jsonb` the
 * route passes through, that held `{}` on every live row until 13 Sep.
 *
 * The phone's catalogue writes the suggestion's `note` and `value` beside
 * the item so the Plan list can print the same figure the catalogue did —
 * the figure has no column of its own. Both are core's own strings
 * (`suggestionsFor`), so the two screens cannot print two figures for one
 * item, and a reader that finds neither prints nothing (§10). The web's
 * dossier add does not write these yet; a row added there shows no figure
 * on the phone, which is honest until it does.
 */
export interface WishlistSourceData {
  note?: string | null;
  value?: string | null;
}

/** The two strings off a stored row's `source_data`, or nothing — never a guess at its shape. */
export function readWishlistSourceData(sourceData: unknown): WishlistSourceData {
  if (!sourceData || typeof sourceData !== 'object') return {};
  const record = sourceData as Record<string, unknown>;
  const pick = (key: 'note' | 'value') =>
    typeof record[key] === 'string' && (record[key] as string).trim() ? (record[key] as string) : null;
  return { note: pick('note'), value: pick('value') };
}
