/**
 * What a failed model call means, and whether asking again can help.
 *
 * Pure. `lib/gemini.ts` knows the SDK's error shape and hands the status and
 * message here; `consultant-health.ts` hands the canary's here. One table,
 * so the advisor and the monitor cannot disagree about what a 429 is.
 *
 * ── Why this table exists — 17 Sep ──────────────────────────────────────────
 *
 * `sendConsultantMessage` caught every throw and returned one sentence, the
 * route answered it with 502, and both clients rendered "try again". That was
 * right for a cold function and wrong for everything else that throws here:
 * a stale key, a project quota, and — since the billing account went prepay on
 * 25 Aug — a balance at $0, which stops **every key on the account at once**
 * (`lib/gemini.ts` carries Google's words). Telling somebody to retry a
 * balance is advice that cannot work, and on the product path it is the only
 * thing the screen said.
 *
 * ── The three kinds ─────────────────────────────────────────────────────────
 *
 *   quota       Google's `RESOURCE_EXHAUSTED`, HTTP 429. Either the project's
 *               rate quota or the prepay balance; the response does not say
 *               which, and for the person asking it does not matter — nothing
 *               they do changes it. ⚠ This is **not our own limiter**: ours
 *               answers 429 to the client before a model is called and never
 *               arrives as a throw. Google's does. Keeping them apart is the
 *               whole reason this file exists.
 *   credential  the key is wrong, missing or stale. §22's lesson stands — the
 *               markers are not reliably distinguishable from one another and
 *               do not need to be, because the advice is the same: not yours.
 *   transient   Google overloaded or slow (`UNAVAILABLE`, `DEADLINE_EXCEEDED`,
 *               `INTERNAL`, the 5xx range), or a throw nothing here recognises.
 *               Retrying is honest advice here, and it is the only kind where
 *               it is.
 *
 * `unknown` is folded into `transient` on purpose. A throw this table cannot
 * name — our own database, a bug — is one where "try again" is the safe
 * default, because it is what the product said before and might be true.
 */

export type ModelFailureKind = 'quota' | 'credential' | 'transient';

export interface ModelFailure {
  kind: ModelFailureKind;
  /** Whether the person who asked can do anything by asking again. */
  retryable: boolean;
  /** The HTTP status the SDK reported, when it reported one. */
  status: number | null;
  /** The Google status token that decided it, when one was present. */
  marker: string | null;
}

/**
 * Google's own token for a spent quota — the project's, or the prepay balance.
 *
 * Exported so the canary can name it in its detail line: a `degraded` that
 * says `RESOURCE_EXHAUSTED` is the one that means "check the balance", and the
 * CI log is where somebody reads that.
 */
export const QUOTA_MARKER = 'RESOURCE_EXHAUSTED';

/**
 * Google error markers that mean our credential is wrong, missing or stale.
 *
 * Shared with `consultant-health.ts`, which held them first. All four are one
 * verdict — see the file header.
 */
export const CREDENTIAL_MARKERS = [
  'UNAUTHENTICATED',
  'ACCESS_TOKEN_TYPE_UNSUPPORTED',
  'API_KEY_INVALID',
  'PERMISSION_DENIED',
] as const;

/**
 * Decide what a thrown model call means.
 *
 * The status is read first and the message second, because the SDK sets
 * `status` from the HTTP code and stringifies Google's JSON body into
 * `message` — so a 429 is a 429 whether or not the body survived. The message
 * is still read: a `RESOURCE_EXHAUSTED` inside a streamed chunk arrives with
 * its own code, and a credential marker can ride on a 400.
 */
export function classifyModelFailure({
  status,
  message,
}: {
  status?: number | null;
  message?: string | null;
}): ModelFailure {
  const text = message ?? '';
  const code = typeof status === 'number' && Number.isFinite(status) ? status : null;

  if (code === 429 || text.includes(QUOTA_MARKER)) {
    return { kind: 'quota', retryable: false, status: code, marker: QUOTA_MARKER };
  }

  const credential = CREDENTIAL_MARKERS.find((marker) => text.includes(marker));
  if (credential || code === 401 || code === 403) {
    return { kind: 'credential', retryable: false, status: code, marker: credential ?? null };
  }

  return { kind: 'transient', retryable: true, status: code, marker: null };
}
