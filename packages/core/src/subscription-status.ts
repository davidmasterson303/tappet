import { formatDate } from './formatting-utils';

/**
 * What the Account screen says about the subscription — a status, in words
 * the rows can support.
 *
 * ── The finding (QE 2.3, 20 Sep) ─────────────────────────────────────────────
 *
 * Under "SUBSCRIPTION" the screen read "Tappet Plus / See plans, or restore…"
 * for an account with no entitlement row. That is the paywall link's name,
 * not a status: before enforcement flips it is confusing, after it is wrong.
 * `GET /api/v1/account` already decides whether a subscription is live, on
 * the server's clock; it now also carries the period's end and Apple's
 * auto-renew flag, which the 18 Aug migration added for exactly this
 * sentence — "renews on the 14th" versus "ends on the 14th" — and which
 * must never decide entitlement (turning auto-renew off means *do not
 * charge me again*, not *cut me off now*).
 *
 * ── The four sentences ───────────────────────────────────────────────────────
 *
 *   not certain            → null      (the row keeps its neutral name; a
 *                                       status the server could not read is
 *                                       not a status)
 *   not live               → "Not subscribed"
 *   live, no period end    → "Active"  (a comped or lifetime grant: nothing
 *                                       more is true)
 *   live, renewing         → "Active — renews Oct 20, 2026"
 *   live, not or unknown   → "Active until Oct 20, 2026"
 *
 * ⚠ `renews === null` reads as "until", not "renews": Apple has not said,
 * and a renewal the phone announced on its own is a charge nobody promised.
 */
export interface SubscriptionStanding {
  live: boolean;
  certain: boolean;
  /** ISO timestamp the current period ends; null for no expiry, or not live. */
  until?: string | null;
  /** Apple's auto-renew flag; null when never told. Display only. */
  renews?: boolean | null;
}

export function subscriptionStatusLine(standing: SubscriptionStanding): string | null {
  if (!standing.certain) return null;
  if (!standing.live) return 'Not subscribed';
  const until = standing.until ?? null;
  if (!until) return 'Active';
  const when = formatDate(until);
  return standing.renews === true ? `Active — renews ${when}` : `Active until ${when}`;
}
