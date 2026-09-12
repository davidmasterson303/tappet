import { normaliseRecalls, type NormalisedRecall } from '@tappet/core/recalls';

/**
 * The two inputs `healthVerdict` needs that the vehicle payload does not hand
 * over ready-made, computed once so both screens that print the verdict
 * compute them the same way.
 *
 * ── 12 Sep · why this left `VehicleDetailScreen` ────────────────────────────
 *
 * The vehicle screen ran the stored health sentence through `healthVerdict`
 * (`@tappet/core/health-claims`) and the Health screen printed it raw — so
 * on the fixtures the two screens contradicted each other one tap apart:
 * "taken before your 5 service records were filed" on the hub, and the
 * sentence those records had superseded on the screen that exists to
 * account for the score. The critic's round-28 Cut list caught it (drift
 * §6.13). Both screens read this file now, and the verdict is one verdict.
 */

/**
 * The most recent `created_at` among filed service records, or `null`.
 *
 * ⚠ Returns `null` for an empty list rather than "now" or the epoch. A car with
 * no records has no filing date, and either substitute would be a claim: the
 * epoch would call every verdict stale, and `now` would call every verdict
 * current. §6 — a missing value is "we cannot say".
 *
 * ⚠ Filed rather than performed. It exists to date the health verdict against
 * what it could have seen, and a visit dated 2 Aug that was scanned on the
 * 6th was invisible to a summary generated on the 4th. `healthVerdict`
 * carries the full argument.
 */
export function newestFiledAt(items: Array<{ created_at?: string | null }>): string | null {
  let newest: string | null = null;
  let newestAt = -Infinity;

  for (const item of items) {
    if (typeof item?.created_at !== 'string') continue;

    /*
      Parsed rather than compared as strings. These do all come from one
      Postgres column and would sort lexically today — but that holds only while
      every row carries the same offset and the same fractional precision, which
      is a property of the data rather than of anything enforced here.
    */
    const at = Date.parse(item.created_at);
    if (Number.isNaN(at) || at <= newestAt) continue;

    newest = item.created_at;
    newestAt = at;
  }

  return newest;
}

/**
 * The recalls still standing against a car — every campaign on its NHTSA
 * record that the owner has not marked repaired.
 *
 * Open is not the same number as recalls: a campaign the owner has marked
 * repaired is no longer counted, and that is the point of the whole recall
 * change — a badge that can never go down stops being read.
 *
 * ⚠ A missing or malformed `recall_actions` embed means **nothing is treated
 * as marked**. Erring the other way would hide an open safety notice on the
 * strength of a field that failed to arrive.
 */
export function openRecalls(
  rawRecalls: unknown,
  actions: ReadonlyArray<{ campaign_number?: unknown } | null | undefined> | null | undefined
): NormalisedRecall[] {
  const all = normaliseRecalls(rawRecalls);
  const marked = new Set(
    (actions ?? []).flatMap((action) =>
      typeof action?.campaign_number === 'string' ? [action.campaign_number] : []
    )
  );
  return all.filter((recall) => !recall.campaignNumber || !marked.has(recall.campaignNumber));
}
