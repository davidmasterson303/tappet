import type { PaidFeature } from '@tappet/core/paid-features';

/**
 * How a screen asks for the paywall — E6's wire, mobile half.
 *
 * ── Why one function and a subscription, not a prop through four stacks ─────
 *
 * The gate refuses in four places on the server, and the app has four tab
 * stacks that each mount their own copies of the advisor and the invoice
 * scanner. Threading an `onUpgrade` callback down to every one of them would
 * be a prop that five navigators carry and no screen reads for anything but
 * this. A screen that receives `code: 'needs-subscription'` calls
 * `requestUpgrade(feature)`; `PaywallHost`, mounted once beside the root
 * navigator, listens and opens. That is the whole contract.
 *
 * ── ⚠ Not a decision about entitlement ──────────────────────────────────────
 *
 * This carries a request to *show* the paywall. It does not know whether
 * the account is paid and must never learn: the server said no, the screen
 * relayed it, and what happens next is `usePaywall.ts` asking StoreKit and
 * the server in turn. `grantsAccess` is the resolver's alone.
 */

export type UpgradeRequest = {
  /** The feature that was refused, or `null` when opened from settings. */
  feature: PaidFeature | null;
};

type Listener = (request: UpgradeRequest) => void;

const listeners = new Set<Listener>();

/**
 * Ask for the paywall.
 *
 * Returns whether anything was listening — a screen has nothing to do with
 * the answer today, but a `false` in a log is how "the host is not mounted"
 * gets found before a customer finds it.
 */
export function requestUpgrade(feature: PaidFeature | null = null): boolean {
  const request: UpgradeRequest = { feature };
  for (const listener of [...listeners]) listener(request);
  return listeners.size > 0;
}

/** The host's half. Returns the unsubscribe. */
export function onUpgradeRequested(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
