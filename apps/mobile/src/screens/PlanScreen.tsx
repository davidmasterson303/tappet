import { useContext, useLayoutEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContext } from '@react-navigation/native';

import RootScreen from '../components/RootScreen';
import Segmented from '../components/Segmented';
import { BuildScreen } from './BuildScreen';
import { WishlistScreen } from './WishlistScreen';
import { PAGE_BODY, space, text, type, TARGET_MIN } from '../theme';

export type PlanSegment = 'needs' | 'mods';

/**
 * Plan: what this car needs, and what you want to do to it.
 *
 * ── ⚠ R15 · one question, split across two hub rows ─────────────────────────
 *
 * `Wishlist` and `Build` both answer *"what should I do to this car next"*.
 * Both are ordered lists of jobs with chips, both have a suggestions source and
 * a user-added path, and the only difference is that one is **needs** and the
 * other is **wants**.
 *
 * Splitting them across two destinations made the owner classify a job before
 * they could look for it — and the review's example is exact: a **charge pipe**
 * on an M235i is genuinely both. It is a known failure point and it is the
 * first thing anyone modifies. Under two lists it is filed wrong half the time
 * and then cannot be found.
 *
 * ── What stays on which side ────────────────────────────────────────────────
 *
 * The **progression ladder stays on `Mods`**, because it is specific to mods:
 * "control before more power" is advice about modifying, not about maintenance.
 * The build dial goes with it and reports that segment.
 *
 * ⚠ `Mods` is shown only when the owner has not answered "stock" — the same
 * `showsModifications` gate the hub row had. A person who told us they are not
 * modifying the car should not be offered a segment about modifying it, and a
 * one-segment control is not a control.
 */
export function PlanScreen({
  vehicleId,
  title,
  showsMods,
  initialSegment = 'needs',
  onSignOut,
  onAdd,
}: {
  vehicleId: string;
  title?: string;
  /** `showsModifications(vehicle.performance_mindedness)`, decided by the hub. */
  showsMods: boolean;
  initialSegment?: PlanSegment;
  onSignOut: () => void;
  /** Opens the suggestions catalogue, which writes to `Needs`. */
  onAdd: () => void;
}) {
  const [segment, setSegment] = useState<PlanSegment>(showsMods ? initialSegment : 'needs');

  /*
    ⚠ 7 Sep · B8: the root's own name, in the condensed grotesk, like every
    other root. `Plan` was reached only by a push until it became a tab, so it
    had been living with a pushed screen's header — the nav bar's sentence-case
    label and no title of its own.

    11 Sep: `RootScreen` draws it and collapses it into the mono nav title once
    the list has scrolled; the rail is `pinned` under the band. Each segment's
    scroller signs the scroll contract with `useRootScroll()`.
  */
  const pinned = showsMods ? (
    <View style={styles.switcher}>
      <Segmented
        accessibilityLabel="Plan"
        value={segment}
        onChange={setSegment}
        options={[
          { value: 'needs', label: 'Needs' },
          { value: 'mods', label: 'Mods' },
        ]}
      />
    </View>
  ) : null;

  /*
    ── ⚠ The way to add lives here, in the chrome, once rows exist ──────────

    `WishlistScreen`'s empty state carries "See suggestions" and, by its own
    note, hands the job to the nav bar's `+` once there are rows — "one
    control per state". That `+` was the old stack header's, and the 11 Sep
    tab rebuild replaced the header with `RootScreen`'s band. Nothing put the
    control back: David, on his phone the same night, "i'm missing options to
    add more items to my list". It is the Garage's "Add car" exactly — a mono
    caps word at the band's trailing edge, `RootScreen`'s `trailing`, in the
    voice B1 gives chrome — and only on Needs, since Mods has its own ladder.
  */
  const add =
    segment === 'needs' ? (
      <View style={styles.headerActions}>
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel="Add something this car needs"
          style={styles.headerAction}
        >
          <Text style={styles.headerActionLabel}>Add</Text>
        </Pressable>
      </View>
    ) : null;

  /*
    ── ⚠ Plan is a root *and* a pushed screen, and the control must be on both ──

    The car's hub pushes this same screen (THIS CAR → PLAN) with a native
    header, and `RootScreen` draws no band there — so the `trailing` slot
    never renders and the first fix (12 Sep, morning) left the pushed Plan
    with no way to add. David hit exactly that within the hour. When pushed,
    the control goes into the native header's right slot instead: the same
    word, the same chrome. `NavigationContext` is read the way `RootScreen`
    reads it, so a screen mounted bare in a test still renders.
  */
  const navigation = useContext(NavigationContext);
  const pushed = navigation?.canGoBack() ?? false;
  useLayoutEffect(() => {
    if (!pushed || !navigation) return;
    navigation.setOptions({ headerRight: add ? () => add : undefined });
  }, [pushed, navigation, add]);

  return (
    <RootScreen title="Plan" plate="plan" pinned={pinned} trailing={pushed ? null : add}>
      {segment === 'mods' && showsMods ? (
        <BuildScreen
          vehicleId={vehicleId}
          title={title}
          onSignOut={onSignOut}
          /*
            The build screen's own "add" led to the wishlist as a separate
            destination. Inside one screen it is a segment switch, which is the
            merge doing its job — the two lists are no longer places.
          */
          onOpenWishlist={() => setSegment('needs')}
        />
      ) : (
        <WishlistScreen vehicleId={vehicleId} onSignOut={onSignOut} onAdd={onAdd} />
      )}
    </RootScreen>
  );
}

const styles = StyleSheet.create({
  switcher: {
    paddingHorizontal: PAGE_BODY.paddingHorizontal,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  // The Garage's header chrome, to the token — one voice for one job.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  headerAction: { minHeight: TARGET_MIN, paddingTop: 6 },
  headerActionLabel: { ...type.monoLabel, color: text.secondary, textTransform: 'uppercase' },
});
