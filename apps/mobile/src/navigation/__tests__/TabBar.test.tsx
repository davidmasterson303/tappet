import { render, userEvent } from '@testing-library/react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';

import TabBar from '../TabBar';
import { rememberGarageSize, rememberVehicle } from '../last-vehicle';
import { TAB_NAMES, type TabName } from '../tab-target';
import { withSafeArea } from '../../test-support/safe-area';

/**
 * The bar is how the app is navigated, and where the account's way in sits
 * beside it is a compliance requirement.
 *
 * ── What App Store 5.1.1(v) needs from this file ────────────────────────────
 *
 * Account deletion must be initiated from inside the app and must be genuinely
 * available. It used to be a text link in the garage header, guarded by five
 * cases in `GarageScreen.test.tsx` asserting that every one of that screen's
 * states still rendered it — a guarantee held together by vigilance, and one
 * that had already been lost when the loading and error states returned early.
 *
 * ⚠ 11 Sep: the bar is `@react-navigation/bottom-tabs`' own `tabBar` now,
 * rendered by the navigator outside every screen; the account control floats
 * beside it as a sibling of the root navigator. `mobile-account-reachable.test.ts`
 * holds both of those structural facts. What is left to check *here* is that the
 * bar offers the four roots by name, announces which is current, and moves
 * between them the way the navigator expects — emitting `tabPress` first, so a
 * focused tab's own stack can answer a re-tap, and carrying the last car to a
 * tab that is not yet about it.
 */

/** A tab navigator's state, at `index`, with whatever nested state each tab has. */
function tabState(
  index: number,
  nested: Partial<Record<TabName, { vehicleId?: string }>> = {}
): BottomTabBarProps['state'] {
  return {
    key: 'tabs',
    index,
    type: 'tab',
    stale: false,
    routeNames: [...TAB_NAMES],
    history: [],
    preloadedRouteKeys: [],
    routes: TAB_NAMES.map((name) => ({
      key: `${name}-key`,
      name,
      ...(nested[name]
        ? {
            state: {
              routes: [{ name: name.replace('Tab', ''), params: nested[name] }],
            },
          }
        : {}),
    })),
  } as BottomTabBarProps['state'];
}

/** The navigator's helpers, as far as the bar uses them. */
function helpers(prevent = false) {
  const dispatch = jest.fn();
  const emit = jest.fn(() => ({ defaultPrevented: prevent }));
  return {
    dispatch,
    emit,
    navigation: { dispatch, emit } as unknown as BottomTabBarProps['navigation'],
  };
}

beforeEach(() => {
  rememberGarageSize([]);
});

describe('the tab bar', () => {
  it('stands down on the invoice scan, and on nothing else', async () => {
    /*
      A viewfinder above GARAGE / PLAN / ADVISOR read as "a tab child" to the
      critic in rounds 34 and 36 — a camera is an act, not a place. The bar
      is still the navigator's and still outside every screen; it draws
      nothing for that one route, read off the focused tab's nested state the
      way `getFocusedRouteNameFromRoute` reads it. The other half is pinned
      too: the same tab, one screen shallower, keeps its bar.
    */
    const scanning = tabState(1);
    scanning.routes[1] = {
      ...scanning.routes[1],
      state: {
        index: 1,
        routes: [
          { name: 'Service', params: { vehicleId: 'v1' } },
          { name: 'InvoiceScan', params: { vehicleId: 'v1' } },
        ],
      },
    } as (typeof scanning.routes)[number];
    const hidden = await render(withSafeArea(<TabBar state={scanning} navigation={helpers().navigation} />));
    expect(hidden.queryAllByRole('tab')).toEqual([]);

    const shown = await render(
      withSafeArea(<TabBar state={tabState(1, { ServiceTab: { vehicleId: 'v1' } })} navigation={helpers().navigation} />)
    );
    expect(shown.getAllByRole('tab')).toHaveLength(4);
  });

  it('offers all four destinations, by name, in the navigator’s order', async () => {
    const view = await render(
      withSafeArea(<TabBar state={tabState(0)} navigation={helpers().navigation} />)
    );

    /*
      ⚠ The order is the navigator's, not this file's — `tab-target.ts`
      carries the argument. Asserted in order because a graded round was
      judged against exactly this sequence, and a bar that read the table
      rather than the state could reorder itself without anything else going
      red.
    */
    const tabs = view.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel);
    expect(tabs).toEqual(['Car', 'Advisor', 'Service', 'Plan']);
  });

  it('leads with the car, and spends no tab on the set it belongs to (23 Sep)', async () => {
    /*
      The 6 Sep brief folded the car into the garage's first tab, and a
      one-car owner then needed two taps to get back to the car. 21 Sep gave
      the car its own tab beside the garage's — *"most people may only have
      one car"* — which left two tabs about one car: a bay was the hub's
      plate, strip, dial, next service and recall count, one tap from the
      fuller page.

      23 Sep spends the slot properly. The car leads and the set is a sheet
      its name opens, so a one-car owner never meets a set UI at all. What is
      pinned here is the **absence**: a garage tab returning is a regression
      to the redundancy the switcher loop removed, not a new feature.
    */
    const view = await render(
      withSafeArea(<TabBar state={tabState(0)} navigation={helpers().navigation} />)
    );

    const labels = view.getAllByRole('tab').map((tab) => tab.props.accessibilityLabel);
    expect(labels[0]).toBe('Car');
    expect(labels).not.toContain('Garage');
  });

  it('announces which one is current, not only tints it', async () => {
    const view = await render(
      withSafeArea(<TabBar state={tabState(2)} navigation={helpers().navigation} />)
    );

    expect(view.getByLabelText('Service').props.accessibilityState).toMatchObject({
      selected: true,
    });
    expect(view.getByLabelText('Car').props.accessibilityState).toMatchObject({
      selected: false,
    });
  });

  it('emits tabPress first, then navigates to the pressed tab', async () => {
    const { navigation, emit, dispatch } = helpers();
    const view = await render(withSafeArea(<TabBar state={tabState(0)} navigation={navigation} />));

    await userEvent.press(view.getByLabelText('Plan'));

    /*
      The order is the contract. A focused tab's stack pops itself to the top
      on `tabPress`; a bar that navigated first would move the tabs before the
      event the stacks listen for had been raised.
    */
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'tabPress', target: 'PlanTab-key', canPreventDefault: true })
    );
    expect(emit.mock.invocationCallOrder[0]).toBeLessThan(dispatch.mock.invocationCallOrder[0]);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'NAVIGATE',
        payload: expect.objectContaining({ name: 'PlanTab' }),
        target: 'tabs',
      })
    );
  });

  it('carries the last car to a tab that is not yet about it', async () => {
    /*
      Three tabs are about one car and the bar has none — `lastVehicle()` is
      the car most recently on screen, or the garage's only one. The target
      pops the tab's stack to its root and re-keys it, which is what makes a
      thread about car A stop when car B is opened.
    */
    rememberVehicle('car-b', '2015 BMW M235i');
    const { navigation, dispatch } = helpers();
    const view = await render(withSafeArea(<TabBar state={tabState(0)} navigation={navigation} />));

    await userEvent.press(view.getByLabelText('Service'));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: {
          name: 'ServiceTab',
          params: {
            screen: 'Service',
            params: { vehicleId: 'car-b', title: '2015 BMW M235i', segment: 'history' },
            pop: true,
          },
        },
      })
    );
  });

  it('leaves a tab’s own history alone when it is already about that car', async () => {
    rememberVehicle('car-a');
    const { navigation, dispatch } = helpers();
    const view = await render(
      withSafeArea(
        <TabBar state={tabState(0, { ServiceTab: { vehicleId: 'car-a' } })} navigation={navigation} />
      )
    );

    await userEvent.press(view.getByLabelText('Service'));

    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ payload: { name: 'ServiceTab' } })
    );
  });

  it('does not navigate on the focused tab — its stack answers the re-tap', async () => {
    const { navigation, emit, dispatch } = helpers();
    const view = await render(withSafeArea(<TabBar state={tabState(0)} navigation={navigation} />));

    await userEvent.press(view.getByLabelText('Car'));

    expect(emit).toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('respects a listener that prevents the press', async () => {
    const { navigation, dispatch } = helpers(true);
    const view = await render(withSafeArea(<TabBar state={tabState(0)} navigation={navigation} />));

    await userEvent.press(view.getByLabelText('Advisor'));

    expect(dispatch).not.toHaveBeenCalled();
  });

  it('is reachable from every position, including its own', async () => {
    /*
      The anti-vacuous half: a bar that hid the current tab's own control would
      pass the cases above and would strand somebody on the tab they are
      already looking at.
    */
    const view = await render(
      withSafeArea(<TabBar state={tabState(2)} navigation={helpers().navigation} />)
    );

    expect(view.getByLabelText('Plan')).toBeTruthy();
    expect(view.getByLabelText('Car')).toBeTruthy();
  });
});
