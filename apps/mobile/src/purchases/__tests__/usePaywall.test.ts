/**
 * The purchase flow's order — store, server, resolver, then StoreKit again.
 *
 * Phase 6, E8. `store.test.ts` proves the translation from StoreKit and
 * `purchase-flow.test.ts` proves what a pair of answers means. This holds
 * the one thing neither can: **when `finish` is called**, relative to what
 * the server said. Finished too early, a dropped verify leaves a customer
 * charged for an entitlement the account never received; left unfinished on
 * the right answers, StoreKit replays the transaction on every launch.
 *
 * And the invariant the whole feature rests on, checked from this side too:
 * `grantsAccess` is passed through from the resolver and never computed
 * here. There is exactly one input that unlocks anything, and it is the
 * server's `entitled`.
 */

import { settle } from '../usePaywall';
import { verifyPurchase } from '../../api/purchases';
import { finish } from '../../api/store';
import type { StoreResult } from '../../api/store';
import type { VerifyOutcome } from '@tappet/core/purchase-flow';
import { applePurchase } from '../../test-support/purchases';

jest.mock('../../api/purchases', () => ({ verifyPurchase: jest.fn() }));
jest.mock('../../api/store', () => ({
  finish: jest.fn(async () => undefined),
  loadSubscriptionOptions: jest.fn(),
  purchase: jest.fn(),
  restore: jest.fn(),
}));

const verify = verifyPurchase as jest.MockedFunction<typeof verifyPurchase>;
const finished = finish as jest.MockedFunction<typeof finish>;

const PURCHASE = applePurchase();
const PURCHASED: StoreResult = {
  kind: 'purchased',
  jwsRepresentation: 'eyJhbGciOiJFUzI1NiJ9.signed-by-apple',
  purchase: PURCHASE,
};

beforeEach(() => {
  verify.mockReset();
  finished.mockClear();
});

describe('a completed purchase', () => {
  it('sends the token StoreKit delivered, and nothing else', async () => {
    verify.mockResolvedValue({ kind: 'entitled', tier: 'paid' });

    await settle(PURCHASED);

    expect(verify).toHaveBeenCalledTimes(1);
    expect(verify).toHaveBeenCalledWith(PURCHASED.jwsRepresentation);
  });

  it.each<[VerifyOutcome['kind'], VerifyOutcome]>([
    ['entitled', { kind: 'entitled', tier: 'paid' }],
    ['recorded-not-entitled', { kind: 'recorded-not-entitled' }],
  ])('finishes the transaction after the server answered %s', async (_kind, outcome) => {
    /*
      The two answers that mean the server has the transaction. Whether the
      account is paid is a separate question — `recorded-not-entitled` is
      finished too, because StoreKit replaying it nightly would change
      nothing about what the server already recorded.
    */
    verify.mockResolvedValue(outcome);

    await settle(PURCHASED);

    expect(finished).toHaveBeenCalledTimes(1);
    expect(finished).toHaveBeenCalledWith(PURCHASE);
  });

  it('finishes only once the verdict is in, never before', async () => {
    const order: string[] = [];
    verify.mockImplementation(async () => {
      order.push('verify');
      return { kind: 'entitled', tier: 'paid' };
    });
    finished.mockImplementation(async () => {
      order.push('finish');
    });

    await settle(PURCHASED);

    expect(order).toEqual(['verify', 'finish']);
  });

  it.each<[VerifyOutcome['kind'], VerifyOutcome]>([
    ['retry-later', { kind: 'retry-later' }],
    ['network', { kind: 'network' }],
    ['rejected', { kind: 'rejected' }],
    ['belongs-to-another-account', { kind: 'belongs-to-another-account' }],
  ])('leaves the transaction unfinished after %s', async (_kind, outcome) => {
    /*
      The server does not have it. Unfinished, StoreKit re-delivers it on the
      next launch and a restore finds it — the safe direction, and the only
      one where a purchase the server could not record tonight is recorded
      tomorrow rather than lost.
    */
    verify.mockResolvedValue(outcome);

    await settle(PURCHASED);

    expect(finished).not.toHaveBeenCalled();
  });

  it('grants access on entitled, and passes the resolver’s answer through untouched', async () => {
    verify.mockResolvedValue({ kind: 'entitled', tier: 'paid' });

    await expect(settle(PURCHASED)).resolves.toMatchObject({
      status: 'entitled',
      grantsAccess: true,
    });
  });

  it.each<[VerifyOutcome['kind'], VerifyOutcome]>([
    ['recorded-not-entitled', { kind: 'recorded-not-entitled' }],
    ['retry-later', { kind: 'retry-later' }],
    ['network', { kind: 'network' }],
    ['rejected', { kind: 'rejected' }],
    ['belongs-to-another-account', { kind: 'belongs-to-another-account' }],
  ])('grants nothing on %s, whatever StoreKit said', async (_kind, outcome) => {
    // A successful StoreKit purchase does not entitle anybody. The server does.
    verify.mockResolvedValue(outcome);

    await expect(settle(PURCHASED)).resolves.toMatchObject({ grantsAccess: false });
  });
});

describe('everything that is not a purchase', () => {
  it.each<StoreResult>([
    { kind: 'cancelled' },
    { kind: 'pending' },
    { kind: 'already-owned' },
    { kind: 'failed', message: null },
    { kind: 'nothing-to-restore' },
  ])('never verifies, never finishes, never grants — $kind', async (store) => {
    await expect(settle(store)).resolves.toMatchObject({ grantsAccess: false });

    expect(verify).not.toHaveBeenCalled();
    expect(finished).not.toHaveBeenCalled();
  });

  it('says nothing at all on a cancellation', async () => {
    /*
      The resolver's `message: null`, carried through so the paywall shows
      no banner — a dialog confirming that somebody did not buy something is
      the app arguing with them. `PaywallScreen.test.tsx` holds the other end.
    */
    await expect(settle({ kind: 'cancelled' })).resolves.toEqual({
      status: 'declined',
      grantsAccess: false,
      message: null,
      offerRestore: false,
    });
  });
});
