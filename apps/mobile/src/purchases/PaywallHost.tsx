import PaywallScreen from '../screens/PaywallScreen';
import { usePaywall } from './usePaywall';

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
  const paywall = usePaywall({ onEntitled });
  const catalog = paywall.catalog;

  return (
    <PaywallScreen
      visible={paywall.visible}
      feature={paywall.feature}
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
