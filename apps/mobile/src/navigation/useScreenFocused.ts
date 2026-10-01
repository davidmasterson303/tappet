import { useContext, useEffect, useState } from 'react';
import { NavigationContext } from '@react-navigation/native';

/**
 * Whether the screen that calls this is the one the owner is looking at.
 *
 * ── Audit 360, UX-20 (1 Oct) · an ask about this car, over another page ────
 *
 * The car's page stays mounted while the owner is on the Service tab or in
 * the advisor (nothing in the navigators sets `unmountOnBlur`), and its
 * research keeps polling. Once the push primer waited for the research to
 * settle (UX-16), the primer and the score's sheet — two app-level `Modal`s —
 * could rise 40 s after the owner had walked away, over a screen that has
 * nothing to do with "alerts about this car". A sheet about this car is
 * raised only while this car's page is focused; the asks wait, unanswered,
 * and present when the owner comes back.
 *
 * ── Why not `useIsFocused` ──────────────────────────────────────────────────
 *
 * The same reason `useRefetchOnFocus` is not `useFocusEffect`: React
 * Navigation's hook throws outside a navigator, and every screen suite here
 * mounts its screen bare. `NavigationContext` read directly is `undefined`
 * there, which reads as focused — a bare screen is the only thing on screen.
 * Inside a navigator this is `useIsFocused`: the current answer, then the
 * `focus` and `blur` events, which reach a nested screen when its tab or
 * stack parent moves.
 */
export function useScreenFocused(): boolean {
  const navigation = useContext(NavigationContext);
  const [focused, setFocused] = useState(() => navigation?.isFocused() ?? true);

  useEffect(() => {
    if (!navigation) {
      setFocused(true);
      return;
    }
    setFocused(navigation.isFocused());
    const offFocus = navigation.addListener('focus', () => setFocused(true));
    const offBlur = navigation.addListener('blur', () => setFocused(false));
    return () => {
      offFocus();
      offBlur();
    };
  }, [navigation]);

  return focused;
}
