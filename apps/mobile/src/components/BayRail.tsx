import { Pressable, StyleSheet, View } from 'react-native';
import Text from './Text';

import Icon from './Icon';
import { TABULAR, TARGET_MIN, border, brand, space, text, type } from '../theme';

/**
 * The garage's rail — which bay is on screen, of how many, and the door in.
 *
 * ── 21 Sep · "1 of 3" was a count, not a control ─────────────────────────────
 *
 * David, from the phone: *"the '1 of 3' needs to be bigger, more obvious, to
 * make it clear that we're in a garage w/ carousel functionality. it's not
 * super clear what's supposed to happen in garage right now (i.e. not clear
 * to tap, swipe)."* The batten said BAY 01 on the left and "1 of 3" in a
 * light sans on the right, and nothing on the screen said the bays slide or
 * that the car opens.
 *
 * The rail is the tab rail's construction — `Segmented`'s mono caps and 2px
 * cyan underline under the one you are on, no fill — laid across the bays:
 * BAY 01 · BAY 02 · BAY 03, the lit one where you stand, each a tap to that
 * bay. Count, position and "there is somewhere to go" become one object, and
 * it is the same object the Service and Plan roots switch their views with,
 * so it already reads as pageable to anyone who has used them. At the rail's
 * end, the door: CAR ›, the hub's legend-and-chevron for "this opens", naming
 * the tab a bay opens into.
 *
 * **R20 holds.** One car draws BAY 01 alone — no underline, because a rail of
 * one is a pager for a list that cannot be paged. The door stays: it is the
 * answer to "what do I tap", and a one-car owner asks it too.
 *
 * ⚠ The rail sits **above the pager, not on each page**, so it holds still
 * while the bays slide under it — the way an indicator should. The old batten
 * travelled with its bay, which is why "1 of 3" could never be seen changing.
 */
export default function BayRail({
  total,
  index,
  onJump,
  carTitle,
  onOpenCar,
}: {
  total: number;
  /** Zero-based; the bay on screen. */
  index: number;
  /** A tap on another bay's number. */
  onJump: (index: number) => void;
  /** The car on screen, for the door's spoken name. */
  carTitle: string;
  onOpenCar: () => void;
}) {
  const paged = total > 1;

  return (
    <View style={styles.rail}>
      <View
        style={styles.bays}
        accessibilityRole={paged ? 'tablist' : undefined}
        accessibilityLabel={paged ? `Bays, ${index + 1} of ${total}` : undefined}
      >
        {Array.from({ length: total }, (_, bay) => {
          const on = bay === index;
          return (
            <Pressable
              key={bay}
              onPress={paged ? () => onJump(bay) : undefined}
              disabled={!paged}
              accessibilityRole={paged ? 'tab' : undefined}
              accessibilityState={paged ? { selected: on } : undefined}
              accessibilityLabel={`Bay ${bay + 1}`}
              /*
                The rule the lit bay carries. Transparent at rest rather than
                absent, so a number does not shift by two points when it lights
                — `Segmented`'s own construction.
              */
              style={({ pressed }) => [
                styles.bay,
                paged && on && styles.bayOn,
                paged && pressed && !on && styles.bayPressed,
              ]}
            >
              <Text style={[styles.number, paged && on && styles.numberOn]}>
                BAY {String(bay + 1).padStart(2, '0')}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/*
        The door. Named as the destination, not the drawing (the account
        control's rule): the tab this bay opens into is CAR, and the lit tab
        is what the owner sees next.
      */}
      <Pressable
        onPress={onOpenCar}
        accessibilityRole="button"
        accessibilityLabel={`Open ${carTitle}`}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}
        style={({ pressed }) => [styles.door, pressed && styles.doorPressed]}
      >
        <Text style={styles.doorWord}>Car</Text>
        <Icon name="chevron-right" size={14} color={text.muted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  /* A rail sits on the page, on the gutter, and closes with the tab rail's hairline. */
  rail: {
    flexDirection: 'row',
    alignItems: 'stretch',
    justifyContent: 'space-between',
    marginHorizontal: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: border.panel,
  },
  bays: { flexDirection: 'row', gap: space.lg },
  bay: {
    minHeight: TARGET_MIN - 8,
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  bayPressed: { borderBottomColor: border.field },
  bayOn: { borderBottomColor: brand.accent },
  /* B1: a bay's number is a mono index label; B7: it lights to ink, never to the accent. */
  number: { ...type.monoLabel, color: text.muted, ...TABULAR },
  numberOn: { color: text.primary },
  door: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingLeft: space.sm,
    minHeight: TARGET_MIN - 8,
    marginBottom: -1,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  doorPressed: { borderBottomColor: border.field },
  doorWord: { ...type.monoLabel, color: text.muted, textTransform: 'uppercase' },
});
