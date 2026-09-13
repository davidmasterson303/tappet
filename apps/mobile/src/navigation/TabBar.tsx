import { CommonActions, getFocusedRouteNameFromRoute, type NavigationState } from '@react-navigation/native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '../components/Icon';
import { TARGET_MIN, border, brand, space, surface, text, type } from '../theme';
import { lastVehicle } from './last-vehicle';
import { tabTarget, type TabName } from './tab-target';

/*
  ── ⚠ 7 Sep · Account left the bar, Plan took its place ─────────────────────

  David: *"it feels like maybe wishlist should be added to bottom nav and
  account should be moved to some other global nav element… this will convey
  more functionality."*

  The reasoning holds up against what each destination *is*. Three of these tabs
  are things you do to a car — read it, record work on it, ask about it — and
  `Plan` is the fourth of exactly that kind: R15 merged Wishlist and Build into
  one answer to "what should I do to this car next". It had no way in from the
  bar at all, so the app's most forward-looking screen was the hardest to reach.

  `Account` is not that kind of thing. It is the app's own settings, visited
  rarely and never as part of looking after a car, and it was spending a quarter
  of the most valuable chrome in the product. It moves to a control on the
  roots — see `AccountControl`.
*/

/**
 * What each tab is called and what it is drawn with, keyed by its route.
 *
 * ⚠ The **order** is not here. It is the navigator's — `state.routes` below —
 * so the bar cannot disagree with the tree it navigates. `tab-target.ts` carries
 * the argument for that order and for the first root being the garage.
 *
 * ⚠ Four tabs at 375pt is 93pt each, comfortably past the 44pt floor. Five
 * would be 75pt and the bar would start reading as a toolbar; that is the
 * reason the account did not simply become a fifth entry.
 */
const TABS: Record<TabName, { label: string; icon: IconName }> = {
  GarageTab: { label: 'Garage', icon: 'car' },
  /*
    ⚠ 7 Sep: labelled "Service", not "History".

    The tab said HISTORY while its root said SERVICE and DUE was half of that
    screen — so the tab named one *segment* of the thing it opened. The critique
    put it plainly: "the tab names a segment". `Service` is the route, the title
    and the deep-link target that shipped notifications carry; the bar now agrees
    with all three.
  */
  ServiceTab: { label: 'Service', icon: 'wrench' },
  /*
    ⚠ `clock`, and the wrench went to Service.

    The critique: "the wrench — the one glyph that means *service* — sits on
    PLAN instead". Fair. The two screens split on *tense*: Service is work that
    has been done and recorded, Plan is work that has not. A wrench for the
    first, a clock for the second.

    ⚠ `sliders` is gone from the bar entirely — it was doing three jobs at once
    (this tab, the Account tab, and the "What is driving this score" row) and is
    now on none of them.
  */
  PlanTab: { label: 'Plan', icon: 'clock' },
  AdvisorTab: { label: 'Advisor', icon: 'message-square' },
};

/**
 * The vehicle a mounted tab is already about, read off its stack's root.
 *
 * `undefined` until the tab has been opened once, and for the garage, which is
 * about all of them. Read from the nested state first and from pending nested
 * params second — a tab navigated to with `{ screen, params }` carries the car
 * in its params until its stack mounts and takes them.
 */
function mountedVehicle(route: NavigationState['routes'][number]): string | undefined {
  const root = route.state?.routes[0]?.params as { vehicleId?: string } | undefined;
  if (root?.vehicleId) return root.vehicleId;

  const pending = (route.params as { params?: { vehicleId?: string } } | undefined)?.params;
  return pending?.vehicleId;
}

/**
 * ── R13 · the destinations, always in reach ─────────────────────────────────
 *
 * **The advisor is the product.** "AI auto-ownership consultant" is what this
 * app is, and it shipped as a *leaf screen pushed off a car* — so asking a
 * question meant opening the garage, choosing a car, scrolling a hub and
 * pressing a button. Three navigations to reach the thing the product is named
 * for.
 *
 * ── ⚠ 11 Sep · this is `@react-navigation/bottom-tabs`' bar now ─────────────
 *
 * Until today the bar was drawn over a single native stack and `reset` the
 * whole stack on every press — the observable half of B8, built while the
 * structural half was open (drift §6.6). The package is installed now; it is
 * pure JS over `react-native-screens` and `react-native-safe-area-context`,
 * both already in the dev client, so it cost no EAS build. The workspace
 * install it needed is what `package.json`'s jest pins exist to make safe, and
 * `git diff package-lock.json` shows JS packages only.
 *
 * What it buys is **per-tab stacks**: each tab remembers its own history, a
 * root can never grow a chevron pointing sideways at another tab, and the bar
 * is rendered by the navigator itself — outside every screen by construction,
 * which is the structure `mobile-account-reachable.test.ts` exists to keep.
 *
 * This component is the `tabBar` prop: the navigator hands it the tab state
 * and its helpers, and it draws exactly what it drew before.
 *
 * ── ⚠ The press is emitted before it navigates ──────────────────────────────
 *
 * `tabPress` is what a focused tab's stack listens for to pop itself to the
 * top — the native re-tap behaviour lives in `native-stack`, keyed on that
 * event. A bar that navigated without emitting it would leave a re-tap doing
 * nothing three screens deep.
 *
 * ── It is in the layout, not over it ────────────────────────────────────────
 *
 * A bar floating above the content would cover the last row of every list — the
 * same argument `native-wishlist.spec.html` makes against a floating action
 * button. It takes its 49pt out of the frame instead, which the review costed
 * explicitly against the pinned hero and judged worth it.
 *
 * ── The one act it stands down for ──────────────────────────────────────────
 *
 * The invoice scan opens on a viewfinder (B9, 12 Sep), and the critic read a
 * viewfinder above GARAGE / PLAN / ADVISOR as *"a tab child"* in two rounds
 * (34 and 36): a camera is an act, not a place, and the act wants the frame
 * to itself with the readout as its only chrome. So on `InvoiceScan` the bar
 * draws nothing. Still the navigator's, still outside every screen — the
 * structural claim above holds; the bar decides for itself what one route
 * gets, the way a native camera sheet takes the whole screen. The viewfinder
 * pads its own foot by the safe-area inset for the same reason the bar does:
 * without the bar the home indicator is its neighbour.
 */
const ROUTES_WITHOUT_A_BAR = new Set(['InvoiceScan']);

/** The route the focused tab is showing — a pushed screen's name, or the tab's own. */
export function focusedRouteName(state: Pick<BottomTabBarProps['state'], 'routes' | 'index'>): string {
  const tab = state.routes[state.index];
  return tab ? getFocusedRouteNameFromRoute(tab) ?? tab.name : '';
}

export default function TabBar({ state, navigation }: Pick<BottomTabBarProps, 'state' | 'navigation'>) {
  const insets = useSafeAreaInsets();

  if (ROUTES_WITHOUT_A_BAR.has(focusedRouteName(state))) return null;

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}
      accessibilityRole="tablist"
      accessibilityLabel="Main"
    >
      {state.routes.map((route, index) => {
        const tab = TABS[route.name as TabName];
        const selected = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });

          /*
            A focused tab's own stack answers the re-tap (see above); the bar
            only moves between tabs.
          */
          if (selected || event.defaultPrevented) return;

          const target = tabTarget(route.name as TabName, mountedVehicle(route), lastVehicle());

          navigation.dispatch({
            ...CommonActions.navigate(target.name, target.params),
            target: state.key,
          });
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            /*
              ⚠ `selected` is announced; the tint alone is not. A bar whose
              current position is carried entirely by a colour is unusable to
              anyone who cannot separate the two, and this bar is how the app is
              navigated.
            */
            accessibilityState={{ selected }}
            accessibilityLabel={tab.label}
            style={[styles.tab, selected && styles.tabOn]}
          >
            <Icon
              name={tab.icon}
              size={22}
              /*
                ⚠ B8: off-white when active, not cyan. The active tab used to be
                drawn *in* the accent — icon and label both — which made cyan an
                ink. In this system cyan is a rule and a focus ring; the moment
                it becomes ink, "active" and "informational" are the same colour
                and the overline below has nothing left to say.
              */
              color={selected ? text.primary : text.muted}
            />
            <Text style={[styles.label, selected && styles.labelOn]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    backgroundColor: surface.nav,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
    paddingTop: space.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    minHeight: TARGET_MIN,
    /*
      The overline's gutter, transparent at rest. Reserved rather than added on
      selection, so the icon does not step down two points as you move between
      tabs.
    */
    borderTopWidth: 2,
    borderTopColor: 'transparent',
    marginTop: -space.sm,
    paddingTop: space.sm,
  },
  /* B8: "tab-bar active is a cyan overline with off-white ink". */
  tabOn: { borderTopColor: brand.accent },
  /* B1: a tab label is a label. */
  label: { ...type.monoLabel, color: text.muted },
  labelOn: { color: text.primary },
});
