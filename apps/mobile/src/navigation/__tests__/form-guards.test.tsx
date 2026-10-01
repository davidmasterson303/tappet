import type { ReactNode } from 'react';
import { Alert, PixelRatio, Text } from 'react-native';
import { render, userEvent } from '@testing-library/react-native';
import {
  NavigationContext,
  NavigationRouteContext,
  PreventRemoveContext,
} from '@react-navigation/native';

import { DISCARD_COPY, useConfirmDiscard } from '../useConfirmDiscard';
import { NAV_BAR_HEIGHT, pushedHeaderHeight } from '../../components/keyboard-offset';
import { DescribeCarScreen } from '../../screens/DescribeCarScreen';
import { SHORTEST, TALLEST, withSafeArea } from '../../test-support/safe-area';

/**
 * Audit 360, UX-2 and UX-3 (1 Oct) — what a pushed form does with the
 * keyboard up and with a back gesture.
 *
 * UX-2: every pushed form's `KeyboardAvoidingView` carried no offset, so its
 * padding stopped short by the header's height and the foot of the form sat
 * under the keyboard. UX-3: nothing intercepted removal, so a swipe from the
 * edge threw away typed answers without a word.
 *
 * The navigator is not mounted: the three contexts the hook reads are
 * supplied by hand, which is exactly the surface `useConfirmDiscard` touches
 * and keeps the suite off native-stack's native views.
 * `mobile-keyboard-forms.test.ts` (root suite) holds every form to both.
 */

/*
  The KeyboardAvoidingView, recorded: RNTL 14 sees host components only, so
  the offset the screen hands it is read off a View standing in its place.
*/
jest.mock('react-native/Libraries/Components/Keyboard/KeyboardAvoidingView', () => {
  const View = jest.requireActual('react-native/Libraries/Components/View/View').default;
  const Recorded = (props: Record<string, unknown>) => <View testID="keyboard-avoiding" {...props} />;
  return { __esModule: true, default: Recorded };
});

jest.mock('../../api/vpic', () => ({
  decodeVin: jest.fn(),
  fetchModels: jest.fn().mockResolvedValue([]),
}));

type Listener = (event: {
  data: { action: { type: string } };
  preventDefault: () => void;
}) => void;

function fakeNavigator() {
  const listeners: Listener[] = [];
  const navigation = {
    addListener: jest.fn((type: string, listener: Listener) => {
      if (type === 'beforeRemove') listeners.push(listener);
      return () => {
        const at = listeners.indexOf(listener);
        if (at !== -1) listeners.splice(at, 1);
      };
    }),
    dispatch: jest.fn(),
  };
  const prevent = {
    preventedRoutes: {},
    setPreventRemove: jest.fn(),
    notifyPreventRemove: jest.fn(),
  };

  /** Fire `beforeRemove` as core would; returns whether it was prevented. */
  const remove = (type: string) => {
    const preventDefault = jest.fn();
    const action = { type };
    for (const listener of [...listeners]) listener({ data: { action }, preventDefault });
    return { prevented: preventDefault.mock.calls.length > 0, action };
  };

  const wrap = (node: ReactNode) => (
    <NavigationContext.Provider value={navigation as never}>
      <NavigationRouteContext.Provider value={{ key: 'route-1', name: 'Form' } as never}>
        <PreventRemoveContext.Provider value={prevent as never}>{node}</PreventRemoveContext.Provider>
      </NavigationRouteContext.Provider>
    </NavigationContext.Provider>
  );

  return { navigation, prevent, remove, wrap };
}

let alert: jest.SpyInstance;
beforeEach(() => {
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alert.mockRestore());

let release: () => void = () => {};
function Form({ dirty }: { dirty: boolean }) {
  release = useConfirmDiscard(dirty);
  return <Text>form</Text>;
}

describe('useConfirmDiscard — UX-3', () => {
  it('asks before a back gesture drops unsaved work, and DISCARD goes through', async () => {
    const nav = fakeNavigator();
    await render(nav.wrap(<Form dirty />));

    // Registered with the prevent-remove context: what makes native-stack
    // hold the iOS edge swipe rather than pop the native screen under JS.
    expect(nav.prevent.setPreventRemove).toHaveBeenCalledWith(expect.any(String), 'route-1', true);

    const { prevented, action } = nav.remove('POP');
    expect(prevented).toBe(true);
    expect(alert).toHaveBeenCalledWith(DISCARD_COPY.title, DISCARD_COPY.body, expect.any(Array));

    const buttons = alert.mock.calls[0][2] as Array<{ text: string; onPress?: () => void }>;
    expect(buttons.map((b) => b.text)).toEqual([DISCARD_COPY.keep, DISCARD_COPY.discard]);
    expect(nav.navigation.dispatch).not.toHaveBeenCalled();

    buttons[1].onPress?.();
    expect(nav.navigation.dispatch).toHaveBeenCalledWith(action);
  });

  it('asks on the header back and a tab re-tap too', async () => {
    const nav = fakeNavigator();
    await render(nav.wrap(<Form dirty />));
    expect(nav.remove('GO_BACK').prevented).toBe(true);
    expect(nav.remove('POP_TO_TOP').prevented).toBe(true);
  });

  it('says nothing when there is nothing to lose', async () => {
    const nav = fakeNavigator();
    await render(nav.wrap(<Form dirty={false} />));
    expect(nav.remove('POP').prevented).toBe(false);
    expect(alert).not.toHaveBeenCalled();
    expect(nav.prevent.setPreventRemove).not.toHaveBeenCalledWith(expect.any(String), 'route-1', true);
  });

  it('lets the form’s own forward step through — the work went somewhere', async () => {
    const nav = fakeNavigator();
    await render(nav.wrap(<Form dirty />));
    expect(nav.remove('REPLACE').prevented).toBe(false);
    expect(nav.remove('POP_TO').prevented).toBe(false);
    expect(nav.remove('NAVIGATE').prevented).toBe(false);
  });

  it('lets a saved form go back without asking', async () => {
    const nav = fakeNavigator();
    await render(nav.wrap(<Form dirty />));
    release();
    expect(nav.remove('GO_BACK').prevented).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });

  it('is inert without a navigator, so bare screen suites still mount', async () => {
    const view = await render(<Form dirty />);
    expect(view.getByText('form')).toBeTruthy();
  });

  it('is wired into a real form: a typed year is asked about', async () => {
    const nav = fakeNavigator();
    const user = userEvent.setup();
    const view = await render(nav.wrap(<DescribeCarScreen onIdentified={jest.fn()} />));

    // Untouched: back is free.
    expect(nav.remove('POP').prevented).toBe(false);

    await user.type(view.getByLabelText('Model year'), '2018');
    expect(nav.remove('POP').prevented).toBe(true);
    expect(alert).toHaveBeenCalledTimes(1);
  });
});

describe('the pushed form’s keyboard offset — UX-2', () => {
  it('is the native header: a 44pt bar over the status bar', () => {
    // The 4.7″: a 20pt status bar, no island.
    expect(pushedHeaderHeight(20, 2)).toBe(64);
    // A Dynamic Island device: the status bar is the inset less 5 + 1/scale,
    // which is `getDefaultHeaderHeight`'s own arithmetic.
    expect(pushedHeaderHeight(59, 3)).toBeCloseTo(NAV_BAR_HEIGHT + 59 - (5 + 1 / 3), 5);
  });

  it('reaches the form’s KeyboardAvoidingView on the tallest phone', async () => {
    const view = await render(withSafeArea(<DescribeCarScreen onIdentified={jest.fn()} />, TALLEST));
    const offset = view.getByTestId('keyboard-avoiding').props.keyboardVerticalOffset;

    // The shape that shipped carried none, and the padding came up short by
    // exactly this much.
    expect(offset).toBeCloseTo(pushedHeaderHeight(59, PixelRatio.get()), 5);
    expect(offset).toBeGreaterThan(90);
  });

  it('and on the shortest', async () => {
    const view = await render(withSafeArea(<DescribeCarScreen onIdentified={jest.fn()} />, SHORTEST));
    expect(view.getByTestId('keyboard-avoiding').props.keyboardVerticalOffset).toBe(64);
  });
});
