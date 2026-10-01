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

/*
 * ── Audit 360, COPY-24 (1 Oct) · the web's sign-in, sign-up and password pages ──
 *
 * COPY-19 stopped at the door. The four auth pages put the auth library's own
 * sentences on screen — "Auth session missing!", "Email not confirmed", "For
 * security purposes, you can only request this after 59 seconds.", "New
 * password should be different from the old password." — and, on a dropped
 * connection, the browser's "Failed to fetch" (Safari: "Load failed"), which
 * auth-js wraps as `AuthRetryableFetchError` with status 0 and *returns* as
 * the call's `error` rather than throwing.
 *
 * `authErrorSentence` reads GoTrue's `code`, the error's `name` and `status`,
 * and, for older servers that send no code, the message — and never returns
 * any of them.
 *
 * ⚠ **Sign-in says one thing for a wrong password, an unknown address and an
 * unconfirmed one** — decided (frame.md, *Decided*; the phone's
 * `apps/mobile/src/auth/session.ts` and `lib/__tests__/mobile-session.test.ts`).
 * Telling them apart turns the page into a test of whether an address has an
 * account. The sentence is the phone's, word for word, so the two clients
 * cannot drift into an oracle between them.
 */

/** Which auth form is asking: the remedy differs, the facts do not. */
export type AuthFlow = 'sign-in' | 'sign-up' | 'reset-request' | 'new-password' | 'resend';

/** The phone's sentence (`session.ts`), for every credential failure. */
export const SIGN_IN_DID_NOT_MATCH = 'That email and password did not match.';

/*
 * The request never reached Tappet (status 0, or a thrown fetch). Only here
 * does a sentence name the connection (L3) — and where it may have landed
 * after all, it says what to check before doing it twice.
 */
const UNREACHED: Record<AuthFlow, string> = {
  'sign-in': 'Could not reach Tappet, so you are not signed in. Check your connection and try again.',
  'sign-up':
    'Tappet did not answer, so the account may already have been made. Check your email for a link from Tappet, or try signing in, before signing up again.',
  'reset-request':
    'Tappet did not answer, so the reset email may not have been sent. Check your inbox in a minute, then try again if nothing came.',
  'new-password':
    'Tappet did not answer, so the new password may not have been saved. Try again — if it was saved, Tappet will say so.',
  resend:
    'Tappet did not answer, so the email may not have been sent again. Check your inbox in a minute, then try again if nothing came.',
};

/* A refusal or failure on Tappet's side: nothing changed. */
const OUR_SIDE: Record<AuthFlow, string> = {
  'sign-in': 'Tappet could not sign you in just now. Try again in a moment.',
  'sign-up': 'Tappet could not make the account just now, so nothing was set up. Try again in a moment.',
  'reset-request': 'Tappet could not send the reset email just now. Try again in a moment.',
  'new-password': 'Tappet could not change the password just now, so the old one still works. Try again in a moment.',
  resend: 'Tappet could not send the email again just now. Try again in a moment.',
};

const TOO_MANY = 'Tappet has had too many tries from here just now, so it did nothing. Wait a minute, then try again.';
const TOO_MANY_EMAILS = 'Tappet has sent as many emails as it can for now, so it did not send another. Wait a minute, then try again.';
const LINK_EXPIRED =
  'This reset link has expired or was already used, so the password was not changed. Ask for a new link from Forgot password.';
const SAME_PASSWORD = 'That is already the password on this account. Sign in with it, or choose a different one.';
const WEAK_PASSWORD = 'That password is too easy to guess. Choose a longer one, at least 6 characters.';
const ALREADY_REGISTERED =
  'There is already an account for that email. Sign in, or reset the password if you have forgotten it.';
const BAD_EMAIL = 'That email address does not look right. Check it and try again.';

const NETWORK_WORDS = /failed to fetch|load failed|networkerror|network request failed|fetch failed|network|timeout|timed out/i;

/** The auth library's error, or a thrown one, as a sentence for `flow`. Never its own words. */
export function authErrorSentence(error: unknown, flow: AuthFlow): string {
  const e = (error && typeof error === 'object' ? error : {}) as {
    code?: unknown;
    name?: unknown;
    status?: unknown;
    message?: unknown;
  };
  const code = typeof e.code === 'string' ? e.code : '';
  const name = typeof e.name === 'string' ? e.name : '';
  const status = typeof e.status === 'number' ? e.status : undefined;
  const message = typeof e.message === 'string' ? e.message : '';

  // Never reached Tappet: a thrown fetch, or auth-js's status-0 wrapper.
  if (
    name === 'TypeError' ||
    (name === 'AuthRetryableFetchError' && !status) ||
    code === 'request_timeout' ||
    (!code && !status && NETWORK_WORDS.test(message))
  ) {
    return UNREACHED[flow];
  }

  if (code === 'over_email_send_rate_limit' || /security purposes|email rate limit/i.test(message)) {
    return TOO_MANY_EMAILS;
  }
  if (code === 'over_request_rate_limit' || status === 429 || /rate limit/i.test(message)) return TOO_MANY;

  // Reached Tappet and failed there (auth-js retries 502/503/504 as "retryable").
  if (name === 'AuthRetryableFetchError' || (status !== undefined && status >= 500)) return OUR_SIDE[flow];

  if (flow === 'sign-in') {
    // Every credential refusal reads the same — the oracle rule above.
    return SIGN_IN_DID_NOT_MATCH;
  }

  if (flow === 'new-password') {
    if (code === 'same_password' || /different from the old/i.test(message)) return SAME_PASSWORD;
    if (
      name === 'AuthSessionMissingError' ||
      ['session_not_found', 'session_expired', 'otp_expired', 'bad_jwt', 'refresh_token_not_found'].includes(code) ||
      /session missing|expired|invalid jwt/i.test(message)
    ) {
      return LINK_EXPIRED;
    }
  }

  if (code === 'weak_password' || name === 'AuthWeakPasswordError' || /password should/i.test(message)) {
    return WEAK_PASSWORD;
  }
  if (flow === 'sign-up' && (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(message))) {
    return ALREADY_REGISTERED;
  }
  if (code === 'email_address_invalid' || /invalid.*email|email.*invalid/i.test(message)) return BAD_EMAIL;

  return OUR_SIDE[flow];
}

/*
 * ── Audit 360, COPY-26 (1 Oct) · what a removal says when it worked ─────────
 *
 * The history's delete toast said "Deleted 1 items from invoice" for a
 * one-line invoice, and sonner's toasts are live regions, so VoiceOver spoke
 * it. It also counted every line it *tried* to remove; it now counts the ones
 * that went, and says "removed" as the phone and `COULD_NOT_REMOVE` do.
 */
export function removedInvoice(lines: number): string {
  if (lines <= 0) return 'Removed the invoice.';
  return lines === 1 ? 'Removed the invoice and its one line.' : `Removed the invoice and its ${lines} lines.`;
}
