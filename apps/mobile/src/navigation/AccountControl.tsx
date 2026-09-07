import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../components/Icon';
import { space, text } from '../theme';

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
      style={[styles.slot, { top: insets.top + space.sm }]}
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
        <Icon name="sliders" size={22} color={text.secondary} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { position: 'absolute', right: space.lg, zIndex: 10 },
});
