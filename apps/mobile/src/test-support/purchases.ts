import type { Purchase, PurchaseIOS } from 'expo-iap';

/**
 * A StoreKit purchase, as `expo-iap` delivers one on iOS.
 *
 * Typed against the package's own `PurchaseIOS` rather than cast from a
 * partial literal, on purpose: the three suites that need one were each
 * writing `{ … } as unknown as Purchase`, which is the cast that lets the
 * package rename `purchaseToken` — the one field the adapter reads for
 * entitlement — and leaves every test green against a shape that no longer
 * exists. Here the rename is a compile error in one file.
 *
 * The defaults are the shape the pod produces (read from its source, see
 * `api/store.ts`): `purchaseState` is always `purchased` on iOS, and
 * `purchaseToken` is the JWS. Override what a test is about and nothing else.
 */
export function applePurchase(overrides: Partial<PurchaseIOS> = {}): Purchase {
  return {
    id: 'txn-1',
    transactionId: 'txn-1',
    productId: 'com.southmoordigital.tappet.paid.monthly',
    purchaseState: 'purchased',
    purchaseToken: 'eyJhbGciOiJFUzI1NiJ9.signed-by-apple',
    isAutoRenewing: true,
    quantity: 1,
    store: 'apple',
    transactionDate: 1_757_600_000_000,
    ...overrides,
  };
}
