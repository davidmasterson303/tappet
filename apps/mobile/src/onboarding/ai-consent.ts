import { AI_CONSENT_LEGACY_KEY, AI_CONSENT_STORAGE_KEY } from '@tappet/core/ai-consent-copy';
import { secureStorage } from '../auth/secure-storage';

/**
 * Whether this person has agreed that their data may go to a third-party AI.
 *
 * ── ⚠ Why this exists: Guideline 5.1.2(i), amended November 2025 ────────────
 *
 * Apple now requires **explicit permission** before personal data is shared
 * with a third-party AI — not disclosure, permission. Tappet has the
 * disclosure: the privacy policy names Google and says what goes there. The
 * only *consent* was sign-up wrap, which is not what the amendment asks for.
 *
 * It matters most on the screen where it was least visible. `InvoiceScanScreen`
 * photographs a document carrying **a third party's name and business address**
 * — sometimes a VIN — and sends it to Gemini, and said nothing about Google at
 * all.
 *
 * ── ⚠ Refusal must not block the app ────────────────────────────────────────
 *
 * Refusing means *"no AI features"*, never *"no app"*. Blocking the product on
 * a privacy refusal would trade a 5.1.2 problem for a 5.1.1(v)-shaped one — and
 * it would be the wrong thing to do regardless: the garage, the service history
 * and the recall list are all useful without a model.
 *
 * So this is a **three-state** answer and not a boolean. "Not asked" and
 * "declined" are different: the first means show the sheet, the second means do
 * not ask again and keep the AI surfaces out of the way.
 *
 * ── Stored per install, like `first-run-storage` ────────────────────────────
 *
 * `secureStorage` is not chosen for secrecy — it is the storage this app
 * already has, and a second persistence mechanism costs a native module and a
 * build on this platform. Same reasoning, same place.
 *
 * ⚠ A read failure resolves to `unknown`, which shows the sheet again. Asking
 * twice is a mild annoyance; **proceeding on a consent we cannot demonstrate is
 * the thing the amendment is about**, so the failure direction is the one that
 * asks.
 */

export type AiConsent = 'granted' | 'declined' | 'unknown';

/*
  ⚠ Versioned (audit 360, 1 Oct). Every AI path on the phone reads this one
  answer — the advisor, the scan, and now the health score — and the sheets
  that wrote the old key did not say so (the advisor's promised "no
  photographs", then opened the scan). An answer given under those words is
  not this answer, so the key moved and everyone is asked once more.
  `AI_CONSENT_STORAGE_KEY` carries the argument.
*/
const KEY = AI_CONSENT_STORAGE_KEY;

export async function readAiConsent(): Promise<AiConsent> {
  try {
    const stored = await secureStorage.getItem(KEY);
    if (stored === 'granted' || stored === 'declined') return stored;
    return 'unknown';
  } catch {
    // Unknown behaves as "ask" — see the note above.
    return 'unknown';
  }
}

export async function recordAiConsent(answer: 'granted' | 'declined'): Promise<void> {
  try {
    await secureStorage.setItem(KEY, answer);
  } catch {
    /*
      Swallowed, like `recordEverHadVehicle`. A write that fails means the sheet
      appears again next time, which is the safe direction — and there is
      nothing useful to tell somebody who has just answered a consent question
      about a storage error.
    */
  }
}

/**
 * A *Not now* to one of the AI sheets — read before write (audit 360, UX-23).
 *
 * ⚠ A screen that lives for the app's lifetime holds a copy of the answer it
 * read, and a sheet raised off a stale copy asks a question already answered
 * elsewhere. One answer covers all of Tappet's AI, so a *Not now* written
 * blindly there would silently undo a yes the owner gave a minute earlier on
 * another tab — the yes they gave is gone and nothing said it would be.
 *
 * So the stored answer is read first: a standing yes is kept (this *Not now*
 * answered this sheet, and the screen honours it for the visit), anything
 * else becomes `declined`. Resolves to what is stored afterwards. The app has
 * no path that turns a yes into a no from these sheets — every sheet is raised
 * only when the answer it read is not `granted` — so this refuses nothing an
 * owner could mean.
 */
export async function declineAiConsent(): Promise<'granted' | 'declined'> {
  if ((await readAiConsent()) === 'granted') return 'granted';
  await recordAiConsent('declined');
  return 'declined';
}

/** Sign-out. Consent was this person's; the next account on the phone gives its own. */
export async function clearAiConsent(): Promise<void> {
  try {
    await Promise.all([secureStorage.removeItem(KEY), secureStorage.removeItem(AI_CONSENT_LEGACY_KEY)]);
  } catch {
    // A failure here costs one repeated sheet, not a lost answer.
  }
}
