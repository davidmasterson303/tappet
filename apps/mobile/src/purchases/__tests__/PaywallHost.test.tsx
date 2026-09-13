/**
 * The paywall, mounted — opened by a refusal, rendering what the store and
 * the server actually said.
 *
 * `PaywallScreen.test.tsx` proves the screen renders what it is handed.
 * `store.test.ts` and `usePaywall.test.ts` prove what it is handed. This is
 * the seam between them: a `requestUpgrade()` from anywhere in the app reaches
 * a mounted sheet, the sheet says what this build can do, and a cancelled
 * purchase leaves nothing on screen.
 *
 * `expo-iap` is the mock in `jest.setup.js`; availability is flipped here
 * because the runner, like Expo Go, has no store unless a test says it does.
 */

import { act, render, screen, userEvent, waitFor } from '@testing-library/react-native';

import { PaywallHost } from '../PaywallHost';
import { requestUpgrade } from '../upgrade-prompt';
import { verifyPurchase } from '../../api/purchases';
import { applePurchase } from '../../test-support/purchases';

let mockNativeModule: unknown = null;
jest.mock('expo', () => ({
  requireOptionalNativeModule: () => mockNativeModule,
}));

jest.mock('../../api/purchases', () => ({ verifyPurchase: jest.fn() }));

type Iap = typeof import('expo-iap') & {
  __emit: (event: 'purchase-updated' | 'purchase-error', payload: unknown) => void;
};
const iap = jest.requireMock('expo-iap') as jest.MockedObject<Iap>;
const verify = verifyPurchase as jest.MockedFunction<typeof verifyPurchase>;

const MONTHLY = 'com.southmoordigital.tappet.paid.monthly';

beforeEach(() => {
  mockNativeModule = null;
  jest.clearAllMocks();
  iap.fetchProducts.mockResolvedValue([]);
});

describe('opening', () => {
  it('is closed until something asks', async () => {
    await render(<PaywallHost />);

    expect(screen.queryByText('Tappet Plus')).toBeNull();
  });

  it('opens on a refusal and names the feature', async () => {
    await render(<PaywallHost />);

    await act(async () => {
      requestUpgrade('advisor');
    });

    expect(await screen.findByText('The advisor is part of Tappet Plus.')).toBeTruthy();
  });

  it('opens from settings without claiming a reason', async () => {
    await render(<PaywallHost />);

    await act(async () => {
      requestUpgrade(null);
    });

    expect(await screen.findByText('Tappet Plus')).toBeTruthy();
    expect(screen.queryByText(/is part of Tappet Plus\./)).toBeNull();
  });
});

describe('what this build can do', () => {
  it('says it cannot buy when there is no store — Expo Go, and this runner', async () => {
    await render(<PaywallHost />);

    await act(async () => {
      requestUpgrade('advisor');
    });

    expect(await screen.findByText(/this build of tappet cannot make purchases/i)).toBeTruthy();
    expect(iap.initConnection).not.toHaveBeenCalled();
  });

  it('says the plans are not on sale when the store has none', async () => {
    mockNativeModule = {};
    iap.fetchProducts.mockResolvedValue([]);
    await render(<PaywallHost />);

    await act(async () => {
      requestUpgrade('advisor');
    });

    expect(await screen.findByText(/not on sale in your app store yet/i)).toBeTruthy();
    expect(screen.queryByText(/check your connection/i)).toBeNull();
  });

  it('shows Apple’s price when the store has the products', async () => {
    mockNativeModule = {};
    iap.fetchProducts.mockResolvedValue([
      { id: MONTHLY, displayPrice: '£7.99', platform: 'ios', type: 'subs', subscriptionPeriodUnitIOS: 'month' },
    ] as never);
    await render(<PaywallHost />);

    await act(async () => {
      requestUpgrade('advisor');
    });

    expect(await screen.findByText('£7.99 / month')).toBeTruthy();
  });
});

describe('a purchase, end to end', () => {
  beforeEach(() => {
    mockNativeModule = {};
    iap.fetchProducts.mockResolvedValue([
      { id: MONTHLY, displayPrice: '£7.99', platform: 'ios', type: 'subs', subscriptionPeriodUnitIOS: 'month' },
    ] as never);
  });

  it('shows nothing when the customer cancels', async () => {
    /*
      StoreKit says cancelled, the resolver says `message: null`, and the
      screen shows no banner. Three modules, one silence — deliberately.
    */
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-error', { code: 'user-cancelled', message: 'cancelled', productId: MONTHLY });
      return [];
    });
    await render(<PaywallHost />);
    await act(async () => {
      requestUpgrade('advisor');
    });

    await userEvent.press(await screen.findByText('£7.99 / month'));

    await waitFor(() => expect(iap.requestPurchase).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(verify).not.toHaveBeenCalled();
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });

  it('verifies the token, then finishes, then says the subscription is active', async () => {
    const purchase = applePurchase({ productId: MONTHLY, purchaseToken: 'signed' });
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-updated', purchase);
      return purchase;
    });
    verify.mockResolvedValue({ kind: 'entitled', tier: 'paid' });
    await render(<PaywallHost />);
    await act(async () => {
      requestUpgrade('advisor');
    });

    await userEvent.press(await screen.findByText('£7.99 / month'));

    expect(await screen.findByText('Your subscription is active.')).toBeTruthy();
    expect(verify).toHaveBeenCalledWith('signed');
    expect(iap.finishTransaction).toHaveBeenCalledWith({ purchase, isConsumable: false });
  });

  it('does not say active, and does not finish, when the server could not record it', async () => {
    const purchase = applePurchase({ productId: MONTHLY, purchaseToken: 'signed' });
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-updated', purchase);
      return purchase;
    });
    verify.mockResolvedValue({ kind: 'retry-later' });
    await render(<PaywallHost />);
    await act(async () => {
      requestUpgrade('advisor');
    });

    await userEvent.press(await screen.findByText('£7.99 / month'));

    expect(await screen.findByText(/still setting up your subscription/i)).toBeTruthy();
    expect(screen.queryByText('Your subscription is active.')).toBeNull();
    expect(iap.finishTransaction).not.toHaveBeenCalled();
  });
});

describe('what the rest of the app is told', () => {
  /*
    The one account fact this app holds in memory is `AccountScreen`'s
    subscription read, taken once when the screen is pushed — and the paywall
    now opens *over* that screen from its own row. So the host says when the
    server entitled the account, and says nothing on any other resolution:
    `grantsAccess` is the resolver's, and this only relays it.
  */
  beforeEach(() => {
    mockNativeModule = {};
    iap.fetchProducts.mockResolvedValue([
      { id: MONTHLY, displayPrice: '£7.99', platform: 'ios', type: 'subs', subscriptionPeriodUnitIOS: 'month' },
    ] as never);
  });

  async function buy(onEntitled: () => void) {
    await render(<PaywallHost onEntitled={onEntitled} />);
    await act(async () => {
      requestUpgrade('advisor');
    });
    await userEvent.press(await screen.findByText('£7.99 / month'));
    await waitFor(() => expect(iap.requestPurchase).toHaveBeenCalled());
  }

  it('announces an entitlement once the server granted it', async () => {
    const purchase = applePurchase({ productId: MONTHLY, purchaseToken: 'signed' });
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-updated', purchase);
      return purchase;
    });
    verify.mockResolvedValue({ kind: 'entitled', tier: 'paid' });
    const onEntitled = jest.fn();

    await buy(onEntitled);

    await screen.findByText('Your subscription is active.');
    expect(onEntitled).toHaveBeenCalledTimes(1);
  });

  it('announces one after a restore the server granted', async () => {
    iap.getAvailablePurchases.mockResolvedValue([applePurchase({ productId: MONTHLY })]);
    verify.mockResolvedValue({ kind: 'entitled', tier: 'paid' });
    const onEntitled = jest.fn();
    await render(<PaywallHost onEntitled={onEntitled} />);
    await act(async () => {
      requestUpgrade(null);
    });

    await userEvent.press(await screen.findByText('Restore purchases'));

    await screen.findByText('Your subscription is active.');
    expect(onEntitled).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the server could not record it', { kind: 'retry-later' } as const],
    ['the server accepted it without entitling the account', { kind: 'recorded-not-entitled' } as const],
  ])('announces nothing when %s', async (_why, outcome) => {
    // A StoreKit success entitles nobody, and neither does this callback.
    const purchase = applePurchase({ productId: MONTHLY, purchaseToken: 'signed' });
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-updated', purchase);
      return purchase;
    });
    verify.mockResolvedValue(outcome);
    const onEntitled = jest.fn();

    await buy(onEntitled);

    await waitFor(() => expect(verify).toHaveBeenCalled());
    await screen.findByRole('alert');
    expect(onEntitled).not.toHaveBeenCalled();
  });

  it('announces nothing when the customer cancels', async () => {
    iap.requestPurchase.mockImplementation(async () => {
      iap.__emit('purchase-error', { code: 'user-cancelled', message: 'cancelled', productId: MONTHLY });
      return [];
    });
    const onEntitled = jest.fn();

    await buy(onEntitled);

    expect(verify).not.toHaveBeenCalled();
    expect(onEntitled).not.toHaveBeenCalled();
  });
});

describe('restore', () => {
  it('says this build cannot restore either, when there is no store', async () => {
    await render(<PaywallHost />);
    await act(async () => {
      requestUpgrade(null);
    });

    await userEvent.press(await screen.findByText('Restore purchases'));

    expect(await screen.findByText(/cannot make or restore purchases/i)).toBeTruthy();
    expect(iap.restorePurchases).not.toHaveBeenCalled();
  });

  it('says no subscription was found when the store holds nothing', async () => {
    mockNativeModule = {};
    iap.getAvailablePurchases.mockResolvedValue([]);
    await render(<PaywallHost />);
    await act(async () => {
      requestUpgrade(null);
    });

    await userEvent.press(await screen.findByText('Restore purchases'));

    expect(await screen.findByText(/no previous subscription was found/i)).toBeTruthy();
    expect(verify).not.toHaveBeenCalled();
  });
});
