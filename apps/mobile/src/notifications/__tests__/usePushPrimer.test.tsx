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
import { AppState, Linking } from 'react-native';

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

type Props = { count: number | null; hold: boolean; focused?: boolean };

async function mount(initial: Props) {
  return renderHook(({ count, hold, focused }: Props) => usePushPrimer(count, hold, focused), {
    initialProps: initial,
  });
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

/*
  Audit 360, UX-24 (1 Oct). Eligibility was read once per car count, at
  mount; the car's page then held the primer until the owner came back
  (UX-20) — so alerts turned on, or refused, from Account's Alerts row in the
  meantime were primed again on return. The host page holds the primer while
  it is away (`hold` includes `!focused` there), and the cases below model it
  the same way.
*/
describe('eligibility is read again when the page comes back (UX-24)', () => {
  const away = { count: 1, hold: true, focused: false };
  const back = { count: 1, hold: false, focused: true };

  it('alerts turned on elsewhere while the page was away: no primer on return', async () => {
    const hook = await mount(away);
    await act(async () => {});
    expect(hook.result.current.open).toBe(false);

    permission.mockResolvedValue('granted');
    await hook.rerender(back);
    await act(async () => {});
    expect(hook.result.current.open).toBe(false);
  });

  it('alerts refused elsewhere while the page was away: no primer on return', async () => {
    const hook = await mount(away);
    await act(async () => {});

    permission.mockResolvedValue('denied');
    await hook.rerender(back);
    await act(async () => {});
    expect(hook.result.current.open).toBe(false);
  });

  it('nothing settled elsewhere: the primer opens on return (anti-vacuous)', async () => {
    const hook = await mount(away);
    await act(async () => {});
    await hook.rerender(back);
    await act(async () => {});
    expect(hook.result.current.open).toBe(true);
  });

  it('is not open in the render the page comes back in, before the read lands', async () => {
    const hook = await mount(back);
    await act(async () => {});
    expect(hook.result.current.open).toBe(true);

    await hook.rerender(away);
    await act(async () => {});
    let land: (value: 'undetermined') => void = () => undefined;
    permission.mockReturnValueOnce(new Promise((resolve) => (land = resolve)));
    await hook.rerender(back);
    expect(hook.result.current.open).toBe(false);
    await act(async () => land('undetermined'));
    expect(hook.result.current.open).toBe(true);
  });

  it('an open primer goes when the app returns from Settings with alerts on', async () => {
    const listeners: Array<(state: string) => void> = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, listener: (state: string) => void) => {
      listeners.push(listener);
      return { remove: jest.fn() };
    }) as never);
    const hook = await mount(back);
    await act(async () => {});
    expect(hook.result.current.open).toBe(true);
    expect(listeners.length).toBeGreaterThan(0);

    permission.mockResolvedValue('granted');
    await act(async () => {
      for (const listener of listeners) listener('active');
    });
    expect(hook.result.current.open).toBe(false);
  });

  it('a yes to a permission refused since the read opens Settings, not a silent no-op', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
    const hook = await mount(back);
    await act(async () => {});
    permission.mockResolvedValue('denied');
    await act(async () => hook.result.current.accept());
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(register).not.toHaveBeenCalled();
    expect(hook.result.current.priming).toBe(false);
  });

  it('a yes while still undetermined registers, and opens no Settings (anti-vacuous)', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
    const hook = await mount(back);
    await act(async () => {});
    await act(async () => hook.result.current.accept());
    expect(register).toHaveBeenCalledTimes(1);
    expect(openSettings).not.toHaveBeenCalled();
  });
});

afterEach(() => jest.restoreAllMocks());
