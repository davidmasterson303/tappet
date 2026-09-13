import type { WishlistSuggestion } from '@tappet/core/wishlist-suggestions';

/**
 * What a wishlist row prints, shared by the catalogue and the Needs list.
 *
 * ── Two screens, one row ────────────────────────────────────────────────────
 *
 * `WishlistAddScreen` offers a thing; `WishlistScreen` holds it once taken.
 * Rounds 37–40 made the two rows one shape — index, label, mono figure at
 * the rule, the reason beneath, the verbs on the last line — and a shape
 * held in two files drifts the way the search box did (§6.17). The reading
 * rules live here; the screens lay them out.
 */

/**
 * The row's figure, for the numeral column — B6, rounds 37 and 39.
 *
 * A suggestion carries one figure: an issue's mileage window, a service's
 * interval, a modification's difficulty. Core prints it as a sentence
 * (`note`: "Typically 60,000 - 100,000 miles", "Every 5,000 mi or 12
 * months", "Easy") and the row used to set that sentence in sans under the
 * reason — the critique's *"the values are sans"*. A spec table's figure is
 * mono and ends at the rule, so the sentence is read back into its numbers
 * here: `60,000–100,000 MI`, `5,000 MI / 12 MO`, `EASY`. The numbers are
 * core's own, unrounded (§10).
 *
 * ⚠ A window the model wrote as two — the M235i's coils say "30,000 -
 * 60,000 miles (plugs), 60,000 - 100,000 miles (coils)" — is spanned, first
 * low to last high, which says less than the sentence and nothing the
 * sentence did not; a note with no window in it gives the column nothing
 * and is not printed as a sentence in the body (round 39). Better an empty
 * slot than a figure guessed from prose.
 *
 * ⚠ **This belongs in `packages/core` beside `note`** — a `value` on
 * `WishlistSuggestion`, built from the raw fields rather than read back out
 * of the sentence, so the web can print the same figure. Written here
 * because a worktree does not edit core; the shapes matched are the exact
 * templates `wishlist-suggestions.ts` writes, and the test pins them
 * against core's real output so a template change cannot pass silently.
 */
const WINDOW = /([\d,]+)\s*[-–]\s*([\d,]+)\s*(?:mi|miles)\b/gi;
const INTERVAL = /^Every (?:([\d,]+) mi)?(?: or )?(?:(\d+) months)?$/;

export function suggestionValue(suggestion: {
  type: WishlistSuggestion['type'] | string | null | undefined;
  note: string | null | undefined;
}): string | null {
  if (!suggestion.note) return null;
  if (suggestion.type === 'issue') {
    /*
      Every window in the sentence, spanned: the coils' "30,000 - 60,000
      miles (plugs), 60,000 - 100,000 miles (coils)" is the row's window from
      the first low to the last high — what the model wrote and no more,
      which is the direction §10 allows. Round 39: a numeric sentence in the
      body is never the answer; the figure is the column's or nowhere.
    */
    const windows = [...suggestion.note.matchAll(WINDOW)].map(([, low, high]) => [
      Number(low.replace(/,/g, '')),
      Number(high.replace(/,/g, '')),
    ]);
    if (windows.length === 0) return null;
    const low = Math.min(...windows.map(([from]) => from));
    const high = Math.max(...windows.map(([, to]) => to));
    return `${low.toLocaleString('en-US')}–${high.toLocaleString('en-US')} MI`;
  }
  if (suggestion.type === 'maintenance') {
    const match = INTERVAL.exec(suggestion.note);
    if (!match || (!match[1] && !match[2])) return null;
    return [match[1] ? `${match[1]} MI` : null, match[2] ? `${match[2]} MO` : null]
      .filter(Boolean)
      .join(' / ');
  }
  if (suggestion.type === 'modification') return suggestion.note.toUpperCase();
  return null;
}

/**
 * Two lines of the reason, ended on a word — R41, revised in round 37.
 *
 * `numberOfLines={2}` cut the prose mid-word ("coolant loss, and p…"),
 * which the critique read three times on one frame as *"an unedited
 * default, not a decision"*. The platform's tail truncation has no word
 * mode, so the cut is made here, at the last space before the cap, with the
 * platform's own two-line limit kept beneath it for a narrower phone.
 * Ninety-six characters is two lines of the 13pt value face at the row's
 * text width on every iPhone this runs on. The Needs row takes the same cut
 * (round 40: *"VANOS carries a four-line paragraph"*) — a list is a spec
 * table on both screens, and the whole reason is what LEARN MORE is for.
 */
export const REASON_CAP = 96;

export function clipWords(prose: string, cap = REASON_CAP): string {
  if (prose.length <= cap) return prose;
  const cut = prose.lastIndexOf(' ', cap);
  return `${prose.slice(0, cut > 0 ? cut : cap).replace(/[,;:.]$/, '')}…`;
}

/**
 * What the catalogue writes beside an item so the list can print its figure.
 *
 * ── 13 Sep · the figure travels with the item ───────────────────────────────
 *
 * Round 40: *"once an item reaches the Plan list its interval vanishes"*.
 * The table has no column for it, and `source_data` — a `jsonb` the route
 * passes through (`app/api/v1/wishlist/route.ts`), written by nothing and
 * read by nothing (every live row holds `{}`, read 13 Sep) — is the slot the
 * schema already offers. The phone writes core's own sentence there, not the
 * figure: one spelling, read back through `suggestionValue` on the list, so
 * the two screens cannot print two figures for one item.
 *
 * ⚠ **A shape core should own.** `WishlistSourceData` beside
 * `wishlist-source.ts`, and the web's add writing the same key, so an item
 * added from the dossier carries its figure to the phone too. Until then a
 * row added elsewhere shows no figure, which is honest (§10).
 */
export interface WishlistSourceData {
  /** Core's `note` sentence for the suggestion, as `suggestionsFor` wrote it. */
  note?: string;
}

/** The note off a stored row's `source_data`, or nothing — never a guess at its shape. */
export function storedNote(sourceData: unknown): string | null {
  if (!sourceData || typeof sourceData !== 'object') return null;
  const note = (sourceData as Record<string, unknown>).note;
  return typeof note === 'string' && note.trim() ? note : null;
}
