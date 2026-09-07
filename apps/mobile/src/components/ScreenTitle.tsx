import { NavigationContext } from '@react-navigation/native';
import { useContext } from 'react';
import { StyleSheet, Text } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { space, text, type } from '../theme';

/**
 * A root screen's own name, set in the condensed grotesk.
 *
 * ── ⚠ Why this is in the screen and not in the navigator ────────────────────
 *
 * Locked brief B8 asks for *"a left-aligned 34pt condensed-grotesk caps title
 * that collapses on scroll into a mono caps nav title"*. iOS has a feature that
 * is exactly that shape — `headerLargeTitle` on `native-stack` — and it was
 * tried first, because a platform behaviour is better than a hand-rolled one.
 *
 * **It does not work for these screens.** UIKit's large title assumes the
 * screen's first child is the scroll view it collapses against. Service pins a
 * search field and a segment rail above its list, and Account opens on a
 * non-scrolling block — so the title's frame drew straight over them: the
 * segment rail vanished entirely and the search field lost its top edge. Not a
 * padding bug; the header and the content were laying out in the same space.
 *
 * `headerTitleAlign: 'left'` is not an alternative either — it is a JS-stack
 * option that `native-stack` hands to UIKit, which ignores it and centres the
 * title anyway.
 *
 * So the title is drawn in the screen, which is what `GarageScreen` already
 * does and the reason its header was the one the critique kept calling correct.
 * The mono nav title in `screenOptions` stays as the collapsed form.
 *
 * ⚠ **The caps are `textTransform` here, not baked into the string.** The
 * opposite is true one level up: `headerTitleStyle` goes to a native `UILabel`
 * which ignores `textTransform`, so those titles are written in caps at the
 * call site. Two rules, because two renderers — worth knowing before "fixing"
 * one to match the other.
 */
export default function ScreenTitle({ children }: { children: string }) {
  /*
    ⚠ Both of these read their **context** rather than calling the library's
    hook, and for the same reason: `useSafeAreaInsets()` and `useNavigation()`
    each *throw* when their provider is absent, and three `AccountScreen` tests
    render the screen on its own — the confirmation-gate cases, which are the
    ones standing between a typo and a deleted account. A title component must
    not be able to take those down.

    Both context reads return null/undefined in that case, and both have an
    obviously correct answer there: no inset, and nothing to go back to.
  */
  const insets = useContext(SafeAreaInsetsContext);
  /*
    ⚠ `useContext(NavigationContext)` rather than `useNavigation()`. The hook
    **throws** when there is no navigator above it, and three `AccountScreen`
    tests render the screen on its own — the confirmation-gate cases, which are
    the ones standing between a typo and a deleted account. A title component
    must not be able to take those down.

    The context read returns `undefined` in that case, and a screen with no
    navigator has nothing to go back to, so `false` is also the right answer.
  */
  const navigation = useContext(NavigationContext);

  /*
    ── ⚠ The safe-area inset, and why it is conditional ──────────────────────

    `rootTitle` hides the native header on a root (`headerShown: canGoBack()`),
    and hiding the header hides the thing that was insetting content below the
    status bar and the notch. The first capture after that change had SERVICE
    drawn *through* the clock.

    The same screen pushed from the car's hub keeps its header, which insets for
    it — adding the inset there too would leave ~59pt of dead graphite under the
    header.

    So the condition mirrors `rootTitle`'s exactly, in the one other place that
    needs to know: there is a header if and only if this screen can go back.
  */
  const hasHeader = navigation?.canGoBack() ?? false;

  return (
    <Text style={[styles.title, { paddingTop: (hasHeader ? 0 : (insets?.top ?? 0)) + space.sm }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    ...type.display,
    color: text.primary,
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
  },
});
