import { StyleSheet, Text, View } from 'react-native';

import { TABULAR, border, space, text, type } from '../theme';

/**
 * The mono stat strip that sits beneath the plate.
 *
 * ── ⚠ Why this is a component and not a joined string ───────────────────────
 *
 * Both callers used to build one: `[mileage, trim, status].join(' · ')`, handed
 * down as a `subtitle`. That produced "66,000 mi · xDrive · Daily Driver" —
 * three *values* set as a sentence, in the body sans, with a middot doing the
 * work of a rule.
 *
 * The brief asks for the web dossier's strip: **a mono eyebrow over its value,
 * in hairline-separated cells.** A joined string cannot express that, because
 * by the time it reaches the view the labels are gone and the separators are
 * punctuation. Hence cells in, strip out.
 *
 * ⚠ **The two screens disagreed on order** — Garage read trim/status/mileage and
 * Vehicle read mileage/trim/status, from two independent `join` calls that
 * nobody had reason to compare. The critique caught it as "ordered differently
 * on Garage and Vehicle". One component is how that stops recurring: the order
 * is the array's, and the array is built in one place per screen against the
 * same contract.
 *
 * ── The empty cell is dropped, not blanked ──────────────────────────────────
 *
 * A cell with no value is removed by the caller rather than rendered with a
 * dash. `advice-range.ts` carries the product's position: a missing value is
 * "we cannot say", and an em-dash under MILEAGE reads as a reading of nothing
 * rather than as an absence.
 */
export type Stat = {
  /** The mono eyebrow — a noun, not a sentence. Rendered in caps. */
  label: string;
  /** The value beneath it. Already formatted; this component does not format. */
  value: string;
};

export default function StatStrip({ stats }: { stats: Stat[] }) {
  if (stats.length === 0) return null;

  return (
    <View style={styles.strip}>
      {stats.map((stat, i) => (
        <View key={stat.label} style={[styles.cell, i > 0 && styles.celled]}>
          <Text style={styles.label} numberOfLines={1}>
            {stat.label}
          </Text>
          <Text style={styles.value} numberOfLines={1}>
            {stat.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    /*
      A rule above and below, so the strip reads as one band rather than as
      three labels floating under a photograph. B5's hairline band, applied to
      the header rather than to a card.
    */
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: border.panel,
    paddingVertical: space.sm,
  },
  cell: { flex: 1, paddingHorizontal: space.md, gap: 2 },
  /*
    ⚠ The separator is a left border on every cell *after* the first, not a
    right border on every cell but the last. Both draw the same two rules today;
    the difference shows when a cell is dropped for having no value — a trailing
    right border would leave a rule hanging at the strip's edge.
  */
  celled: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: border.panel },
  label: { ...type.label, color: text.muted, textTransform: 'uppercase' },
  value: { ...type.mono, color: text.primary, ...TABULAR },
});
