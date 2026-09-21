/**
 * The shape of a health recommendation — what the model is asked for, and
 * what is stored whatever it answered.
 *
 * ── The finding (Cowork, 21 Sep) ─────────────────────────────────────────────
 *
 * Every recommendation on every real car began with the same clause,
 * including the one that then asked the owner to *upload* a service history:
 *
 *   "Based on your provided service history, upload past maintenance
 *    invoices or log completed services to establish an accurate baseline…"
 *
 * Not a model quirk: the prompt said *frame all recommendations as "based on
 * your provided service history"*, and a model given a phrasing mandate obeys
 * it literally on every element. We asked for a prefix and we got a prefix.
 *
 * The intent behind it is right and stays: reason only from documented
 * records, never invent a fault. That is a constraint on *substance*, and
 * the prompt now says it that way. This module is the belt to that brace —
 * it does not trust the rewording alone:
 *
 *   - a recommendation that still arrives with the preamble loses it, and
 *     the basis stays stated once, in the summary, where it belongs;
 *   - a car with **no history on file** gets one honest first line — "Add
 *     your service history — Tappet can't assess what it can't see." — said
 *     once, and never the self-contradicting version that cites the history
 *     it is asking for.
 *
 * ⚠ The recommendation, not the summary. The summary is allowed to name the
 * basis of the assessment; that is the one place it belongs.
 */

export const NO_HISTORY_RECOMMENDATION = "Add your service history — Tappet can't assess what it can't see.";

/** The clause the old prompt mandated, in the spellings the model produced. */
const PREAMBLE = /^\s*based on (?:your|the|their) (?:provided |documented )?(?:service )?(?:history|records|service history)\s*[,:—-]\s*/i;

/** Drops the shared preamble and restores the capital it was carrying. */
export function withoutPreamble(text: string): string {
  const stripped = text.replace(PREAMBLE, '');
  if (stripped === text) return text.trim();
  const rest = stripped.trim();
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

/**
 * The stored list: preambles gone, blanks gone, and — when nothing is on
 * file — the honest first line, once. A model line that already asks for the
 * history (it mentions "service history", "invoices" or "records") is taken
 * as that line's own wording and not doubled.
 */
export function shapeRecommendations(
  recommendations: ReadonlyArray<unknown>,
  { historyOnFile }: { historyOnFile: boolean }
): string[] {
  const lines = recommendations
    .filter((r): r is string => typeof r === 'string')
    .map(withoutPreamble)
    .filter((r) => r.length > 0);
  if (historyOnFile) return lines;

  const asksForHistory = (line: string) => /service history|invoice|maintenance record|log completed/i.test(line);
  const rest = lines.filter((line) => !asksForHistory(line));
  return [NO_HISTORY_RECOMMENDATION, ...rest];
}
