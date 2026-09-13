import { requireOptionalNativeModule } from 'expo';
import {
  fetchProducts,
  finishTransaction,
  getAvailablePurchases,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
  restorePurchases,
  type ErrorCode,
  type ExpoPurchaseError,
  type ProductSubscription,
  type Purchase,
} from 'expo-iap';

import { PRODUCT_TIERS } from '@tappet/core/apple-subscription';
import type { StoreOutcome } from '@tappet/core/purchase-flow';
import type { SubscriptionOption } from '../screens/PaywallScreen';

/**
 * The App Store, as far as this app is allowed to know it.
 *
 * Phase 6, E8 — the last piece. This is the **only module that imports
 * `expo-iap`**, and every answer it gives is one of the `StoreOutcome`s that
 * `@tappet/core/purchase-flow` already knows how to resolve. Nothing here
 * decides that anybody is entitled: a purchase leaves this file as a signed
 * token for `verifyPurchase()` to send, and the server's verdict is the only
 * thing that unlocks anything. `purchase-flow.ts` carries that argument and
 * the matrix that keeps it true.
 *
 * ── ⚠ Three facts read from the unpacked package, not its README ────────────
 *
 * `expo-iap@5.6.0`, `build/ExpoIapModule.js` and `build/index.js`, 12 Sep:
 *
 *   1. **`import` never throws.** The native module is resolved lazily through
 *      a Proxy, so this file loads everywhere — and the first real call
 *      (`initConnection`, or even `purchaseUpdatedListener`, which needs the
 *      raw module as `this`) throws `Cannot find native module 'ExpoIap'`
 *      in Expo Go. Reproduced under jest, which has the same absence. So
 *      `storeAvailability()` is asked before anything else, and "this build
 *      cannot buy" is a **state**, not an error. It is the state of Expo Go
 *      today, and of the device build until App Store Connect has products.
 *
 *   2. **On iOS the signed transaction is `purchase.purchaseToken`** — the
 *      package calls it the "unified purchase token (iOS JWS)". That string is
 *      exactly what `verifyPurchase()` posts as `jwsRepresentation`, and the
 *      server has verified that shape since 19 Aug.
 *
 *   3. **A purchase is delivered on a listener, not returned.** The docblock on
 *      `requestPurchase` says not to rely on its return value for the outcome;
 *      `purchaseUpdatedListener` carries success and `purchaseErrorListener`
 *      carries everything else, with `error.code` drawn from `ErrorCode`. The
 *      three codes that are not failures — `user-cancelled`, `deferred-payment`
 *      / `pending`, `already-owned` — map one-to-one onto `StoreOutcome`.
 *
 * ── ⚠ Both deliveries arrive, and the pod's source says so ──────────────────
 *
 * The pod is not in the tarball, but it is pinned: `openiap-versions.json`
 * names `openiap` **3.4.0**, whose podspec points at `hyodotdev/openiap` at
 * that tag, `packages/apple/Sources/OpenIapModule.swift`. Read there, 12 Sep:
 *
 *   - `.success` **emits** `purchase-updated` and then **resolves** the
 *     `requestPurchase` promise with the same purchase.
 *   - `.userCancelled` throws `user-cancelled` and `.pending` throws
 *     `deferred-payment`; the wrapper **emits** each as `purchase-error` and
 *     then **rejects** with it. No iOS path resolves with nothing.
 *   - `purchaseToken` is `jwsRepresentation ?? transactionId` — so what is
 *     sent to the server is whatever StoreKit gave, and the server judges it.
 *     A client-side "is this a JWS" check would turn a real purchase into
 *     "you have not been charged", which is the one sentence that must not be
 *     wrong. `purchaseState` is always `purchased` on iOS; a deferred purchase
 *     arrives as the error, never as a pending purchase.
 *   - `subscriptionPeriodUnitIOS` is set for **every auto-renewable
 *     subscription** and left nil only for a non-renewing one. See `toOption`.
 *
 * So `purchase()` subscribes to both listeners, asks, and settles **once** on
 * whichever delivery crosses the bridge first — the event and the promise are
 * dispatched in a known order on the native side and arrive in no promised
 * order on this one. What the sandbox purchase still has to prove is that this
 * reading of the source matches the device; nothing here can.
 *
 * ── `finish` is a separate step, and the order is the whole point ───────────
 *
 * `finishTransaction` tells StoreKit the app has delivered what was bought.
 * Called before the server has recorded the transaction, a dropped request
 * would leave a customer charged for a subscription the account never
 * received. Left **unfinished**, StoreKit re-delivers the transaction on the
 * next launch and `getAvailablePurchases()` returns it on a restore — which is
 * the safe direction. So the caller finishes only after `verifyPurchase()`
 * answered `entitled` or `recorded-not-entitled`, and never after
 * `retry-later`, `network` or `rejected`. `usePaywall.ts` is that caller.
 *
 * ⚠ **Nothing listens at launch.** The re-delivered transaction arrives as a
 * `purchase-updated` event while no `purchase()` is in flight, so it goes to
 * no listener; Restore is what picks it up, because `getAvailablePurchases()`
 * reads `Transaction.currentEntitlements` and an unfinished live subscription
 * is one. A launch-time reconciliation is deliberately not built here — it is
 * a second path to the same server call, untestable off-device, and the
 * webhook writes the entitlement regardless. Open, and named in the roadmap.
 */

/** The two subscriptions, in the order the paywall lists them. */
const PRODUCT_IDS: readonly string[] = Object.keys(PRODUCT_TIERS);

/**
 * What the store has to sell.
 *
 * ⚠ `none` and `failed` are different answers and must not be merged. `none`
 * is "connected to the App Store, and it returned no products for our ids" —
 * which is exactly what happens until App Store Connect carries them, and
 * would be exactly what a storefront the product is not sold in returns after
 * launch. Reporting that as "could not reach the App Store, check your
 * connection" sends somebody to look at their Wi-Fi over a state of the
 * catalogue.
 */
export type SubscriptionCatalog =
  | { kind: 'ready'; options: SubscriptionOption[] }
  | { kind: 'none' }
  | { kind: 'failed' }
  | { kind: 'unavailable' };

/**
 * A store outcome that carries the purchase it came from.
 *
 * `StoreOutcome` is the resolver's input and deliberately knows nothing about
 * `expo-iap`. `finish()` needs the original `Purchase` object, so the one
 * outcome that can be finished carries it — a `StoreResult` is assignable to a
 * `StoreOutcome` wherever one is expected.
 */
export type StoreResult =
  | (Extract<StoreOutcome, { kind: 'purchased' }> & { purchase: Purchase })
  | Exclude<StoreOutcome, { kind: 'purchased' }>;

/**
 * Whether this build can talk to StoreKit at all.
 *
 * `requireOptionalNativeModule` returns `null` where the native side is absent
 * — Expo Go, a simulator without the module, a test runner. Read per call
 * rather than cached: it costs a property lookup, and a cache is one more
 * thing that can be wrong.
 */
export function storeAvailability(): 'unavailable' | 'available' {
  return requireOptionalNativeModule('ExpoIap') === null ? 'unavailable' : 'available';
}

/**
 * ── The connection, opened lazily and once ──────────────────────────────────
 *
 * Held as the promise rather than as a flag, so two callers arriving together
 * share one `initConnection()` instead of racing two. A failed open is
 * forgotten so the next call tries again rather than inheriting the failure
 * for the life of the process.
 */
let connection: Promise<boolean> | null = null;

function connect(): Promise<boolean> {
  if (!connection) {
    connection = initConnection().catch((error: unknown) => {
      connection = null;
      throw error;
    });
  }
  return connection;
}

/** What a build that cannot buy says when asked to. Also covers restore. */
const CANNOT_BUY = 'This build of Tappet cannot make or restore purchases.';

/**
 * The subscriptions on sale, with Apple's prices.
 *
 * `displayPrice` is returned **verbatim** — `PaywallScreen`'s docblock says
 * why, and it is the reason there is no price anywhere in this repository.
 */
export async function loadSubscriptionOptions(): Promise<SubscriptionCatalog> {
  if (storeAvailability() === 'unavailable') return { kind: 'unavailable' };

  let products: ProductSubscription[];
  try {
    await connect();
    /*
      Asked for `'subs'`, and narrowed again on the way in: the declared result
      is a union over every query type, and a product that is not a
      subscription has no period to render.
    */
    const returned = await fetchProducts({ skus: [...PRODUCT_IDS], type: 'subs' });
    products = (returned ?? []).filter(
      (product): product is ProductSubscription => product.type === 'subs'
    );
  } catch {
    return { kind: 'failed' };
  }

  /*
    Unknown SKUs are omitted from the result rather than thrown (the package's
    own docblock on `fetchProducts`), so an empty list is the ordinary answer
    from a storefront that does not carry the products. See `none` above.
  */
  const options = products.flatMap(toOption);
  if (options.length === 0) return { kind: 'none' };

  /*
    Declared order, not Apple's. `PRODUCT_TIERS` lists monthly then annual and
    the paywall makes the second one primary; a catalogue that came back the
    other way round would swap which button is filled.
  */
  options.sort((a, b) => PRODUCT_IDS.indexOf(a.productId) - PRODUCT_IDS.indexOf(b.productId));
  return { kind: 'ready', options };
}

/**
 * One product, as the paywall renders it — or nothing, when it cannot be
 * described honestly.
 *
 * ⚠ **The period is Apple's or it is nothing.** `subscriptionPeriodUnitIOS`
 * is set for every auto-renewable subscription and nil only for a non-renewing
 * one (the pod's `StoreKitTypesBridge`, cited in the file docblock), so a
 * product without one is misconfigured in App Store Connect — and the
 * tempting fallback, reading "month" off an id that ends `.monthly`, would put
 * a length on the paywall that Apple did not state. That length is a 3.1.2
 * claim, and the ids are not evidence of it: `PRODUCT_TIERS` maps identity to
 * entitlement and nothing else, and Cowork may yet rename them. Dropped
 * loudly instead, so the device build says which product is wrong the first
 * time the catalogue loads.
 */
function toOption(product: ProductSubscription): SubscriptionOption[] {
  if (typeof product.id !== 'string' || !(product.id in PRODUCT_TIERS)) return [];
  if (typeof product.displayPrice !== 'string' || product.displayPrice.trim() === '') return [];

  const unit = product.platform === 'ios' ? product.subscriptionPeriodUnitIOS : null;
  if (unit !== 'month' && unit !== 'year') {
    console.warn(
      '[Store] Apple returned no subscription period for a product; not selling it:',
      product.id
    );
    return [];
  }

  return [{ productId: product.id, displayPrice: product.displayPrice, period: unit }];
}

/**
 * Buy one subscription.
 *
 * Subscribes to both listeners, asks, and resolves on the **first** delivery
 * for this product — event or rejection, see the file docblock — then
 * unsubscribes. There is deliberately no timeout: Ask to Buy and bank
 * authentication can hold StoreKit's sheet open for as long as they like, and
 * a deferred purchase announces itself as `deferred-payment` rather than by
 * silence.
 */
export async function purchase(productId: string): Promise<StoreResult> {
  if (storeAvailability() === 'unavailable') return { kind: 'failed', message: CANNOT_BUY };

  try {
    await connect();
  } catch {
    return { kind: 'failed', message: null };
  }

  return new Promise<StoreResult>((resolve) => {
    let settled = false;
    const subscriptions: Array<{ remove: () => void }> = [];

    const settle = (result: StoreResult) => {
      if (settled) return;
      settled = true;
      for (const subscription of subscriptions) subscription.remove();
      resolve(result);
    };

    try {
      subscriptions.push(
        purchaseUpdatedListener((delivered) => {
          if (isFor(delivered, productId)) settle(outcomeOfPurchase(delivered));
        })
      );
      subscriptions.push(
        purchaseErrorListener((error) => {
          if (isErrorFor(error, productId)) settle(outcomeOfError(error));
        })
      );
    } catch {
      // The listeners need the native module too. Unreachable behind the
      // availability check above, and answered the same way if it is not.
      settle({ kind: 'failed', message: CANNOT_BUY });
      return;
    }

    requestPurchase({ type: 'subs', request: { apple: { sku: productId } } }).then(
      (returned) => {
        /*
          The event normally lands before this promise resolves, in which case
          `settle` has already run and this is a no-op. If it did not, the
          returned value is still not trusted as an outcome on its own: a
          purchase for this product with a token is passed through the same
          mapping the event would have used, and anything else is read as
          "the store returned nothing", which `getAvailablePurchases` can
          contradict — see `fallBackToHeld`.
        */
        const held = pick(returned, productId);
        if (held) settle(outcomeOfPurchase(held));
        else void fallBackToHeld(productId).then(settle);
      },
      (error: unknown) => settle(outcomeOfError(error))
    );
  });
}

/**
 * When `requestPurchase` resolved with nothing and no event arrived.
 *
 * The pinned pod never does this on iOS — every path in its `requestPurchase`
 * returns the purchase or throws (file docblock) — so this is the branch for
 * a pod that changes shape under a future `expo-iap`, and it exists because
 * the alternative is worse than a guess: the paywall disables Close while a
 * purchase runs, so a promise that waited for an event that never comes would
 * trap the customer in the sheet. Reporting `failed` outright would tell them
 * "you have not been charged" on the strength of a library returning an empty
 * array, so the store is asked what it actually holds first. A purchase for
 * this product answers `purchased`; nothing answers `failed` with no message,
 * which the resolver renders as its own careful sentence.
 */
async function fallBackToHeld(productId: string): Promise<StoreResult> {
  try {
    const held = pick(await getAvailablePurchases(), productId);
    return held ? outcomeOfPurchase(held) : { kind: 'failed', message: null };
  } catch {
    return { kind: 'failed', message: null };
  }
}

/**
 * Restore a subscription bought before — a reinstall, a second device, or a
 * purchase that verified `retry-later` last time and was never finished.
 *
 * `restorePurchases()` syncs with the App Store and returns nothing; the
 * purchases are read with `getAvailablePurchases()` afterwards, which is the
 * package's documented shape. The newest purchase with a token is verified
 * the same way a fresh one is — the server decides what it is worth.
 */
export async function restore(): Promise<StoreResult> {
  if (storeAvailability() === 'unavailable') return { kind: 'failed', message: CANNOT_BUY };

  let held: Purchase[];
  try {
    await connect();
    await restorePurchases();
    held = await getAvailablePurchases();
  } catch {
    return { kind: 'failed', message: null };
  }

  if (held.length === 0) return { kind: 'nothing-to-restore' };

  const newest = [...held]
    .filter((candidate) => typeof candidate.purchaseToken === 'string' && candidate.purchaseToken !== '')
    .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0))[0];

  /*
    Something is held but nothing can be verified — a purchase with no token
    cannot be sent to the server. Not `nothing-to-restore`: that sentence says
    no subscription was found, and one was.
  */
  if (!newest) return { kind: 'failed', message: null };

  return outcomeOfPurchase(newest);
}

/**
 * Tell StoreKit the purchase has been delivered.
 *
 * ⚠ Only ever after the server accepted the transaction — see the file
 * docblock. A failure here is not surfaced: the transaction stays unfinished,
 * StoreKit re-delivers it on the next launch, and a restore picks it up. That
 * is the safe direction, and it is why this cannot make the caller's outcome
 * worse.
 */
export async function finish(purchase: Purchase): Promise<void> {
  try {
    await finishTransaction({ purchase, isConsumable: false });
  } catch (error) {
    console.warn('[Store] Could not finish a verified transaction; it will be re-delivered:', error);
  }
}

/** Whether a delivered purchase is the one being waited for. */
function isFor(delivered: Purchase, productId: string): boolean {
  return delivered.productId === productId || (delivered.ids?.includes(productId) ?? false);
}

/**
 * Whether an error is about this purchase.
 *
 * An error that names a product is matched on it; one that names none is
 * taken to be about the request in flight, because a listener that ignored it
 * would leave the sheet closed and the button spinning.
 */
function isErrorFor(error: ExpoPurchaseError, productId: string): boolean {
  const named = error.productId ?? null;
  const listed = error.productIds ?? null;
  if (named === null && listed === null) return true;
  return named === productId || (listed?.includes(productId) ?? false);
}

/** The purchase for this product out of whatever `expo-iap` returned. */
function pick(returned: unknown, productId: string): Purchase | null {
  const list = Array.isArray(returned) ? returned : returned ? [returned] : [];
  return (list as Purchase[]).find((candidate) => isFor(candidate, productId)) ?? null;
}

/**
 * A delivered purchase, as a store outcome.
 *
 * `pending` is a purchase StoreKit has accepted but not completed — Ask to
 * Buy, or a bank's authentication step — and there is no token to verify yet.
 * A purchase with no token cannot be verified either, and is reported as
 * failed rather than as purchased-with-nothing-to-send.
 */
function outcomeOfPurchase(delivered: Purchase): StoreResult {
  if (delivered.purchaseState === 'pending') return { kind: 'pending' };

  const token = delivered.purchaseToken;
  if (typeof token !== 'string' || token === '') return { kind: 'failed', message: null };

  return { kind: 'purchased', jwsRepresentation: token, purchase: delivered };
}

/**
 * An error — from the listener or from the rejected request — as a store
 * outcome. The three that are not failures are the resolver's three
 * non-failures; everything else is `failed`.
 *
 * ⚠ **The library's message is not passed through.** `purchase-flow.ts`
 * prefers StoreKit's own sentence when there is one, and the code cannot tell
 * one from `expo-iap`'s diagnostics — which its own `errorMapping` says "can
 * name build configuration a customer must not be shown". So `failed` goes to
 * the resolver with no message and it renders its own true one; the code is
 * kept on the warning for a development build to read.
 */
function outcomeOfError(error: unknown): StoreResult {
  const code = codeOf(error);

  switch (code) {
    case 'user-cancelled':
      return { kind: 'cancelled' };
    case 'deferred-payment':
    case 'pending':
      return { kind: 'pending' };
    case 'already-owned':
      return { kind: 'already-owned' };
    default:
      if (isDevBuild()) console.warn('[Store] Purchase failed:', code ?? 'no code', error);
      return { kind: 'failed', message: null };
  }
}

/**
 * `__DEV__` is a Metro global, and `client.ts` learned the hard way that a
 * bare reference is a `ReferenceError` under the root jest runner, which has
 * no Metro. This module is mobile-only today; the guard costs nothing and
 * means the first root test to import it does not fail thirty tests at once.
 */
function isDevBuild(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

function codeOf(error: unknown): `${ErrorCode}` | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? (code as `${ErrorCode}`) : null;
}
