import { StyleSheet, View } from 'react-native';

import EmptyState from './EmptyState';
import RootScreen from './RootScreen';
import { surface } from '../theme';

/**
 * A car tab opened with no car to be about.
 *
 * ── ⚠ Why this exists instead of a bounce ───────────────────────────────────
 *
 * Service, Plan and the Advisor are each about *one* car, and the bar cannot
 * know which. `lastVehicle()` answers when a car has been on screen or the
 * garage holds exactly one; in a two-car garage on a cold start it honestly
 * cannot, and the old bar's answer was to reset the press back to the garage
 * — two of four tabs bouncing with no explanation, which David reported from a
 * real phone as *"I can only access first tab."* Nothing told him why, because
 * nothing had happened.
 *
 * Under per-tab stacks the press lands on the tab, and the tab says what it
 * needs. §10: a screen that cannot name a car must not guess one — *"the first
 * in the list, the last one persisted, whatever"* would open a thread about
 * somebody else's vehicle — so it asks instead, with the one button that
 * resolves it. The brief's empty-state shape: mono caption, sans body, one
 * button, left-aligned.
 *
 * It wears the root's own name so the tab does not change character while it
 * is empty: the band, the collapse and the account control are all where they
 * would be with a car.
 */
export default function ChooseACar({
  title,
  onOpenGarage,
}: {
  /** The root this stands in for — "Service", "Plan", "Advisor". */
  title: string;
  onOpenGarage: () => void;
}) {
  return (
    <RootScreen title={title}>
      <View style={styles.body}>
        <EmptyState
          headline="No car chosen"
          body="Open a car in the garage and this tab follows it."
          actionLabel="Open the garage"
          onAction={onOpenGarage}
        />
      </View>
    </RootScreen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: surface.page },
});
