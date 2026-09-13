import { Pressable, StyleSheet, Text, View } from 'react-native';

import { TABULAR, TARGET_MIN, border, space, surface, text, type } from '../../theme';

/**
 * The places this screen leads to, demoted to an index.
 *
 * Rows of mono caps words, hairline-separated, each carrying its count in the
 * numeral voice — the web tab rail's grammar with no active underline, because
 * none of these is *this* screen. The caller decides the rows rather than the
 * rail wrapping itself: a wrapped rail would start a line with a stray rule,
 * and a word that truncated — "HOW YOU…" — would be a destination whose name
 * is hidden, which is the one thing a destination's name must not be.
 *
 * Shared by the two concepts that demote navigation (B and C); it is what
 * *replaces* the list of chevron rows in both.
 */
export type IndexEntry = {
  label: string;
  /** The mono value beside the word — a count, a total, an answer. Nothing when unknown. */
  value?: string | null;
  onPress: () => void;
};

export default function IndexRail({ rows }: { rows: IndexEntry[][] }) {
  return (
    <View style={styles.rail} accessibilityRole="menubar">
      {rows.map((entries, r) => (
        <View key={r} style={[styles.row, r > 0 && styles.rowRule]}>
          {entries.map((entry, i) => (
            <Pressable
              key={entry.label}
              onPress={entry.onPress}
              accessibilityRole="button"
              accessibilityLabel={[entry.label, entry.value].filter(Boolean).join(', ')}
              style={({ pressed }) => [styles.word, i > 0 && styles.ruled, pressed && styles.pressed]}
            >
              <Text style={styles.label} numberOfLines={1}>
                {entry.label}
              </Text>
              {entry.value ? (
                <Text style={styles.value} numberOfLines={1}>
                  {entry.value}
                </Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.xs },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border.panel },
  word: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TARGET_MIN,
    paddingHorizontal: space.md,
  },
  ruled: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: border.panel },
  /* A fill swap under the finger, as `Button`'s ghost presses. */
  pressed: { backgroundColor: surface.raised },
  /* The roots' chrome ink — ADD CAR, ACCOUNT — one step down from the values. */
  label: { ...type.monoNav, color: text.secondary },
  /* The value in the chrome's own case, so a rail of caps stays a rail of caps. */
  value: { ...type.monoNav, color: text.primary, ...TABULAR },
});
