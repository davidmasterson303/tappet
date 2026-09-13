/**
 * The store adapter, against the mocked `expo-iap`.
 *
 * Phase 6, E8. What a purchase *means* is tested in `purchase-flow.test.ts`
 * and the order of verify-then-finish in `usePaywall.test.ts`. What is tested
 * here is the translation: that every answer StoreKit can give comes out of
 * `store.ts` as the `StoreOutcome` the resolver expects, and that the three
 * that are not failures are not reported as failures.
 *
 * ── ⚠ What this cannot prove ────────────────────────────────────────────────
 *
 * That the mock delivers what the device does. The pinned pod's source says a
 * result arrives **both** as an event and as the promise's settlement, in
 * that order on the native side (`store.ts` cites the file); each delivery is
 * exercised below on its own and both together, and every one must produce
 * the same outcome. The sandbox purchase on the device build is what shows
 * that reading was right.
 *
 * ── Why the module is reloaded per test ─────────────────────────────────────
 *
 * The adapter opens the connection lazily and once, holding the promise at
 * module level. A test that proves a failed open is retried needs a module
 * that has not already opened, and `jest.resetModules()` is the honest way to
 * get one — `expo-iap`'s mock factory in `jest.setup.js` re-runs with it, so
 * the listener sets and call counts start empty every time.
 */

import { applePurchase } from '../../test-support/purchases';

/*
  Availability. `jest.setup.js` deliberately leaves `expo` alone, so the
  runner answers "no store" like Expo Go; a test that needs one flips this.
  Must be `mock`-prefixed: jest hoists the factory above the declaration.
*/
let mockNativeModule: unknown = {};
jest.mock('expo', () => ({
  requireOptionalNativeModule: () => mockNativeModule,
}));

type Store = typeof import('../store');
type Iap = typeof import('expo-iap') & {
  __emit: (event: 'purchase-updated' | 'purchase-error', payload: unknown) => void;
  __listenerCount: (event: 'purchase-updated' | 'purchase-error') => number;
};

function load(): { store: Store; iap: jest.MockedObject<Iap> } {
  jest.resetModules();
  const iap = require('expo-iap') as jest.MockedObject<Iap>;
  const store = require('../store') as Store;
  return { store, iap };
}

/** Let the adapter get past `await connect()` and attach its listeners. */
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

const MONTHLY = 'com.southmoordigital.tappet.paid.monthly';
const ANNUAL = 'com.southmoordigital.tappet.paid.annual';

const PURCHASE = applePurchase({ productId: MONTHLY });

const product = (id: string, displayPrice: string, unit: 'month' | 'year' | null) => ({
  id,
  displayPrice,
  platform: 'ios',
  type: 'subs',
  subscriptionPeriodUnitIOS: unit,
});

// The adapter warns on an unmapped failure code; that is for a dev build, not a log.
let warn: jest.SpyInstance;

beforeEach(() => {
  mockNativeModule = {};
  warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => warn.mockRestore());

describe('a build with no store', () => {
  beforeEach(() => {
    mockNativeModule = null;
  });

  it('reports the catalogue as unavailable, and asks StoreKit nothing', async () => {
    /*
      Expo Go today, and the device build until App Store Connect has
      products. A state, not an error — and importantly not `failed`, which
      the paywall renders as connection advice.
    */
    const { store, iap } = load();

    await expect(store.loadSubscriptionOptions()).resolves.toEqual({ kind: 'unavailable' });
    expect(iap.initConnection).not.toHaveBeenCalled();
    expect(iap.fetchProducts).not.toHaveBeenCalled();
  });

  it('refuses a purchase and a restore without touching the native side', async () => {
    const { store, iap } = load();

    await expect(store.purchase(MONTHLY)).resolves.toMatchObject({ kind: 'failed' });
    await expect(store.restore()).resolves.toMatchObject({ kind: 'failed' });
    expect(iap.requestPurchase).not.toHaveBeenCalled();
    expect(iap.restorePurchases).not.toHaveBeenCalled();
  });

  it('can still see a store when there is one', () => {
    // Anti-vacuous: the probe reads the module, not a constant.
    mockNativeModule = {};
    const { store } = load();
    expect(store.storeAvailability()).toBe('available');
  });
});

describe('the catalogue', () => {
  it('reports an empty product list as none, not as a failure', async () => {
    /*
      Connected, and the App Store returned nothing for our ids: the state of
      every storefront until App Store Connect carries the products. Reported
      as `failed`, the paywall would tell somebody to check their connection.
    */
    const { store, iap } = load();
    iap.fetchProducts.mockResolvedValue([]);

    await expect(store.loadSubscriptionOptions()).resolves.toEqual({ kind: 'none' });
  });

  it('reports a store that could not be asked as failed', async () => {
    // Anti-vacuous for the case above: the two are different answers.
    const { store, iap } = load();
    iap.fetchProducts.mockRejectedValue(new Error('network'));

    await expect(store.loadSubscriptionOptions()).resolves.toEqual({ kind: 'failed' });
  });

  it('asks for exactly the two product ids, as subscriptions', async () => {
    const { store, iap } = load();
    iap.fetchProducts.mockResolvedValue([]);

    await store.loadSubscriptionOptions();

    expect(iap.fetchProducts).toHaveBeenCalledWith({ skus: [MONTHLY, ANNUAL], type: 'subs' });
  });

  it('renders Apple’s price string verbatim and Apple’s period', async () => {
    const { store, iap } = load();
    iap.fetchProducts.mockResolvedValue([
      product(ANNUAL, '£69.99', 'year'),
      product(MONTHLY, '£7.99', 'month'),
    ] as never);

    await expect(store.loadSubscriptionOptions()).resolves.toEqual({
      kind: 'ready',
      options: [
        // Declared order — monthly first — whatever order Apple answered in.
        { productId: MONTHLY, displayPrice: '£7.99', period: 'month' },
        { productId: ANNUAL, displayPrice: '£69.99', period: 'year' },
      ],
    });
  });

  it('opens the connection once across calls', async () => {
    const { store, iap } = load();
    iap.fetchProducts.mockResolvedValue([]);

    await store.loadSubscriptionOptions();
    await store.loadSubscriptionOptions();

    expect(iap.initConnection).toHaveBeenCalledTimes(1);
  });

  it('forgets a failed open, so the next call tries again', async () => {
    const { store, iap } = load();
    iap.initConnection.mockRejectedValueOnce(new Error('not prepared'));
    iap.fetchProducts.mockResolvedValue([]);

    await expect(store.loadSubscriptionOptions()).resolves.toEqual({ kind: 'failed' });
    await expect(store.loadSubscriptionOptions()).resolves.toEqual({ kind: 'none' });
    expect(iap.initConnection).toHaveBeenCalledTimes(2);
  });

  it('drops a product Apple returned no period for, rather than reading one off its name', async () => {
    const { store, iap } = load();
    iap.fetchProducts.mockResolvedValue([
      product(MONTHLY, '£7.99', null),
      product(ANNUAL, '£69.99', 'year'),
    ] as never);

    /*
      The monthly product's id says "monthly", and that is not evidence of
      its period: the pod sets `subscriptionPeriodUnitIOS` for every
      auto-renewable subscription and leaves it nil only for a non-renewing
      one, so a product without a unit is misconfigured in App Store Connect.
      Rendering it "£7.99 / month" from its name would put a length on the
      paywall that Apple did not state — the 3.1.2 claim the screen exists
      to make honestly. It is dropped, loudly, and the annual one is sold.
    */
    await expect(store.loadSubscriptionOptions()).resolves.toEqual({
      kind: 'ready',
      options: [{ productId: ANNUAL, displayPrice: '£69.99', period: 'year' }],
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no subscription period'), MONTHLY);
  });

  it('ignores a product that is not ours, whatever Apple says about it', async () => {
    // Anti-vacuous for the id check: a period alone does not get a product sold.
    const { store, iap } = load();
    iap.fetchProducts.mockResolvedValue([product('com.example.mystery', '£1.99', 'month')] as never);

    await expect(store.loadSubscriptionOptions()).resolves.toEqual({ kind: 'none' });
  });

  it('reports none, not ready, when every returned product had to be dropped', async () => {
    const { store, iap } = load();
    iap.fetchProducts.mockResolvedValue([product(MONTHLY, '£7.99', null)] as never);

    await expect(store.loadSubscriptionOptions()).resolves.toEqual({ kind: 'none' });
  });
});

describe('a purchase', () => {
  it('asks StoreKit for the subscription by sku', async () => {
    const { store, iap } = load();
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-updated', PURCHASE);
      return PURCHASE;
    });

    await store.purchase(MONTHLY);

    expect(iap.requestPurchase).toHaveBeenCalledWith({
      type: 'subs',
      request: { apple: { sku: MONTHLY } },
    });
  });

  it('hands back the signed token from the delivered purchase', async () => {
    /*
      `purchase.purchaseToken` — the package's "unified purchase token (iOS
      JWS)" — is what `verifyPurchase()` sends. Nothing else on the purchase
      is read for entitlement.
    */
    const { store, iap } = load();
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-updated', PURCHASE);
      return PURCHASE;
    });

    await expect(store.purchase(MONTHLY)).resolves.toEqual({
      kind: 'purchased',
      jwsRepresentation: PURCHASE.purchaseToken,
      purchase: PURCHASE,
    });
  });

  it('resolves on the event alone, with the request still open', async () => {
    // StoreKit's sheet can outlive the promise; the event is the authority.
    const { store, iap } = load();
    iap.requestPurchase.mockReturnValue(new Promise(() => {}));

    const pending = store.purchase(MONTHLY);
    await settled();
    iap.__emit('purchase-updated', PURCHASE);

    await expect(pending).resolves.toMatchObject({ kind: 'purchased' });
  });

  it('ignores a delivery for a different product', async () => {
    const { store, iap } = load();
    iap.requestPurchase.mockReturnValue(new Promise(() => {}));

    const pending = store.purchase(ANNUAL);
    await settled();
    iap.__emit('purchase-updated', PURCHASE); // monthly — not ours
    iap.__emit('purchase-updated', { ...PURCHASE, productId: ANNUAL });

    await expect(pending).resolves.toMatchObject({ kind: 'purchased' });
    expect(iap.__listenerCount('purchase-updated')).toBe(0);
  });

  it('unsubscribes both listeners once it has an answer', async () => {
    const { store, iap } = load();
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-updated', PURCHASE);
      return PURCHASE;
    });

    await store.purchase(MONTHLY);

    expect(iap.__listenerCount('purchase-updated')).toBe(0);
    expect(iap.__listenerCount('purchase-error')).toBe(0);
  });

  it.each([
    ['user-cancelled', 'cancelled'],
    ['deferred-payment', 'pending'],
    ['pending', 'pending'],
    ['already-owned', 'already-owned'],
    ['network-error', 'failed'],
    ['purchase-error', 'failed'],
  ])('maps a %s error event to %s', async (code, kind) => {
    const { store, iap } = load();
    iap.requestPurchase.mockReturnValue(new Promise(() => {}));

    const pending = store.purchase(MONTHLY);
    await settled();
    iap.__emit('purchase-error', { code, message: 'from StoreKit', productId: MONTHLY });

    await expect(pending).resolves.toMatchObject({ kind });
  });

  it('maps a rejected request the same way, when that is how it arrives', async () => {
    // The other delivery the tarball could not rule out.
    const { store, iap } = load();
    iap.requestPurchase.mockRejectedValue({ code: 'user-cancelled', message: 'cancelled' });

    await expect(store.purchase(MONTHLY)).resolves.toEqual({ kind: 'cancelled' });
  });

  it('settles once when both deliveries arrive', async () => {
    const { store, iap } = load();
    const error = { code: 'user-cancelled', message: 'cancelled', productId: MONTHLY };
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-error', error);
      throw error;
    });

    await expect(store.purchase(MONTHLY)).resolves.toEqual({ kind: 'cancelled' });
    expect(iap.__listenerCount('purchase-error')).toBe(0);
  });

  it('carries no message on a failure, so the resolver renders its own true one', async () => {
    /*
      `expo-iap`'s `message` is a diagnostic its own docblock says can name
      build configuration; StoreKit's localised sentence cannot be told from
      it in code. `purchase-flow.ts` has a sentence that is always true.
    */
    const { store, iap } = load();
    iap.requestPurchase.mockRejectedValue({
      code: 'purchase-error',
      message: 'Failed to request purchase: ExpoIap not prepared (build 1.2.3)',
    });

    await expect(store.purchase(MONTHLY)).resolves.toEqual({ kind: 'failed', message: null });
  });

  it('reads a pending purchase as pending, not as purchased', async () => {
    const { store, iap } = load();
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-updated', { ...PURCHASE, purchaseState: 'pending', purchaseToken: null });
      return null;
    });

    await expect(store.purchase(MONTHLY)).resolves.toEqual({ kind: 'pending' });
  });

  it('asks what the store holds before calling an empty return a failure', async () => {
    /*
      `requestPurchase` resolved with nothing and no event came. "You have
      not been charged" on the strength of an empty array would be a claim;
      `getAvailablePurchases` is asked first.
    */
    const { store, iap } = load();
    iap.requestPurchase.mockResolvedValue([]);
    iap.getAvailablePurchases.mockResolvedValue([PURCHASE]);

    await expect(store.purchase(MONTHLY)).resolves.toMatchObject({
      kind: 'purchased',
      jwsRepresentation: PURCHASE.purchaseToken,
    });
  });

  it('and reports failed with no message when the store holds nothing either', async () => {
    const { store, iap } = load();
    iap.requestPurchase.mockResolvedValue([]);
    iap.getAvailablePurchases.mockResolvedValue([]);

    await expect(store.purchase(MONTHLY)).resolves.toEqual({ kind: 'failed', message: null });
  });
});

describe('restore', () => {
  it('syncs with the App Store and then reads what is held', async () => {
    const { store, iap } = load();
    iap.getAvailablePurchases.mockResolvedValue([]);

    await store.restore();

    expect(iap.restorePurchases).toHaveBeenCalledTimes(1);
    expect(iap.getAvailablePurchases).toHaveBeenCalledTimes(1);
  });

  it('reports an empty list as nothing-to-restore', async () => {
    // Distinct from a failed restore: the resolver has a different sentence.
    const { store, iap } = load();
    iap.getAvailablePurchases.mockResolvedValue([]);

    await expect(store.restore()).resolves.toEqual({ kind: 'nothing-to-restore' });
  });

  it('verifies the newest purchase with a token', async () => {
    const { store, iap } = load();
    const older = { ...PURCHASE, id: 'txn-0', transactionDate: 1, purchaseToken: 'older' };
    const newest = { ...PURCHASE, id: 'txn-2', transactionDate: 2_000_000_000_000, purchaseToken: 'newest' };
    iap.getAvailablePurchases.mockResolvedValue([older, newest, PURCHASE]);

    await expect(store.restore()).resolves.toEqual({
      kind: 'purchased',
      jwsRepresentation: 'newest',
      purchase: newest,
    });
  });

  it('does not call a held purchase with no token nothing-to-restore', async () => {
    const { store, iap } = load();
    iap.getAvailablePurchases.mockResolvedValue([{ ...PURCHASE, purchaseToken: null }]);

    await expect(store.restore()).resolves.toEqual({ kind: 'failed', message: null });
  });

  it('reports a sync the store refused as failed', async () => {
    const { store, iap } = load();
    iap.restorePurchases.mockRejectedValue(new Error('sync-error'));

    await expect(store.restore()).resolves.toEqual({ kind: 'failed', message: null });
  });
});

describe('finish', () => {
  it('finishes the purchase it was given, as a subscription', async () => {
    const { store, iap } = load();

    await store.finish(PURCHASE);

    expect(iap.finishTransaction).toHaveBeenCalledWith({ purchase: PURCHASE, isConsumable: false });
  });

  it('does not throw when StoreKit refuses — the transaction is re-delivered', async () => {
    const { store, iap } = load();
    iap.finishTransaction.mockRejectedValue(new Error('not found'));

    await expect(store.finish(PURCHASE)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });
});
