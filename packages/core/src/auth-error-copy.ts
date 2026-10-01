/**
 * What an auth form says when Supabase's auth service refuses or fails — on
 * the web's four auth pages and the phone's sign-up.
 *
 * ⚠ **Audit 360, COPY-30 (1 Oct) · moved here from `lib/api-error-copy.ts`.**
 * The phone's `signUp` returned GoTrue's own message on purpose — its
 * docblock argued that "password too short", "already registered" and
 * "invalid email" need different actions. True, and the map below gives each
 * its own sentence, so the argument survives. What it also returned was the
 * library's English ("Password should be at least 6 characters.") and, on a
 * 5xx, the literal two characters `{}`: auth-js builds a retryable error's
 * message with `JSON.stringify(response)`, and a `Response` stringifies to
 * `{}`. `lib/` is not importable from the phone, so the map lives in core;
 * `lib/api-error-copy.ts` re-exports it for the web's pages.
 *
 * Reads only `code`, `name`, `status` and (for code-less older servers) the
 * message — no Supabase import, no Node built-in.
 */

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
