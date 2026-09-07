import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon, { type IconName } from '../components/Icon';
import { TARGET_MIN, border, brand, space, surface, text, type } from '../theme';

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
  roots — see `ScreenTitle`'s trailing slot.
*/
export type TabName = 'Garage' | 'History' | 'Advisor' | 'Plan';

/**
 * ── ⚠ Four, and the first one is a car rather than the garage ──────────────
 *
 * David, 30 Aug: *"garage link in bottom nav should be replaced with car detail
 * view, not to garage view. There's no reason people need to go back to garage
 * so often."* He is right about the traffic — most owners have one car, and a
 * list of one is a step between somebody and the thing they opened the app for.
 *
 * So the first tab keeps its name and changes its destination: it opens the car
 * you were last looking at, and falls back to the garage when there is not one.
 * The garage is still reachable, from the car's own header — see
 * `VehicleDetailScreen`. It became a place you visit, rather than the lobby you
 * pass through.
 *
 * **History is new and is the invoices**, not the service log. `Service →
 * History` still lists every record; this lists what came off a photographed
 * document, and carries the control that starts a new scan.
 *
 * ⚠ Four tabs at 375pt is 93pt each, comfortably past the 44pt floor. Five
 * would be 75pt and the bar would start reading as a toolbar; that is the
 * reason the garage did not simply become a fifth entry.
 */
const TABS: ReadonlyArray<{ name: TabName; label: string; icon: IconName }> = [
  { name: 'Garage', label: 'Car', icon: 'car' },
  { name: 'History', label: 'History', icon: 'file-text' },
  { name: 'Advisor', label: 'Advisor', icon: 'message-square' },
  /*
    ⚠ `wrench`, not `sliders`. `sliders` went with Account, and it was already
    doing two jobs — the critique caught it as "one glyph for both the Account
    tab and the 'What is driving this score' row". A wrench is what this screen
    is about: the work a car still needs.
  */
  { name: 'Plan', label: 'Plan', icon: 'wrench' },
];

/**
 * ── R13 · three destinations, always in reach ───────────────────────────────
 *
 * **The advisor is the product.** "AI auto-ownership consultant" is what this
 * app is, and it shipped as a *leaf screen pushed off a car* — so asking a
 * question meant opening the garage, choosing a car, scrolling a hub and
 * pressing a button. Three navigations to reach the thing the product is named
 * for.
 *
 * **Account was a text link in the garage header**, and account deletion is
 * required by App Store 5.1.1(v) to be reachable — which
 * `mobile-account-reachable.test.ts` had already caught being lost in a loading
 * state once. On the bar it is reachable by construction rather than by
 * remembering to render it.
 *
 * ── ⚠ Why this is not `@react-navigation/bottom-tabs` ───────────────────────
 *
 * That package is JS-only, so it would cost no EAS build — but installing it
 * runs an install across this workspace, and `package.json`'s own notes record
 * what that has cost here before: a full workspace install hoists `apps/mobile`'s
 * jest 29 to the root and splits the web app's jest 30 across two trees, which
 * killed **every** web suite before its first test with a `TypeError` nobody
 * could place. The pins exist to stop that by construction.
 *
 * What bottom-tabs buys over this is **per-tab stacks**: each tab remembering
 * its own history. That is real, and it is not what R13 is about — the finding
 * is that the advisor and the account are unreachable, and a bar that navigates
 * on one stack fixes that completely. When a tab genuinely needs its own
 * history, that is the moment to spend the install and verify it with
 * `rm -rf node_modules && npm ci`.
 *
 * ── It is in the layout, not over it ────────────────────────────────────────
 *
 * A bar floating above the content would cover the last row of every list — the
 * same argument `native-wishlist.spec.html` makes against a floating action
 * button. It takes its 49pt out of the frame instead, which the review costed
 * explicitly against the pinned hero and judged worth it.
 */
export default function TabBar({
  current,
  onSelect,
}: {
  /** The route the stack is currently showing, so the bar can mark itself. */
  current: TabName;
  onSelect: (tab: TabName) => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[styles.bar, { paddingBottom: Math.max(insets.bottom, space.sm) }]}
      accessibilityRole="tablist"
      accessibilityLabel="Main"
    >
      {TABS.map((tab) => {
        const selected = tab.name === current;

        return (
          <Pressable
            key={tab.name}
            onPress={() => onSelect(tab.name)}
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