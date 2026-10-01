/**
 * When the primer may open, and what it holds while iOS's dialog is up.
 *
 * Audit 360, UX-16 (1 Oct). The car's page stacked the primer, iOS's alert
 * and the health score's sheet: the primer opened the moment the car count
 * was known, and `accept` closed it before the system dialog, so the sheet
 * presented underneath Apple's alert. The hook now takes a `hold` and reports
 * `priming` while the registration (and its dialog) runs.
 */
import { act, renderHook } from '@testing-library/react-native';

import { usePushPrimer } from '../usePushPrimer';
import { currentPushPermission, primerDismissedOn, registerForPush } from '../register';

jest.mock('../register', () => ({
  currentPushPermission: jest.fn(),
  primerDismissedOn: jest.fn(),
  recordPrimerDismissed: jest.fn(async () => undefined),
  registerForPush: jest.fn(),
}));

const permission = currentPushPermission as jest.MockedFunction<typeof currentPushPermission>;
const dismissed = primerDismissedOn as jest.MockedFunction<typeof primerDismissedOn>;
const register = registerForPush as jest.MockedFunction<typeof registerForPush>;

beforeEach(() => {
  jest.clearAllMocks();
  permission.mockResolvedValue('undetermined');
  dismissed.mockResolvedValue(null);
  register.mockResolvedValue({ status: 'registered' });
});

type Props = { count: number | null; hold: boolean };

async function mount(initial: Props) {
  return renderHook(({ count, hold }: Props) => usePushPrimer(count, hold), { initialProps: initial });
}

describe('the hold', () => {
  it('does not open while held, and opens when the hold lifts', async () => {
    const hook = await mount({ count: 1, hold: true });
    await act(async () => {});
    expect(hook.result.current.open).toBe(false);

    await hook.rerender({ count: 1, hold: false });
    await act(async () => {});
    expect(hook.result.current.open).toBe(true);
  });

  it('opens at once with no hold — the old behaviour, still there (anti-vacuous)', async () => {
    const hook = await mount({ count: 1, hold: false });
    await act(async () => {});
    expect(hook.result.current.open).toBe(true);
  });

  it('once open, a hold arriving later does not pull it from under the owner', async () => {
    const hook = await mount({ count: 1, hold: false });
    await act(async () => {});
    await hook.rerender({ count: 1, hold: true });
    await act(async () => {});
    expect(hook.result.current.open).toBe(true);
  });

  it('never opens where the rule says no, held or not', async () => {
    permission.mockResolvedValue('granted');
    const hook = await mount({ count: 1, hold: false });
    await act(async () => {});
    expect(hook.result.current.open).toBe(false);
  });
});

describe('priming', () => {
  it('reports the system dialog as in flight until registration settles, with the primer closed', async () => {
    let settle: (value: { status: 'registered' }) => void = () => undefined;
    register.mockReturnValue(
      new Promise((resolve) => {
        settle = resolve;
      })
    );
    const hook = await mount({ count: 1, hold: false });
    await act(async () => {});

    let accepted: Promise<void> = Promise.resolve();
    await act(async () => {
      accepted = hook.result.current.accept();
    });
    expect(hook.result.current.open).toBe(false);
    expect(hook.result.current.priming).toBe(true);

    await act(async () => {
      settle({ status: 'registered' });
      await accepted;
    });
    expect(hook.result.current.priming).toBe(false);
    expect(hook.result.current.open).toBe(false);
  });

  it('a decline closes it without priming', async () => {
    const hook = await mount({ count: 1, hold: false });
    await act(async () => {});
    await act(async () => hook.result.current.decline());
    expect(hook.result.current.open).toBe(false);
    expect(hook.result.current.priming).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });
});
