import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import Button from '../components/Button';
import RootScreen from '../components/RootScreen';
import Segmented from '../components/Segmented';
import { BuildScreen } from './BuildScreen';
import { WishlistScreen } from './WishlistScreen';
import { PAGE_BODY, border, space } from '../theme';

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

    ── 13 Sep · the way to add is the tab's primary, not its chrome ──────────

    The control was a mono caps word at the band's trailing edge — the
    Garage's ADD CAR copied to the token, and the pushed instance put the same
    word in the native header's right slot. David, on the root with rows:
    *"i'm not happy with Add CTA. it looks like a nav element, like Account.
    But it's not, it's part of the core functionality of Plan."* He is right
    about both halves. The chrome voice is what makes ADD CAR read as
    navigation, and on the Garage that is the right reading — adding a car is
    occasional. On Plan, adding to the list is what the tab is *for*, and the
    Service root already says what a tab's core act looks like: SCAN INVOICE,
    the full-width primary pinned under the rail, present on every state and
    every scroll position, closing the band with a rule. ADD TO NEEDS is that
    control here — the screen's one filled primary — on the Needs segment
    only, since Mods carries its own ladder with its own verbs.

    Two things follow. The empty Needs state lost its SEE SUGGESTIONS button,
    because two controls doing one job on a screen with nothing on it is the
    redundancy the empty History resolved the same way (§6.15). And the
    pushed instance (the car's hub → PLAN) needs nothing of its own any more:
    `RootScreen` renders the pinned block under a native header too, so the
    12 Sep `headerRight` copy and its "the control must be on both" note are
    gone with the word they carried.

    ⚠ This inherits the open question §6.15 and §6.16 record for Service —
    whether a root's primary should pin or scroll with its list. Whatever
    David rules there rules here; the two roots now make one shape.
  */
  const pinned = (
    <>
      {showsMods ? (
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
      ) : null}

      {segment === 'needs' ? (
        <View style={[styles.add, !showsMods && styles.addAlone]}>
          <Button label="Add to Needs" accessibilityLabel="Add something this car needs" onPress={onAdd} />
        </View>
      ) : null}
    </>
  );

  return (
    <RootScreen title="Plan" plate="plan" pinned={pinned}>
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
        <WishlistScreen vehicleId={vehicleId} onSignOut={onSignOut} />
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
  /*
    The Service root's `scan` band, to the number: full-bleed to the page
    gutter, 12 beneath, and the hairline that closes the pinned block so the
    list passes under a rule (§6.16, round 34). With no rail above it — a
    stock car has no Mods — the control takes the rail's top air itself.
  */
  add: {
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: border.panel,
  },
  addAlone: { paddingTop: space.md },
});
