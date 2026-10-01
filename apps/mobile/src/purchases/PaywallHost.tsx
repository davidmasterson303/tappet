import { useEffect, useState } from 'react';
import { subscriptionStatusLine } from '@tappet/core/subscription-status';

import { getSubscription, type AccountSubscription } from '../api/account';
import PaywallScreen, { type SubscriberStanding } from '../screens/PaywallScreen';
import { usePaywall } from './usePaywall';

/**
 * The subscriber view's input, from the server's answer — or null, which
 * keeps the buy controls. Only a certain, live answer with a sentence makes
 * one: an unread subscription (`certain: false`) is not a standing.
 */
export function subscriberFrom(answer: AccountSubscription | null): SubscriberStanding | null {
  if (!answer || !answer.certain || !answer.live) return null;
  const line = subscriptionStatusLine(answer);
  if (!line) return null;
  return { line, billedByApple: answer.billedByApple !== false };
}

/**
 * The paywall, mounted once.
 *
 * Beside the root navigator rather than inside any stack, for the same reason
 * `AccountControl` is: four tab stacks each mount their own advisor, and a
 * modal that lived in one of them would be reachable from a quarter of the
 * places the gate can refuse. `usePaywall` opens it from settings or from
 * `requestUpgrade()`, and everything it renders is what the resolver
 * returned.
 *
 * ⚠ **`PaywallScreen` was built and tested on 18 Aug and mounted by nothing
 * until this.** `paid-features.ts` names that gap as the reason the gate is
 * off: a feature may only be gated behind a purchase the app can make, and
 * a paywall no navigator reached was not one.
 */
export function PaywallHost({
  onEntitled,
}: {
  /**
   * The server entitled this account, by purchase or by restore. The one
   * fact the rest of the app needs from here — `usePaywall` says who holds
   * state that goes stale on it. Optional: a host with nobody to tell is
   * still a complete paywall.
   */
  onEntitled?: () => void;
} = {}) {
  /*
    Audit 360, UX-7: what this account already holds, read on every opening
    and again after a purchase or restore entitles it, so a subscriber sees
    their standing instead of buy buttons. `getSubscription` never throws.
  */
  const [standing, setStanding] = useState<AccountSubscription | null>(null);
  const [entitledEpoch, setEntitledEpoch] = useState(0);
  const paywall = usePaywall({
    onEntitled: () => {
      setEntitledEpoch((n) => n + 1);
      onEntitled?.();
    },
  });
  const catalog = paywall.catalog;

  useEffect(() => {
    setStanding(null);
    if (!paywall.visible) return;
    let cancelled = false;
    void getSubscription().then((answer) => {
      if (!cancelled) setStanding(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [paywall.visible, entitledEpoch]);

  return (
    /*
      Keyed on the opening (20 Sep). The screen is mounted for the life of
      the app and keeps its last answer — "Your subscription is active.",
      "Nothing to restore" — so the next opening, minutes or days later,
      began by showing it. Same shape as the mark-done sheet on the plan:
      an always-mounted Modal builds its state once. A fresh mount per
      opening is the whole fix; the catalogue lives in `usePaywall`, so
      nothing is re-fetched.
    */
    <PaywallScreen
      key={paywall.visible ? 'open' : 'closed'}
      visible={paywall.visible}
      feature={paywall.feature}
      subscriber={subscriberFrom(standing)}
      /*
        The catalogue, unpacked into the screen's states. `null` is still
        loading; `ready` carries the options and `none` is the empty list —
        the same two props the screen has had since 18 Aug — and the two
        states that are not the App Store answering are flags.
      */
      options={catalog?.kind === 'ready' ? catalog.options : catalog?.kind === 'none' ? [] : null}
      loadFailed={catalog?.kind === 'failed'}
      unavailable={catalog?.kind === 'unavailable'}
      onPurchase={paywall.onPurchase}
      onRestore={paywall.onRestore}
      onClose={paywall.close}
    />
  );
}
