import { resetCarSet } from '../components/switcher/car-set';
import { forgetAllVehicles } from '../navigation/last-vehicle';
import { clearAiConsent } from '../onboarding/ai-consent';
import { clearEverHadVehicle } from '../onboarding/first-run-storage';
import { clearPrimerDismissed } from '../notifications/register';

/**
 * Everything on this phone that belonged to the account, not the device.
 *
 * ── 23 Sep · the next account inherited the last one's car ──────────────────
 *
 * `App.tsx` unmounts the navigator on sign-out, and that was all it did.
 * Two module-level holds survived it — the last opened car (`last-vehicle`)
 * and the switcher's set (`car-set`) — so account B, signed in on the same
 * phone after A, was steered by the tab bar to A's car (a 404), and saw the
 * switcher seeded with A's names and scores until its own read landed. Three
 * per-install flags survived too: A's AI consent answered B's consent sheet,
 * A's "not now" hid B's push primer, and A's first-run mark skipped B's.
 *
 * The device id stays: it names the phone, and `unregisterPush` has already
 * removed the token row it keyed. Declined-mod lists are keyed per vehicle
 * and die with the vehicle, so they are not an account's.
 *
 * Called before `signOut()` resolves and again when the session simply ends,
 * so a server-side sign-out clears the same things a tap does.
 */
export async function forgetThisAccount(): Promise<void> {
  resetCarSet();
  forgetAllVehicles();
  await Promise.all([clearAiConsent(), clearEverHadVehicle(), clearPrimerDismissed()]);
}
