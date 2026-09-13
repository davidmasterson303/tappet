import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from './Icon';
import { border, space, status, surface, text, type } from '../theme';

/**
 * The binnacle — a panel of readings, each of which opens its own screen.
 *
 * ── 13 Sep · what replaced the hub's list of rows ───────────────────────────
 *
 * The car's hub under the plate was a spec table of destinations — SERVICE ·
 * HISTORY · PLAN · SCAN INVOICE, a chevron each — with the score in a band
 * above it and one filled primary beneath. David: *"i feel surprised this
 * page, with these cta's/nav elements, received an acceptable score from the
 * design critic."* Three concepts were built as real screens and put to the
 * critic blind, with the shipped page as the fourth; it ranked this one first
 * and the shipped page last: *"the only candidate that treats the space under
 * the plate as the same instrument as the plate: mono-caps labels, big mono
 * values, hairline cells, the stat strip simply continuing downward … C leads
 * with the readings."* `design-loop/mobile-ios/concepts/hub/pick.md` carries
 * the whole answer; `docs/design-system-drift.md` §6.18 the loop that
 * followed.
 *
 * So the readings sit in one hairline-celled panel the way a cluster sits
 * under a windscreen, and **every cell is a reading and every reading is the
 * door to its own screen** — HEALTH opens the account of the score, NEXT
 * SERVICE what is due, RECALLS the campaigns, HISTORY the records, PLAN the
 * needs. There is no list of places, no chevron column, and no verb outranks
 * the instruments; the acts are switches at the panel's foot.
 *
 * ── The legend is under the value, not over it ──────────────────────────────
 *
 * The stat strip on the plate sets its eyebrow *over* its value and is not
 * pressable. A cell here is, so it inverts the pair — value, then legend with
 * a hairline chevron after it — so the two objects never read as one. The
 * chevron is small and after the word rather than at the row's edge because
 * the cell is the target, not a row with a value column.
 *
 * ── Sodium is a line beside a genuine warning, and nothing else ─────────────
 *
 * `warning` draws the outlined `△` before the legend, as `BandRow` and the
 * health drivers do; the value stays ink. B7 gives sodium one job, and a cell
 * that coloured its whole reading would spend it on the count as well as on
 * the fact.
 *
 * ── A missing value is nothing ──────────────────────────────────────────────
 *
 * A caller renders no value where it could not read one, never a `0`: the
 * hub's `HubCounts` carries the rule. A `0` it *did* read — an empty plan — is
 * set in the legend's ink rather than the value's, so an empty list does not
 * read as a warning-sized zero (the critic's own note on the pick).
 */
export default function Binnacle({ children, accessibilityLabel }: { children: ReactNode; accessibilityLabel: string }) {
  return (
    <View style={styles.panel} accessibilityRole="summary" accessibilityLabel={accessibilityLabel}>
      {children}
    </View>
  );
}

/** One row of cells. Every row after the first rules its own top edge. */
export function BinnacleRow({ children, first = false }: { children: ReactNode; first?: boolean }) {
  return <View style={[styles.row, !first && styles.rowRule]}>{children}</View>;
}

/**
 * One gauge of the panel: a value (the children), then its legend, the whole
 * cell pressable. `rule` draws the hairline between this cell and the one
 * before it — a left rule on every cell after the first, never a right rule
 * on every cell but the last, for `StatStrip`'s reason: a dropped cell must
 * not leave a rule hanging at the edge.
 */
export function BinnacleCell({
  legend,
  children,
  flex = 1,
  rule = false,
  warning = false,
  onPress,
  accessibilityLabel,
}: {
  /** The destination's name, rendered in the mono eyebrow voice. */
  legend: string;
  children: ReactNode;
  flex?: number;
  rule?: boolean;
  warning?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.cell, { flex }, rule && styles.celled, pressed && styles.pressed]}
    >
      <View style={styles.value}>{children}</View>
      <View style={styles.legend}>
        {warning ? (
          <Text style={styles.mark} accessibilityElementsHidden>
            △
          </Text>
        ) : null}
        <Text style={styles.legendWord} numberOfLines={1}>
          {legend}
        </Text>
        <Icon name="chevron-right" size={14} color={text.muted} />
      </View>
    </Pressable>
  );
}

/** A gauge's floor — room for a value, its legend, and a thumb. */
export const BINNACLE_CELL_MIN = 96;

const styles = StyleSheet.create({
  /* No top rule: the sheet's own leading edge is the rule above the first row. */
  panel: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border.panel },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border.panel },
  cell: {
    minHeight: BINNACLE_CELL_MIN,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    justifyContent: 'flex-end',
    gap: space.xs,
  },
  celled: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: border.panel },
  /* A fill swap under the finger, never a fade. */
  pressed: { backgroundColor: surface.well },
  value: { gap: space.xs },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendWord: { ...type.monoLabel, color: text.muted, flexShrink: 1 },
  mark: { ...type.monoLabel, color: status.attention },
});
