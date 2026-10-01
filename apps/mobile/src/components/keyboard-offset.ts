import { useContext } from 'react';
import { PixelRatio } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

/**
 * How far a pushed form's `KeyboardAvoidingView` sits below the top of the
 * window — the number its `keyboardVerticalOffset` has to be.
 *
 * ── ⚠ 1 Oct · audit 360, UX-2: every pushed form came up short ──────────────
 *
 * React Native's `KeyboardAvoidingView` (0.86,
 * `Libraries/Components/Keyboard/KeyboardAvoidingView.js`) pads by
 * `frame.y + frame.height - (keyboard.screenY - keyboardVerticalOffset)`.
 * `frame` is the view's own `onLayout` rectangle — **relative to its parent**
 * — while `screenY` is in window coordinates. Under a native header the
 * parent starts below the status bar and the 44pt bar, so with no offset the
 * padding stops short by exactly that much, and the foot of the form — the
 * last field, its suggestion panel, SAVE or CONTINUE — sat in a ~100pt band
 * under the keyboard that the scroll view could not reach.
 *
 * Seven pushed forms carried no offset. Nothing failed: the form rendered,
 * the keyboard rose, and the button was simply behind it until a tap outside
 * dismissed the keyboard. Roots and Modals are their own window and stay at
 * an explicit `0` (`MarkDoneSheet`, `SignInScreen`, `AdvisorScreen`);
 * `mobile-keyboard-forms.test.ts` holds every `KeyboardAvoidingView` in the
 * app to declaring one or the other.
 *
 * ── Why the arithmetic is copied, not imported ──────────────────────────────
 *
 * The exact value lives in `@react-navigation/elements`' `HeaderHeightContext`,
 * and that package is only a transitive dependency here — importing it
 * would put an undeclared package on the app's import graph (CLAUDE.md §3's
 * fresh-clone failure). So this mirrors `getDefaultHeaderHeight` for the one
 * case the app has (iPhone, portrait — `app.json` pins both, and no form is
 * presented modally): a 44pt bar plus the status bar, where a Dynamic Island
 * device's status bar is its top inset less `5 + 1/scale`.
 *
 * The context read rather than `useSafeAreaInsets()`, for the reason
 * `ScreenTitle` gives: the hook throws without a provider, and the screen
 * suites mount bare.
 */
export const NAV_BAR_HEIGHT = 44;

/** The native header's height over a pushed screen, given the window's top inset. */
export function pushedHeaderHeight(topInset: number, pixelRatio: number = PixelRatio.get()): number {
  const statusBar = topInset > 50 ? topInset - (5 + 1 / pixelRatio) : topInset;
  return NAV_BAR_HEIGHT + statusBar;
}

/** The `keyboardVerticalOffset` for a form pushed under the native header. */
export function usePushedFormKeyboardOffset(): number {
  const insets = useContext(SafeAreaInsetsContext);
  return pushedHeaderHeight(insets?.top ?? 0);
}
