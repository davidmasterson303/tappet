/**
 * One ask at a time on the car's page, each after the last has left, and
 * only while the page is focused.
 *
 * Audit 360, UX-19 / UX-20 (1 Oct). A *Not now* on the score's sheet raised
 * the push primer in the very next render — two full-screen Modals, one
 * sliding down as the other slid up, which iOS refuses to present — and both
 * could rise over another tab. Every render's answer is recorded here, so a
 * swap "in the same pass" cannot hide between two assertions.
 */
import { act, renderHook } from '@testing-library/react-native';

import { ASK_SETTLE_MS, useAskTurns } from '../useAskTurns';

type Key = 'primer' | 'score';
type Props = { focused: boolean; primer: boolean; score: boolean };

async function mount(initial: Props) {
  const renders: Array<Key | null> = [];
  const hook = await renderHook(
    ({ focused, primer, score }: Props) => {
      const turns = useAskTurns<Key>({
        focused,
        wanted: [
          ['primer', primer],
          ['score', score],
        ],
      });
      renders.push(turns.presenting);
      return turns;
    },
    { initialProps: initial }
  );
  return { hook, renders };
}

/** Whether any render went from one ask straight to another, with no gap between. */
function swappedInOnePass(renders: Array<Key | null>): boolean {
  return renders.some((key, i) => i > 0 && key !== null && renders[i - 1] !== null && renders[i - 1] !== key);
}

afterEach(() => {
  jest.useRealTimers();
});

describe('one ask after another (UX-19)', () => {
  it('a "Not now" on the score\'s sheet does not present the primer in the same pass', async () => {
    jest.useFakeTimers();
    const { hook, renders } = await mount({ focused: true, primer: false, score: true });
    expect(hook.result.current.presenting).toBe('score');

    // The decline: the sheet is no longer wanted, and the hold on the primer lifts with it.
    await hook.rerender({ focused: true, primer: true, score: false });
    await act(async () => {});
    expect(hook.result.current.presenting).toBeNull();
    expect(swappedInOnePass(renders)).toBe(false);

    // Still leaving just short of the bound: nothing presents.
    await act(async () => {
      jest.advanceTimersByTime(ASK_SETTLE_MS - 1);
    });
    expect(hook.result.current.presenting).toBeNull();

    // The sheet's slide-down has finished: now the primer may present.
    await act(async () => {
      hook.result.current.dismissed();
    });
    expect(hook.result.current.presenting).toBe('primer');
    expect(swappedInOnePass(renders)).toBe(false);
  });

  it('where onDismiss never comes, the bound releases the next ask', async () => {
    jest.useFakeTimers();
    const { hook } = await mount({ focused: true, primer: false, score: true });
    await hook.rerender({ focused: true, primer: true, score: false });
    await act(async () => {});
    expect(hook.result.current.presenting).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(ASK_SETTLE_MS);
    });
    expect(hook.result.current.presenting).toBe('primer');
  });

  it('the ask on screen stays while a higher-priority one becomes wanted', async () => {
    const { hook, renders } = await mount({ focused: true, primer: false, score: true });
    await hook.rerender({ focused: true, primer: true, score: true });
    await act(async () => {});
    expect(hook.result.current.presenting).toBe('score');
    expect(swappedInOnePass(renders)).toBe(false);
  });

  it('with nothing before it, an ask presents at once (anti-vacuous)', async () => {
    const { hook } = await mount({ focused: true, primer: true, score: false });
    expect(hook.result.current.presenting).toBe('primer');
  });

  it('the detector can still see a swap (anti-vacuous)', () => {
    expect(swappedInOnePass(['score', 'primer'])).toBe(true);
    expect(swappedInOnePass(['score', null, 'primer'])).toBe(false);
  });
});

describe('only on the page that asks (UX-20)', () => {
  it('an ask wanted while the page is not focused waits until the page is focused again', async () => {
    jest.useFakeTimers();
    const { hook } = await mount({ focused: false, primer: false, score: false });
    await hook.rerender({ focused: false, primer: false, score: true });
    await act(async () => {
      jest.advanceTimersByTime(ASK_SETTLE_MS * 10);
    });
    expect(hook.result.current.presenting).toBeNull();

    await hook.rerender({ focused: true, primer: false, score: true });
    await act(async () => {});
    expect(hook.result.current.presenting).toBe('score');
  });

  it('leaving the page takes the ask down, and coming back presents it after the last has left', async () => {
    jest.useFakeTimers();
    const { hook } = await mount({ focused: true, primer: true, score: false });
    expect(hook.result.current.presenting).toBe('primer');
    await hook.rerender({ focused: false, primer: true, score: false });
    await act(async () => {});
    expect(hook.result.current.presenting).toBeNull();
    await act(async () => {
      jest.advanceTimersByTime(ASK_SETTLE_MS);
    });
    expect(hook.result.current.presenting).toBeNull();
    await hook.rerender({ focused: true, primer: true, score: false });
    await act(async () => {});
    expect(hook.result.current.presenting).toBe('primer');
  });
});
