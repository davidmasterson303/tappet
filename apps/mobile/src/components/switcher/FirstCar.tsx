import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Text from '../Text';

import Button from '../Button';
import { useCarSet } from './car-set';
import { PAGE_BODY, space, surface, text, type } from '../../theme';

/**
 * The cold start, in a car-first app: open the car, or ask for the first one.
 *
 * ── The gap the concepts uncovered ──────────────────────────────────────────
 *
 * Every car tab renders through `withCar`, and with no car in its params it
 * draws `ChooseACar` — *"Open a car in the garage and this tab follows it"*,
 * with a button to the garage. Remove the garage tab and that sentence names
 * a place that no longer exists, on the one screen a first-time owner sees.
 *
 * A car-first app answers it the way Tesla's does: **it opens on a car.** On
 * a cold start with nothing remembered, the set is fetched and the first car
 * is opened — the app is about a car, so it picks one rather than asking
 * which. An owner with three cars changes it with the switcher a moment
 * later; an owner with one never notices there was a choice.
 *
 * ⚠ Two states this must not collapse together. **No car yet** is the
 * ordinary first run and gets the invitation to add one. **A set we could
 * not read** is a failure and says so — opening nothing and saying nothing
 * would leave a blank screen that looks like an empty garage, which is the
 * "missing data reads as no data" failure this codebase keeps naming.
 *
 * ⚠ Temporary, with the rest of the 22 Sep concept round: it is shared by all
 * three concepts, because it belongs to the structure they answer rather than
 * to any one of them.
 */
export default function FirstCar({
  onOpenCar,
  onAddCar,
}: {
  onOpenCar: (vehicleId: string, title: string) => void;
  onAddCar: () => void;
}) {
  const { cars } = useCarSet(true);

  useEffect(() => {
    const first = cars[0];
    if (first) onOpenCar(first.id, first.name);
  }, [cars, onOpenCar]);

  /*
    Nothing while the set is in flight: this screen exists for a fraction of
    a second on a returning owner, and a spinner in that window is a loading
    state nobody asked for on a screen that is about to be replaced.
  */
  if (cars.length > 0) return null;

  return (
    <View style={styles.body}>
      <Text style={styles.title}>No cars yet</Text>
      <Text style={styles.line}>
        Add one and this app is about it — its record, what it needs next, and what to ask.
      </Text>
      <Button label="Add a car" onPress={onAddCar} style={styles.act} />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { ...PAGE_BODY, flex: 1, justifyContent: 'center', gap: space.md, backgroundColor: surface.page },
  title: { ...type.displaySection, color: text.primary },
  line: { ...type.body, color: text.secondary },
  act: { marginTop: space.md },
});
