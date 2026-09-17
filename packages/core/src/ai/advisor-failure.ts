/**
 * The ways an advisor turn ends without an answer, and which of them a person
 * can do anything about.
 *
 * ── One status was carrying three meanings — 17 Sep ─────────────────────────
 *
 * `app/api/v1/consultant/route.ts` answered everything that was not a feature
 * refusal with **502**, and the phone rendered 502 as "could not answer that
 * one — try again". The web did the same with `result.error` thrown away. So a
 * spent monthly allowance, a stale key, a prepay balance at $0 and the demo's
 * "that is not one of my questions" all read as a hiccup worth retrying.
 * Retrying is wrong advice for every one of them — a clock, a credential, a
 * balance and a fixed list are not fixed by asking twice — and on the demo it
 * put "Sorry, I encountered an error" under Jay's byline for any typed
 * question, which is what a recruiter sees one keystroke in (seen live, 17 Sep).
 *
 * E6's wire already made the argument for the gate: a refusal carries a
 * `code` beside its sentence, and a client branches on the code rather than
 * the status. This file is that wire extended to the other three, in one
 * place, so the route, the web thread and the phone screen cannot disagree
 * about which failures are worth a retry.
 *
 * ── The codes ───────────────────────────────────────────────────────────────
 *
 *   needs-subscription   the feature gate (`lib/feature-gate.ts`). Off today.
 *   budget-exhausted     the account's monthly allowance is spent. The
 *                        sentence is `budgetMessage` — it names the reset date.
 *   advisor-unavailable  the model call threw for a reason retrying cannot
 *                        fix: Google's quota or the prepay balance, or a
 *                        rejected credential (`ai/model-failure.ts`).
 *   demo-unanswered      the demo answers a fixed set of questions and this
 *                        was not one (`demo-answers.ts`).
 *
 * A transient failure — Google overloaded, a cold function, a throw nothing
 * recognises — carries **no code**. That absence is the contract: only a
 * failure without a code is one the client may invite a retry on.
 *
 * ── Why the sentences travel from the server ────────────────────────────────
 *
 * `access.ts` gives the reason for `refusalCopy`: two clients explaining one
 * refusal differently are two clients telling somebody different things. So
 * every coded failure ships its sentence, written to be shown verbatim, and a
 * client's job is to show it rather than to substitute its own.
 */

import { ADVISOR_NAME } from '../prompts';

export const ADVISOR_FAILURE_CODES = [
  'needs-subscription',
  'budget-exhausted',
  'advisor-unavailable',
  'demo-unanswered',
] as const;

export type AdvisorFailureCode = (typeof ADVISOR_FAILURE_CODES)[number];

export function isAdvisorFailureCode(code: unknown): code is AdvisorFailureCode {
  return typeof code === 'string' && (ADVISOR_FAILURE_CODES as readonly string[]).includes(code);
}

/**
 * Whether a failure is one where asking again cannot help.
 *
 * True for every code this file knows. A client reads this **before** it
 * looks at the HTTP status, because the statuses overlap with ones that do
 * mean "try again": our per-minute limiter is a 429, and so is the spent
 * monthly allowance. The code is what tells them apart.
 */
export function retryCannotHelp(code: string | null | undefined): code is AdvisorFailureCode {
  return isAdvisorFailureCode(code);
}

/**
 * What the product says when the model cannot be reached for a reason that
 * is ours, not the visitor's.
 *
 * ⚠ The last clause is a claim about monitoring and is only honest because
 * the monitoring is real: `.github/workflows/consultant-canary.yml` asks the
 * live advisor a question every six hours, `consultant-health.ts` classes a
 * quota or credential failure as not `good`, and the workflow turns that into
 * a red run. `advisor-failure-states.test.ts` checks all three are still
 * there before this sentence may say so. If the canary is ever retired, the
 * clause goes with it.
 *
 * No "sorry", no "error", no horizon — a balance has no reset date the
 * product can promise, and `advice-range.ts` is clear about claims the data
 * cannot support. The name is `ADVISOR_NAME`, never the literal —
 * `advice-says-it-is-generated.test.ts` says why the literal may exist once.
 */
export const ADVISOR_UNAVAILABLE_MESSAGE = `${ADVISOR_NAME} is unavailable right now. This is on our side — retrying will not help, and we are alerted to it.`;
