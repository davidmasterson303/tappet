/**
 * The sentences an `/api/v1/*` route answers with when it fails — the words a
 * phone puts in an alert body.
 *
 * ⚠ **Audit 360, COPY-5 (1 Oct).** The phone shows a route's `error` string
 * verbatim (`apps/mobile/src/api/client.ts`), and the routes answered with
 * the strings a developer writes: "Internal server error", "Failed to create
 * maintenance record", "Invalid JSON body", "Missing vehicleId". Removing a
 * Needs item during a database hiccup showed an alert titled "Could not remove
 * that" whose body was "Internal server error" — copy that only appears on
 * failure, which is the shape CLAUDE.md §1 records ("Failed to add item to
 * wishlist"). Build-2 phones display these as they are, so the server's words
 * are the only fix that reaches them; build 3 also refuses developer-speak on
 * its side (`@tappet/core/customer-copy`).
 *
 * Each says what happened and what to do; none blames the connection, because
 * a route that answered was reached.
 *
 * `lib/__tests__/api-errors-are-customer-sentences.test.ts` scans every route
 * for an `error:` literal that reads as developer-speak.
 */

import { customerSentence } from '@tappet/core/customer-copy';

/**
 * A request the route could not read — a malformed body or a missing field.
 * Only a client bug or an old build sends one, so the remedy is the app, and
 * the route refused before touching anything.
 */
export const UNREADABLE_REQUEST =
  'Tappet could not read that request, so nothing was changed. Updating the app may fix it.';

/** A write that failed on our side. The thing was not saved. */
export const COULD_NOT_SAVE = 'Tappet could not save that just now. Try again in a moment.';

/** A read that failed on our side. `what` is the thing, as an owner says it. */
export function couldNotLoad(what: string): string {
  return `Tappet could not load ${what} just now. Try again in a moment.`;
}

/*
 * ── Audit 360, COPY-15 (1 Oct) · the web's server actions ───────────────────
 *
 * `app/actions.ts` answered the website with the same developer-speak the
 * routes once did — "Not authenticated", "Failed to save vehicle", "An
 * unexpected error occurred", and in places the database's own message after
 * a colon. The add-a-car wizard shows `result.error` as it comes. These are
 * the web's sentences; the scanner now walks that file and the wizard too.
 */

/** The session has gone; the remedy is signing in, not retrying. */
export const NOT_SIGNED_IN = 'You are signed out. Sign in again to continue.';

/** A delete that did not happen. */
export const COULD_NOT_REMOVE = 'Tappet could not remove that just now. Try again in a moment.';

/** A file or photo that did not upload. */
export const COULD_NOT_UPLOAD = 'Tappet could not upload that file just now. Try again in a moment.';

/** A page sent something the action could not read; the page, not the app, is the remedy. */
export const UNREADABLE_PAGE_REQUEST =
  'Tappet could not read that request, so nothing was changed. Reload the page and try again.';

/** An invoice the model could not read into line items. */
export const COULD_NOT_READ_INVOICE =
  'Tappet could not read that invoice. Try again with a clearer photo or PDF.';

/** Something Tappet writes or works out — a summary, an estimate, a draft. */
export function couldNotMake(what: string): string {
  return `Tappet could not put together ${what} just now. Try again in a moment.`;
}

/*
 * ── Audit 360, COPY-19 (1 Oct) · the web's components ───────────────────────
 *
 * COPY-15 made the server actions answer in sentences, and the components
 * threw them away: "Failed to mark issue as fixed" where the action said
 * "Tappet could not save that just now", "Failed to update health summary"
 * where it said wait a minute — and in places a thrown exception's own text
 * ("Failed to fetch"). A component now shows the action's `error` when it is
 * a customer sentence and its own fallback otherwise, and never shows an
 * exception's message.
 */

/** The action's `error`, when it is fit to show; otherwise `fallback`. */
export function answerSentence(result: unknown, fallback: string): string {
  const error = result && typeof result === 'object' ? (result as { error?: unknown }).error : undefined;
  return customerSentence(error, fallback);
}

/**
 * A request that threw before it answered. It may have reached Tappet, so
 * nothing is promised either way: the page is the place to check.
 */
export const NO_ANSWER =
  'Tappet did not answer, so that may not have gone through. Reload the page to check before trying again.';
