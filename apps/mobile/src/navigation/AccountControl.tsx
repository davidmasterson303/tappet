import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_BAND } from '../components/RootScreen';
import { space, text, type } from '../theme';

/**
 * The way into the account, from every root, as a sibling of the navigator.
 *
 * ── ⚠ Why this is here and not in a screen's header ─────────────────────────
 *
 * David asked for the account to leave the tab bar so `Plan` could take the
 * slot: *"account should be moved to some other global nav element, maybe icon
 * in top right."* The design reasoning is sound — three tabs are things you do
 * to a car and `Plan` is a fourth of that kind, while the account is the app's
 * own settings.
 *
 * ⚠ **The obvious implementation is the one that already failed.**
 * `mobile-account-reachable.test.ts` guards App Store guideline **5.1.1(v)**,
 * and its docblock records what happened when this control lived inside a
 * screen: the account was a modal owned by `GarageScreen`, whose loading and
 * error branches returned before the header — so the one person most likely to
 * be deleting their account, the one whose app is not working, had no way to
 * reach it. R13 replaced that vigilance with a *structure*: the bar is a sibling
 * of `Stack.Navigator`, and no early return inside a screen can take it away.
 *
 * Moving the control into each root's header would hand that guarantee back to
 * vigilance. So it moves position without moving *level*: still a sibling of the
 * navigator, still outside every screen, just drawn top-right instead of in the
 * bar.
 *
 * ⚠ **Roots only.** A pushed screen has a header with its own back control, and
 * a floating glyph would land on top of it. `RootNavigator` passes `visible`
 * from the same route check that drives the bar, so this appears exactly where a
 * root's title is and nowhere else.
 */
export default function AccountControl({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}) {
  const insets = useSafeAreaInsets();

  if (!visible) return null;

  return (
    <View
      /*
        ⚠ 11 Sep: centred on the 44pt band a root's title collapses into, so
        the mono nav title and this word share a baseline once the screen has
        scrolled — they are the two things on that row. At rest it sits a few
        points above the large title's optical centre, which reads as a nav
        control should: on the bar, not on the heading.
      */
      style={[styles.slot, { top: insets.top + (NAV_BAND - type.monoLabel.lineHeight) / 2 }]}
      pointerEvents="box-none"
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        /*
          Named as the destination, not the drawing. "Account" alone leaves a
          screen-reader user to guess whether it opens something or reports
          something — the same finding R10 recorded against the score chip.
        */
        accessibilityLabel="Account and settings"
        /* R25: drawn small enough to sit beside a title, tappable at 44. */
        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
      >
        {/*
          ── ⚠ 7 Sep: a word, not a glyph, and the reason is a real misfire ────

          This was `sliders`, which is the universal **filter** icon. The
          critique found where that lands: it sits directly above a search field
          on Service and above a segmented list on Plan, so "a user tapping to
          filter lands on Sign Out."

          There is no icon in the set that says *account* without saying
          something else first — `sliders` says filter, a gear says system
          settings, a person says profile-you-can-edit. The system already has a
          face for short, quiet, unambiguous labels, and B1 hands every one of
          them to the mono: so this says ACCOUNT.

          It also removes the last of `sliders`' three simultaneous jobs — this
          control, the old Account tab, and the "What is driving this score" row.
        */}
        <Text style={styles.label}>Account</Text>
      </Pressable>
    </View>
  );
}

/**
 * The width a root must keep clear on its right, for the floating control.
 *
 * ⚠ Exported because the control floats *over* the roots rather than in their
 * layout, so nothing stops a screen drawing its own action underneath it — and
 * on the first build, something did: `GarageScreen`'s "add a car" `+` sits at
 * exactly this corner and the account icon covered it. That `+` is the only way
 * to add a second vehicle, so covering it silently removes a feature.
 *
 * A screen with its own top-right action pads by this instead of guessing.
 */
export const ACCOUNT_CONTROL_SLOT = 62 + space.lg;

const styles = StyleSheet.create({
  slot: { position: 'absolute', right: space.lg, zIndex: 10 },
  /* Mono caps, the same voice the tab labels use — this is chrome, like them. */
  label: { ...type.monoLabel, color: text.secondary, textTransform: 'uppercase' },
});
