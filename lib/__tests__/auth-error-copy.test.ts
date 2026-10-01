/**
 * The web's sign-in, sign-up and password pages speak Tappet's sentences,
 * never the auth library's.
 *
 * @jest-environment node
 *
 * Audit 360, COPY-24 (1 Oct). The four pages showed `signInError.message`,
 * `resetError.message`, `updateError.message` and `err?.message` — "Auth
 * session missing!", "Email not confirmed", "For security purposes, you can
 * only request this after 59 seconds.", and on a dropped connection the
 * browser's "Failed to fetch". These errors are built with auth-js's own
 * classes, so a change in how the library shapes them is a change this
 * suite sees.
 *
 * ⚠ Sign-in's single sentence for every credential refusal is decided
 * (frame.md, *Decided*; `mobile-session.test.ts`). It is pinned here to the
 * phone's own words, read from its source.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
  AuthWeakPasswordError,
} from '@supabase/auth-js';
import { isDeveloperSpeak } from '@tappet/core/customer-copy';

import { SIGN_IN_DID_NOT_MATCH, authErrorSentence, type AuthFlow } from '@/lib/api-error-copy';

const ROOT = join(__dirname, '..', '..');
const FLOWS: AuthFlow[] = ['sign-in', 'sign-up', 'reset-request', 'new-password', 'resend'];

/* What the library and the browser put in `.message`, as they ship. */
const LIBRARY = [
  new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
  new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'),
  new AuthApiError('User not found', 400, 'user_not_found'),
  new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'),
  new AuthApiError('For security purposes, you can only request this after 59 seconds.', 429, 'over_email_send_rate_limit'),
  new AuthApiError('New password should be different from the old password.', 422, 'same_password'),
  new AuthApiError('User already registered', 422, 'user_already_exists'),
  new AuthApiError('Unable to validate email address: invalid format', 400, 'email_address_invalid'),
  new AuthApiError('Database error saving new user', 500, 'unexpected_failure'),
  new AuthWeakPasswordError('Password should be at least 6 characters.', 422, ['length']),
  new AuthSessionMissingError(),
  new AuthRetryableFetchError('Failed to fetch', 0),
  new AuthRetryableFetchError('Service Unavailable', 503),
  new TypeError('Failed to fetch'),
  new TypeError('Load failed'),
  new TypeError('NetworkError when attempting to fetch resource.'),
  undefined,
  'a string',
];

describe('authErrorSentence', () => {
  it.each(FLOWS)('never echoes the library or the browser on %s', (flow) => {
    for (const error of LIBRARY) {
      const sentence = authErrorSentence(error, flow);
      const theirs = error instanceof Error ? error.message : '';
      if (theirs) expect(sentence).not.toContain(theirs);
      expect(sentence).not.toMatch(/!|failed to fetch|load failed|auth session|security purposes|please/i);
      expect(sentence).toMatch(/^[A-Z]/);
      expect(sentence).toMatch(/\.$/);
      expect(isDeveloperSpeak(sentence)).toBe(false);
    }
  });

  describe('sign-in is not an account-existence oracle', () => {
    const CREDENTIAL_REFUSALS = [
      new AuthApiError('Invalid login credentials', 400, 'invalid_credentials'),
      new AuthApiError('Email not confirmed', 400, 'email_not_confirmed'),
      new AuthApiError('User not found', 400, 'user_not_found'),
      // An older GoTrue sends no code; the message is all there is.
      new AuthApiError('Invalid login credentials', 400, undefined),
      new AuthApiError('Email not confirmed', 400, undefined),
    ];

    it('says one thing for a wrong password, an unknown address and an unconfirmed one', () => {
      const said = new Set(CREDENTIAL_REFUSALS.map((e) => authErrorSentence(e, 'sign-in')));
      expect(Array.from(said)).toEqual([SIGN_IN_DID_NOT_MATCH]);
    });

    it('says it in the phone’s words, so the two clients cannot differ', () => {
      const phone = readFileSync(join(ROOT, 'apps', 'mobile', 'src', 'auth', 'session.ts'), 'utf8');
      expect(phone).toContain(`'${SIGN_IN_DID_NOT_MATCH}'`);
    });

    it('does not mistake a dropped connection for a wrong password (anti-vacuous)', () => {
      expect(authErrorSentence(new TypeError('Failed to fetch'), 'sign-in')).not.toBe(SIGN_IN_DID_NOT_MATCH);
      expect(authErrorSentence(new AuthRetryableFetchError('Load failed', 0), 'sign-in')).toMatch(/connection/);
    });
  });

  describe('a request that may not have arrived (L3)', () => {
    it('names the connection only when nothing reached Tappet', () => {
      for (const flow of FLOWS) {
        expect(authErrorSentence(new AuthRetryableFetchError('Service Unavailable', 503), flow)).not.toMatch(/connection/i);
        expect(authErrorSentence(new AuthApiError('Database error saving new user', 500, 'unexpected_failure'), flow)).not.toMatch(
          /connection/i
        );
      }
    });

    it('tells someone whose sign-up may have landed to look before signing up again', () => {
      const sentence = authErrorSentence(new TypeError('Failed to fetch'), 'sign-up');
      expect(sentence).toMatch(/may already have been made/);
      expect(sentence).toMatch(/before signing up again/);
    });

    it('never says a reset email or a new password went or did not go when it cannot know', () => {
      expect(authErrorSentence(new TypeError('Load failed'), 'reset-request')).toMatch(/may not have been sent/);
      expect(authErrorSentence(new TypeError('Load failed'), 'new-password')).toMatch(/may not have been saved/);
    });
  });

  it('says what to do for each refusal it can name', () => {
    expect(authErrorSentence(new AuthSessionMissingError(), 'new-password')).toMatch(/link has expired or was already used/);
    expect(
      authErrorSentence(new AuthApiError('New password should be different from the old password.', 422, 'same_password'), 'new-password')
    ).toMatch(/already the password on this account/);
    expect(authErrorSentence(new AuthWeakPasswordError('Password should be at least 6 characters.', 422, ['length']), 'sign-up')).toMatch(
      /at least 6 characters/
    );
    expect(authErrorSentence(new AuthApiError('User already registered', 422, 'user_already_exists'), 'sign-up')).toMatch(
      /already an account/
    );
    expect(
      authErrorSentence(
        new AuthApiError('For security purposes, you can only request this after 59 seconds.', 429, 'over_email_send_rate_limit'),
        'reset-request'
      )
    ).toMatch(/Wait a minute/);
    expect(authErrorSentence(new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'), 'sign-in')).toMatch(
      /Wait a minute/
    );
  });
});

describe('the four pages use it (COPY-24)', () => {
  const PAGES: Array<[string, AuthFlow[]]> = [
    ['app/login/page.tsx', ['sign-in']],
    ['app/signup/page.tsx', ['sign-up', 'resend']],
    ['app/forgot-password/page.tsx', ['reset-request']],
    ['app/reset-password/page.tsx', ['new-password']],
  ];

  it.each(PAGES)('%s', (page, flows) => {
    const source = readFileSync(join(ROOT, ...page.split('/')), 'utf8');
    expect(source).toContain(`import { authErrorSentence } from '@/lib/api-error-copy';`);
    for (const flow of flows) expect(source).toContain(`'${flow}')`);
    expect(source).not.toMatch(/Something went wrong\. Please try again\./);
    expect(source).not.toMatch(/Incorrect email or password/);
  });
});
