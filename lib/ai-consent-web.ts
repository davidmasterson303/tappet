import { AI_CONSENT_LEGACY_KEY, AI_CONSENT_STORAGE_KEY } from '@tappet/core/ai-consent-copy';

/**
 * This browser's answer to "may Tappet send your data to Google's AI" — one
 * module, so the advisor, the upload dialog, the health score and sign-out
 * cannot disagree about where it lives.
 *
 * ── Audit 360 (1 Oct) ───────────────────────────────────────────────────────
 *
 * - **LEGAL-7.** The answer sat under a per-browser key with no account in it,
 *   and `signOutAndClearCache` never touched it: on a family computer, A's yes
 *   answered B's sheet and B's records went to Google on A's answer. The phone
 *   fixed the same defect on 23 Sep (`forget-account.ts`). `clearWebAiConsent`
 *   is now part of sign-out.
 * - **LEGAL-1.** The health score read no answer at all; it reads this now.
 * - The key is versioned with the sheets' new words — `AI_CONSENT_STORAGE_KEY`
 *   carries why.
 *
 * Every accessor is wrapped: storage can be blocked or throw, and a read that
 * fails is `unknown`, which asks. Proceeding on a consent we cannot
 * demonstrate is the thing to avoid.
 */
export type WebAiConsent = 'granted' | 'declined' | 'unknown';

export function readWebAiConsent(): WebAiConsent {
  try {
    const stored = window.localStorage.getItem(AI_CONSENT_STORAGE_KEY);
    return stored === 'granted' || stored === 'declined' ? stored : 'unknown';
  } catch {
    return 'unknown';
  }
}

export function recordWebAiConsent(answer: 'granted' | 'declined'): void {
  try {
    window.localStorage.setItem(AI_CONSENT_STORAGE_KEY, answer);
  } catch {
    // A write that fails means the sheet appears again. The safe direction.
  }
}

/** Sign-out: the answer was this person's; the next account gives its own. */
export function clearWebAiConsent(): void {
  try {
    window.localStorage.removeItem(AI_CONSENT_STORAGE_KEY);
    window.localStorage.removeItem(AI_CONSENT_LEGACY_KEY);
  } catch {
    // Storage that throws here threw on the write too, so there is no answer to inherit.
  }
}
