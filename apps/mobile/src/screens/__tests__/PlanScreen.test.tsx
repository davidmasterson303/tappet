/**
 * The Plan root keeps a way to add to Needs, and it is the tab's primary.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * `WishlistScreen`'s empty state carried "See suggestions" and, by its own
 * note, handed the job to the header's `+` once there were rows. The 11 Sep
 * tab rebuild replaced that header with `RootScreen`'s band and nothing put
 * the control back — a list with one item on it had no way to gain a second,
 * which David hit on his phone the same night. The control went into the
 * band's trailing slot as a chrome word, and he rejected that too: *"it
 * looks like a nav element, like Account. But it's not, it's part of the
 * core functionality of Plan."*
 *
 * 13 Sep: it is ADD TO NEEDS, the full-width primary pinned under the rail —
 * the Service root's SCAN INVOICE grammar — on the Needs segment only. These
 * pin the halves: present, filled and wired on Needs, with or without the
 * rail; absent on Mods; and nothing in the native header when pushed, since
 * the pinned block renders there too.
 */
import { render, userEvent } from '@testing-library/react-native';

import { text } from '../../theme';
import { PlanScreen } from '../PlanScreen';

jest.mock('../WishlistScreen', () => ({
  WishlistScreen: () => null,
}));
jest.mock('../BuildScreen', () => ({
  BuildScreen: () => null,
}));

/** The ground a `Button` declares to the contrast audit — the primary's off-white. */
function groundOf(node: unknown): string | undefined {
  if (!node || typeof node !== 'object') return undefined;
  const host = node as { props?: Record<string, unknown>; children?: unknown[] };
  if (typeof host.props?.auditSurface === 'string') return host.props.auditSurface;
  for (const child of host.children ?? []) {
    const found = groundOf(child);
    if (found) return found;
  }
  return undefined;
}

describe('the Plan root', () => {
  it('offers ADD TO NEEDS as the pinned primary on Needs, wired to the catalogue', async () => {
    const onAdd = jest.fn();
    const view = await render(
      <PlanScreen vehicleId="v1" showsMods onSignOut={jest.fn()} onAdd={onAdd} />
    );
    const add = view.getByLabelText('Add something this car needs');
    expect(add.props.accessibilityRole).toBe('button');
    /* The one filled control on the screen — the brief's primary, not chrome. */
    expect(groundOf(add)).toBe(text.primary);
    await userEvent.setup().press(add);
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('offers it without the segment switcher too — a stock car still has needs', async () => {
    const view = await render(
      <PlanScreen vehicleId="v1" showsMods={false} onSignOut={jest.fn()} onAdd={jest.fn()} />
    );
    expect(view.getByLabelText('Add something this car needs')).toBeTruthy();
  });

  it('does not offer it on Mods, which has its own ladder', async () => {
    const view = await render(
      <PlanScreen vehicleId="v1" showsMods initialSegment="mods" onSignOut={jest.fn()} onAdd={jest.fn()} />
    );
    expect(view.queryByLabelText('Add something this car needs')).toBeNull();
  });
});

describe('the pushed Plan (the car\'s hub → PLAN)', () => {
  /*
    The same screen under a native header, where `RootScreen` draws no band
    but does draw the pinned block — so the primary is there without a
    header slot. The mock navigation is what `NavigationContext` hands a
    pushed screen; the 12 Sep `headerRight` copy of the chrome word is gone,
    and this holds that nothing is written to the header any more.
  */
  const { NavigationContext } = jest.requireActual('@react-navigation/native');

  function pushedNavigation() {
    return {
      canGoBack: () => true,
      setOptions: jest.fn(),
      navigate: jest.fn(),
      addListener: jest.fn(() => () => {}),
      isFocused: () => true,
    };
  }

  it('keeps the primary in the pinned block, wired, with nothing in the header', async () => {
    const onAdd = jest.fn();
    const navigation = pushedNavigation();
    const view = await render(
      <NavigationContext.Provider value={navigation as never}>
        <PlanScreen vehicleId="v1" showsMods onSignOut={jest.fn()} onAdd={onAdd} />
      </NavigationContext.Provider>
    );
    await userEvent.setup().press(view.getByLabelText('Add something this car needs'));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(navigation.setOptions).not.toHaveBeenCalled();
  });

  it('offers nothing on Mods when pushed either', async () => {
    const navigation = pushedNavigation();
    const view = await render(
      <NavigationContext.Provider value={navigation as never}>
        <PlanScreen vehicleId="v1" showsMods initialSegment="mods" onSignOut={jest.fn()} onAdd={jest.fn()} />
      </NavigationContext.Provider>
    );
    expect(view.queryByLabelText('Add something this car needs')).toBeNull();
  });
});
