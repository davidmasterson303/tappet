/**
 * Whether a string a server sent is fit to show a customer.
 *
 * ⚠ **Audit 360, COPY-5 (1 Oct).** The phone put a route's `error` string in
 * an alert body as it came, and the routes answered "Internal server error",
 * "Failed to create maintenance record", "Invalid JSON body" and "Missing
 * vehicleId". The routes now answer in sentences (`lib/api-error-copy.ts`);
 * this is the phone's side of the same rule, so a route that is missed — or a
 * host that has not been promoted — still cannot put developer-speak on a
 * screen. The client's own fallback line is shown instead.
 *
 * Deliberately a list of shapes rather than "ignore every 5xx": several 5xx
 * answers are written to be shown (the advisor's `advisor-unavailable`, the
 * storage outage's "Your photo was not lost"), and throwing those away would
 * trade one wrong sentence for a vaguer one.
 *
 * Shared with `lib/__tests__/api-errors-are-customer-sentences.test.ts`, which
 * holds every `/api/v1/*` route to the same shapes, so the scanner and the
 * phone cannot disagree about what developer-speak is.
 */

/**
 * Phrases a developer writes and an owner should never read. Case-blind.
 *
 * Audit 360, COPY-15 (1 Oct): widened with "Not authenticated", "Please
 * select / wait" and "unexpected error", which the web's add-a-car flow
 * showed while the scanner walked only `/api/v1/*`.
 */
const DEVELOPER_PHRASES =
  /internal server error|invalid json|^\s*missing\b|^\s*failed to\b|^\s*invalid \w+ type\b|^\s*unknown source\b|^\s*bad request\b|^\s*upload failed\b|^\s*not authenticated\b|^\s*please (select|wait)\b|unexpected error/i;

/**
 * A field name in a sentence: `vehicleId`, `pagePaths`, `itemType`. Case
 * matters — a lower-case word running into a capital is how code spells a
 * field and how English never does. Suffixes are listed rather than any
 * camelCase, so "iPhone" and "iOS" stay sentences.
 */
const FIELD_NAME = /\b[a-z]+(?:Id|Ids|Path|Paths|Type|Url)\b/;

export function isDeveloperSpeak(text: string): boolean {
  return DEVELOPER_PHRASES.test(text) || FIELD_NAME.test(text);
}

/** `text` when it is a customer sentence; otherwise `fallback`. */
export function customerSentence(text: unknown, fallback: string): string {
  return typeof text === 'string' && text.trim() !== '' && !isDeveloperSpeak(text) ? text : fallback;
}
