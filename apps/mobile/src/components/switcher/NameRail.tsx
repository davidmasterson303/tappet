import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Text from '../Text';

import Icon from '../Icon';
import type { CarRow } from './car-set';
import { TABULAR, TARGET_MIN, border, brand, space, status, text, type } from '../../theme';

/**
 * Concept A · **NAME RAIL** — the set is a rule under the plate.
 *
 * ── The idea ────────────────────────────────────────────────────────────────
 *
 * The garage already had the right object and put it in the wrong place. The
 * `BayRail` — mono caps, a 2pt cyan rule under the one you are on, each a tap
 * — is the tab rail's own construction laid across the owner's cars, and it
 * sat *above a pager of full car pages*. Move it to the car and it stops
 * being a menu into a second copy of this screen: it becomes what it looks
 * like, the index of a set you are standing inside.
 *
 * So: a hairline band at the head of the sheet, directly under the plate,
 * carrying every car's short name in the mono label — `'03 ACCORD ·
 * '15 FORESTER · '17 F-PACE` — the current one in ink under a cyan rule, the
 * rest muted. A sodium `△` rides beside any car with something outstanding,
 * which is the only thing on a rail that could not be read from the car you
 * are looking at. `+` at the end adds one.
 *
 * **Why the name and not `CAR 01`.** A bay was a place and could be numbered;
 * a car is a car. An owner picking between three of them picks by which car
 * it is, and an index would make them count to find out.
 *
 * ── What it costs, said plainly ─────────────────────────────────────────────
 *
 * It is the only concept of the three that spends horizontal room
 * proportional to the number of cars: three short names fit a 402pt gutter,
 * five do not, and the rail scrolls rather than truncating. A rail you have
 * to scroll is a rail that can hide a car — which is exactly the failure a
 * set view exists to prevent, and the reason the other two concepts exist.
 *
 * ⚠ **One car draws nothing.** Not a rail of one — `BayRail`'s own R20 rule:
 * a pager for a list that cannot be paged is chrome. Most owners have one
 * car, and they should never learn that this control exists.
 */
export default function NameRail({
  cars,
  currentId,
  onSwitch,
  onAddCar,
}: {
  cars: CarRow[];
  currentId: string;
  onSwitch: (id: string) => void;
  onAddCar: () => void;
}) {
  if (cars.length < 2) return null;

  return (
    <View style={styles.rail}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.cars}
        accessibilityRole="tablist"
        accessibilityLabel="Your cars"
      >
        {cars.map((car) => {
          const on = car.id === currentId;
          return (
            <Pressable
              key={car.id}
              onPress={on ? undefined : () => onSwitch(car.id)}
              disabled={on}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={
                on
                  ? `${car.name}, the car you are looking at`
                  : `${car.name}${car.needs ? `, ${car.needs}` : ''}. Switch to it.`
              }
              style={({ pressed }) => [styles.car, on && styles.carOn, pressed && !on && styles.carPressed]}
            >
              {car.warning ? (
                <Text style={styles.mark} accessibilityElementsHidden>
                  △
                </Text>
              ) : null}
              <Text style={[styles.name, on && styles.nameOn]} numberOfLines={1}>
                {shortName(car.name)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Pressable
        onPress={onAddCar}
        accessibilityRole="button"
        accessibilityLabel="Add a car"
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        style={({ pressed }) => [styles.add, pressed && styles.carPressed]}
      >
        <Icon name="plus" size={14} color={text.muted} />
      </Pressable>
    </View>
  );
}

/**
 * "2003 Honda Accord" → "'03 ACCORD".
 *
 * ⚠ The model, never the make. Two Hondas in a garage are told apart by
 * Accord and Civic; "'03 HONDA" and "'15 HONDA" would be two of the same
 * word. The year disambiguates the remaining case, and is short enough to
 * carry in an apostrophe.
 */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length < 2) return name.toUpperCase();

  const year = /^\d{4}$/.test(parts[0]) ? `'${parts[0].slice(2)}` : null;
  const model = parts.slice(year ? 2 : 1).join(' ') || parts[parts.length - 1];
  return [year, model].filter(Boolean).join(' ').toUpperCase();
}

const styles = StyleSheet.create({
  /* A band on the page's gutter, closed by the hairline the panel below opens with. */
  rail: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: border.panel,
  },
  cars: { flexDirection: 'row', gap: space.lg, alignItems: 'stretch' },
  car: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: TARGET_MIN,
    paddingHorizontal: space.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  carPressed: { borderBottomColor: border.field },
  carOn: { borderBottomColor: brand.accent },
  /* B1: mono caps for an index; B7: it lights to ink, never to the accent. */
  name: { ...type.monoLabel, color: text.muted, ...TABULAR },
  nameOn: { color: text.primary },
  mark: { ...type.monoLabel, color: status.attention },
  add: {
    justifyContent: 'center',
    paddingLeft: space.md,
    minHeight: TARGET_MIN,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
});
