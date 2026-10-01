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
