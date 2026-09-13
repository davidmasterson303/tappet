import { useCallback, useEffect, useRef, useState } from 'react';

import { resolvePurchase, type PurchaseResolution } from '@tappet/core/purchase-flow';
import type { PaidFeature } from '@tappet/core/paid-features';
import { verifyPurchase } from '../api/purchases';
import {
  finish,
  loadSubscriptionOptions,
  purchase,
  restore,
  type StoreResult,
  type SubscriptionCatalog,
} from '../api/store';
import { onUpgradeRequested } from './upgrade-prompt';

/**
 * The purchase flow, composed: StoreKit → the server → the resolver → StoreKit
 * again.
 *
 * Phase 6, E8. Three modules each know one thing — `api/store.ts` knows the
 * App Store, `api/purchases.ts` knows `/api/v1/iap/verify`, and
 * `@tappet/core/purchase-flow` knows what the pair of answers means — and this
 * is where they are put in order. `PaywallScreen` renders what comes back and
 * decides nothing; `PaywallHost` mounts it once, beside the root navigator.
 *
 * ── ⚠ Entitlement is never decided here ─────────────────────────────────────
 *
 * `grantsAccess` comes out of `resolvePurchase` and is passed through
 * untouched. There is no branch in this file that reads the store outcome and
 * unlocks anything, and there must not be: `purchase-flow.ts` states the
 * invariant and enumerates the matrix that keeps it.
 *
 * ── The one ordering that matters ───────────────────────────────────────────
 *
 * `finish()` runs **after** the verify call and **only** on the two answers
 * that mean the server has the transaction — `entitled` and
 * `recorded-not-entitled`. `retry-later`, `network` and `rejected` leave it
 * unfinished on purpose: StoreKit re-delivers an unfinished transaction on the
 * next launch and a restore finds it, so a purchase the server could not
 * record tonight is recorded tomorrow rather than lost. `store.ts` carries the
 * argument; `usePaywall.test.ts` holds the order.
 *
 * ── What is refreshed after an entitlement, and why it is one thing ─────────
 *
 * The app caches almost no account state: every gate answer is the server's,
 * per request — a screen that was refused retries its request and is answered
 * afresh — so there is no tier held on the device to invalidate, and a
 * `getSubscription()` here whose result nothing consumed would be a call made
 * to look thorough.
 *
 * The exception is `AccountScreen`, which reads `getSubscription()` once when
 * it is pushed and holds the answer for E5's warning that deleting the account
 * does not stop the billing. The paywall opens *over* that screen from its own
 * row, so a purchase made there would leave the warning stale for exactly the
 * person it exists for. Hence `onEntitled`: fired after a resolution whose
 * `grantsAccess` is true — the resolver's verdict, relayed and never computed
 * — and `RootNavigator` turns it into the epoch that screen re-reads on.
 */

export interface Paywall {
  /** Whether the paywall is presented. */
  visible: boolean;
  /**
   * Why it opened, when a refusal opened it. `null` from settings. The screen
   * names the feature so the person knows what they are being asked to pay
   * for, and it is the only thing this carries about the refusal.
   */
  feature: PaidFeature | null;
  /** What the store has to sell. `null` until asked; asked on every open. */
  catalog: SubscriptionCatalog | null;
  open: (feature?: PaidFeature | null) => void;
  close: () => void;
  onPurchase: (productId: string) => Promise<PurchaseResolution>;
  onRestore: () => Promise<PurchaseResolution>;
}

/**
 * Take a store result the rest of the way.
 *
 * Exported so the order can be tested without a component: the whole
 * argument of this file is a sequence, and a sequence is what a mock can
 * record.
 */
export async function settle(store: StoreResult): Promise<PurchaseResolution> {
  if (store.kind !== 'purchased') return resolvePurchase(store, null);

  const verify = await verifyPurchase(store.jwsRepresentation);
  const resolution = resolvePurchase(store, verify);

  if (verify.kind === 'entitled' || verify.kind === 'recorded-not-entitled') {
    await finish(store.purchase);
  }

  return resolution;
}

export function usePaywall({
  onEntitled,
}: {
  /**
   * The server said this account is now paid. Called once per such
   * resolution, purchase or restore, and never on any other — see the file
   * docblock for who listens and why.
   */
  onEntitled?: () => void;
} = {}): Paywall {
  const [visible, setVisible] = useState(false);
  const [feature, setFeature] = useState<PaidFeature | null>(null);
  const [catalog, setCatalog] = useState<SubscriptionCatalog | null>(null);
  /*
    The open that a catalogue belongs to. A slow `fetchProducts` answering
    after the sheet was closed and reopened would otherwise land its stale
    answer on the new open.
  */
  const opening = useRef(0);

  const open = useCallback((reason: PaidFeature | null = null) => {
    const token = ++opening.current;
    setFeature(reason);
    setCatalog(null);
    setVisible(true);

    void loadSubscriptionOptions().then((loaded) => {
      if (opening.current === token) setCatalog(loaded);
    });
  }, []);

  const close = useCallback(() => {
    opening.current += 1;
    setVisible(false);
  }, []);

  useEffect(() => onUpgradeRequested((request) => open(request.feature)), [open]);

  /*
    Held in a ref so a caller passing a fresh arrow each render does not
    change the identity of `onPurchase`/`onRestore` under the screen mid-flow.
  */
  const announce = useRef(onEntitled);
  announce.current = onEntitled;

  const relay = useCallback((resolution: PurchaseResolution) => {
    // The resolver's verdict, relayed. Nothing here reads the store outcome.
    if (resolution.grantsAccess) announce.current?.();
    return resolution;
  }, []);

  const onPurchase = useCallback(
    async (productId: string) => relay(await settle(await purchase(productId))),
    [relay]
  );
  const onRestore = useCallback(async () => relay(await settle(await restore())), [relay]);

  return { visible, feature, catalog, open, close, onPurchase, onRestore };
}
