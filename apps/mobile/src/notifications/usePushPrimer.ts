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
export function usePushPrimer(vehicleCount: number | null): {
  open: boolean;
  accept: () => Promise<void>;
  decline: () => Promise<void>;
} {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (vehicleCount === null) return;

    let cancelled = false;

    void (async () => {
      const [permission, dismissedOn] = await Promise.all([
        currentPushPermission(),
        primerDismissedOn(),
      ]);

      if (cancelled) return;

      setOpen(
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

  const accept = useCallback(async () => {
    /*
      Closed first, then the system dialog. Leaving our screen up underneath
      Apple's puts two asks on screen at once, and the person answers the one
      they can see while the other waits — which reads as the app arguing with
      itself.
    */
    setOpen(false);
    await registerForPush();
  }, []);

  const decline = useCallback(async () => {
    setOpen(false);
    // Records a date, not a boolean, so the cooldown can expire and somebody
    // who was busy today can still be asked next month.
    await recordPrimerDismissed(new Date().toISOString().slice(0, 10));
  }, []);

  return { open, accept, decline };
}
