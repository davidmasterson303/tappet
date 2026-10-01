import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';
import {
  NavigationContext,
  NavigationRouteContext,
  PreventRemoveContext,
} from '@react-navigation/native';

/**
 * Ask before a back gesture throws away what was typed.
 *
 * ── ⚠ 1 Oct · audit 360, UX-3 ───────────────────────────────────────────────
 *
 * Nothing in the app intercepted removal. On THIS CAR an owner could write
 * their ownership objective, swipe from the edge out of habit, come back —
 * and find the field blank with nothing having said it would be. The same
 * on a described car four fields in, a tire set, a typed VIN.
 *
 * So a form holding unsaved work asks first: **Discard your changes?** with
 * KEEP EDITING as the safe answer. Only the acts that mean "go back" are
 * asked about — the edge swipe and the header's back (`POP`, `GO_BACK`) and
 * a re-tap of the tab (`POP_TO_TOP`). A form's own forward step (`REPLACE`
 * from the VIN to the answers), the add-car flow's `POP_TO`, and the removal
 * screen's navigate away all pass, because the work went somewhere.
 *
 * Call `release()` before a successful save navigates back: the save's own
 * `goBack()` is a `GO_BACK`, and the state that says "dirty" has not
 * re-rendered yet on that tick.
 *
 * ── Why this is not `usePreventRemove` ──────────────────────────────────────
 *
 * The library hook calls `useNavigation()` and `useRoute()`, which **throw**
 * outside a navigator — and every screen suite here mounts its screen bare
 * (`useRefetchOnFocus` carries the argument). It also prevents *every*
 * removal while the flag is up, where this needs to let a form's own forward
 * step through. So it does the same three things from the contexts, each of
 * which is simply absent without a navigator:
 *
 *   1. registers the route with `PreventRemoveContext`, which is what makes
 *      native-stack set `preventNativeDismiss` — without it the iOS edge swipe
 *      pops the native screen regardless and the JS state falls out of step;
 *   2. listens for `beforeRemove` and prevents the back acts while dirty;
 *   3. re-dispatches the held action on DISCARD — core marks it visited, so
 *      it is not asked about twice.
 */

/** The removal acts that mean "go back", and so are worth a question. */
const BACK_ACTIONS = new Set(['GO_BACK', 'POP', 'POP_TO_TOP']);

export const DISCARD_COPY = {
  title: 'Discard your changes?',
  body: 'What you have entered here has not been saved.',
  keep: 'Keep editing',
  discard: 'Discard',
} as const;

let nextGuardId = 0;

export function useConfirmDiscard(dirty: boolean): () => void {
  const navigation = useContext(NavigationContext);
  const route = useContext(NavigationRouteContext);
  const prevent = useContext(PreventRemoveContext);
  const [id] = useState(() => `confirm-discard-${(nextGuardId += 1)}`);

  const released = useRef(false);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const routeKey = route?.key;
  const setPreventRemove = prevent?.setPreventRemove;
  const notifyPreventRemove = prevent?.notifyPreventRemove;

  useEffect(() => {
    if (!setPreventRemove || !routeKey) return;
    setPreventRemove(id, routeKey, dirty);
    notifyPreventRemove?.();
    return () => {
      setPreventRemove(id, routeKey, false);
      notifyPreventRemove?.();
    };
  }, [setPreventRemove, notifyPreventRemove, id, routeKey, dirty]);

  useEffect(() => {
    if (!navigation) return;

    return navigation.addListener('beforeRemove', (event) => {
      if (!dirtyRef.current || released.current) return;

      const action = event.data.action;
      if (!BACK_ACTIONS.has(action.type)) return;

      event.preventDefault();
      Alert.alert(DISCARD_COPY.title, DISCARD_COPY.body, [
        { text: DISCARD_COPY.keep, style: 'cancel' },
        {
          text: DISCARD_COPY.discard,
          style: 'destructive',
          onPress: () => {
            released.current = true;
            navigation.dispatch(action);
          },
        },
      ]);
    });
  }, [navigation]);

  return useCallback(() => {
    released.current = true;
  }, []);
}
