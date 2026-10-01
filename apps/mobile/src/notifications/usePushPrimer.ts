import { useCallback, useEffect, useState } from 'react';
import { shouldShowPushPrimer } from '@tappet/core/push-priming';
import {
  currentPushPermission,
  primerDismissedOn,
  recordPrimerDismissed,
  registerForPush,
} from './register';

/**
 * Whether to offer the push primer now, and what its two answers do.
 *
 * ── 23 Sep · the primer had no host ─────────────────────────────────────────
 *
 * This logic lived inline in `GarageScreen`, which was the one screen that
 * knew how many cars the owner had. The 22 Sep ship removed the Garage tab
 * and the 23 Sep switcher took the garage out of the navigator — and with it
 * the only `<PushPrimer>` in the tree. `RootNavigator` registers silently
 * only when permission is already `granted`, so a fresh install was
 * `undetermined` forever: no primer, no system dialog, no token filed, and
 * every recall, service-due and tire alert the product promises went to
 * nobody. `push-primer-wiring.test.ts` stayed green because it scanned the
 * garage's source, not the navigator's tree — CLAUDE.md §5 and §7 in one.
 *
 * The rule now has one home, and the host is the car's own page: the first
 * screen an owner sees with a car on it, which is exactly when "alerts about
 * this car" has something to be about.
 *
 * `vehicleCount` is `null` while unknown. The effect waits for a real count
 * rather than reading zero-while-loading, which would suppress the primer on
 * every launch and the screen would never appear at all.
 */
export function usePushPrimer(
  vehicleCount: number | null,
  /**
   * Something else is asking, or about to (audit 360, UX-16 / UX-4, 1 Oct).
   * While held the primer does not open; once it has opened, a hold arriving
   * later does not pull it from under the owner's thumb. The car's page holds
   * it while this visit's research runs and while the health score's sheet is
   * wanted — so the first car's page asks one thing at a time, and the
   * primer asks once a reading is on screen for its alerts to be about.
   */
  hold = false,
): {
  open: boolean;
  /**
   * The owner said yes and iOS's own dialog is up (or about to be). Nothing
   * else may present until it settles: an RN Modal presents beneath
   * SpringBoard's alert, so a sheet raised now is answered unseen.
   */
  priming: boolean;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
} {
  const [eligible, setEligible] = useState(false);
  const [shown, setShown] = useState(false);
  const [answered, setAnswered] = useState(false);
  const [priming, setPriming] = useState(false);

  useEffect(() => {
    if (vehicleCount === null) return;

    let cancelled = false;

    void (async () => {
      const [permission, dismissedOn] = await Promise.all([
        currentPushPermission(),
        primerDismissedOn(),
      ]);

      if (cancelled) return;

      setEligible(
        shouldShowPushPrimer({
          permission,
          dismissedOn,
          vehicleCount,
          today: new Date().toISOString().slice(0, 10),
        }),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [vehicleCount]);

  /* Latched: shown once the hold lifts, and kept until it is answered. */
  useEffect(() => {
    if (eligible && !hold && !answered) setShown(true);
  }, [answered, eligible, hold]);

  const accept = useCallback(async () => {
    /*
      Closed first, then the system dialog. Leaving our screen up underneath
      Apple's puts two asks on screen at once, and the person answers the one
      they can see while the other waits — which reads as the app arguing with
      itself. `priming` covers the dialog itself, for the same reason.
    */
    setAnswered(true);
    setPriming(true);
    try {
      await registerForPush();
    } finally {
      setPriming(false);
    }
  }, []);

  const decline = useCallback(async () => {
    setAnswered(true);
    // Records a date, not a boolean, so the cooldown can expire and somebody
    // who was busy today can still be asked next month.
    await recordPrimerDismissed(new Date().toISOString().slice(0, 10));
  }, []);

  return { open: shown && !answered, priming, accept, decline };
}
