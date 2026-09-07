import { StyleSheet, Text, View, Pressable } from 'react-native';

import { TARGET_MIN, border, brand, radius, space, surface, text, type } from '../theme';

/**
 * Two or three views of one subject, switched in place.
 *
 * ── What it is for, and what it is not ──────────────────────────────────────
 *
 * It exists because of **R14 and R15**: `Service due` and `Service history`
 * were two hub rows answering one question ("what has this car had done, and
 * what does it need"), and `Wishlist` and `Build` were two more answering
 * another ("what should I do to it next"). Splitting each across two
 * destinations made the owner decide which list a job belonged on *before* they
 * could look for it — and "Charge Pipe" is genuinely both.
 *
 * A segmented control is the right shape for exactly that: one subject, two
 * views, and switching between them costs nothing and loses no place.
 *
 * ⚠ **Not for navigation between unrelated screens.** If the two sides do not
 * share a subject, they are two destinations and this is a worse tab bar. The
 * test is whether a person could reasonably expect to find an item on either
 * side — if not, they are not segments.
 *
 * ── The selected segment is the brand fill ──────────────────────────────────
 *
 * Not white. `Button`'s docblock carries the argument: there is one filled
 * treatment in this app and it is `brand.primary`. A selected segment is a
 * filled control like any other.
 */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  accessibilityLabel,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (next: T) => void;
  /** Names the *group*, since each segment names only itself. */
  accessibilityLabel: string;
}) {
  return (
    <View
      style={styles.track}
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
    >
      {options.map((option) => {
        const selected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            /*
              ⚠ `selected`, not `checked`. VoiceOver announces a tab's selected
              state; a segment that only *looks* chosen is a control whose state
              is carried entirely by a fill colour, which is the failure the
              chip family's "never colour alone" rule exists to prevent.
            */
            accessibilityState={{ selected }}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentOn,
              pressed && !selected && styles.segmentPressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.labelOn]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    ── ⚠ 6 Sep · B4 and B7: the segmented control became the tab rail ─────────

    This was a filled capsule track — `surface.well` behind a `radius.pill`
    outline, each segment also a pill, and the selected one taking a solid
    `brand.primary` fill. Three separate things the locked brief forbids in one
    control:

      B4  "no capsules or pills"
      B7  "no hue fills except the destructive confirm"
      the studio paragraph, verbatim: *"Segmented pills become the web tab rail:
      mono caps, 2px cyan underline, no fill."*

    It was also the loudest thing on two screens: a teal block, at a size the
    brief reserves for a primary action, marking which of two lists you are
    reading. Selection is not an action and should not outrank one.

    ⚠ **The underline is the state, and it is 2px because it has to survive
    being the *only* state.** The label also brightens to `text.primary`, which
    is what keeps this legible under forced colours and for anyone who cannot
    separate the cyan from the graphite — the chip family's "never colour alone"
    rule, applied to a rail instead of a chip.
  */
  track: {
    flexDirection: 'row',
    /* A rail sits on the page. There is no track surface any more. */
    borderBottomWidth: 1,
    borderBottomColor: border.panel,
    gap: space.lg,
  },
  segment: {
    minHeight: TARGET_MIN - 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xs,
    /*
      The rule the selected segment lights. Transparent at rest rather than
      absent, so the label does not shift by two points when it is chosen.
    */
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
  },
  /*
    ⚠ No fill on press either. The pressed state is the label going to full ink;
    a fill here would be the capsule coming back under another name.
  */
  segmentPressed: { borderBottomColor: border.field },
  segmentOn: { borderBottomColor: brand.accent },
  /* B1: a tab label is a label, and labels are mono caps. */
  label: { ...type.monoLabel, color: text.muted },
  labelOn: { color: text.primary },
});