import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import Button from '../../components/Button';
import Icon from '../../components/Icon';
import ProvenanceRow from '../../components/ProvenanceRow';
import { SPEC_ROW, TABULAR, border, space, status, surface, text, type } from '../../theme';
import { monoFace } from '../../theme/fonts';
import type { HubModel } from './hub-model';

/**
 * Concept A · CLUSTER — the hub as an instrument binnacle, not a list.
 *
 * ── The idea ────────────────────────────────────────────────────────────────
 *
 * Under the plate, the car's readings sit in one hairline-celled panel the
 * way a cluster sits under a windscreen: HEALTH large at the left, NEXT
 * SERVICE beside it, then OPEN RECALLS · HISTORY · PLAN, then HOW YOU USE IT
 * across the foot. **Every cell is a reading and every reading is the door
 * to its own screen** — there is no list of places, no chevron column, no
 * verb at the bottom that outranks the instruments. The verdict sentence is
 * the check-control message under the binnacle, and the two acts — scan, ask
 * — are a pair of equal switches, not one filled primary over a ghosted
 * second.
 *
 * What it breaks, knowingly: the row-list-of-links, the one-filled-primary,
 * and the chrome-word-as-action. What it keeps: the mono eyebrow, the hairline
 * band, the cut, and the rule that a missing value is nothing rather than a
 * zero (`HubModel`).
 *
 * The legend sits **under** the value, not over it as the stat strip's does,
 * so a cell and a strip cell — one pressable, one not — do not read as the
 * same object.
 */
export default function HubCluster({ model }: { model: HubModel }) {
  const { score, band, verdictText, provenance, nextService, serviceDue, on } = model;
  const overdue = nextService.kind === 'known' && /^(overdue|due now)/.test(nextService.timing);

  return (
    <View>
      <View style={styles.binnacle} accessibilityRole="summary" accessibilityLabel="Readings">
        <View style={styles.row}>
          <Cell
            eyebrow="Health"
            flex={3}
            onPress={on.health}
            accessibilityLabel={
              score !== null && band
                ? `Health score ${score} out of 100 — ${band.label}. Opens what is driving it.`
                : 'Health, no score yet. Opens what is driving it.'
            }
          >
            {score !== null && band ? (
              <View style={styles.reading}>
                <Text style={[styles.numeral, WARNING_INK(band)]}>{score}</Text>
                <Text style={[styles.bandWord, WARNING_INK(band)]}>{band.label}</Text>
              </View>
            ) : (
              <Text style={styles.absent}>No score yet</Text>
            )}
          </Cell>
          <Cell
            eyebrow="Next service"
            flex={2}
            rule
            warning={overdue}
            onPress={on.milestone}
            accessibilityLabel={`Next service, ${serviceDue}. Opens what is due.`}
          >
            <Text style={[styles.value, styles.timing]} numberOfLines={3}>
              {serviceDue}
            </Text>
          </Cell>
        </View>

        <View style={[styles.row, styles.rowRule]}>
          <Cell
            eyebrow="Recalls"
            warning={model.openRecallCount > 0}
            onPress={on.recalls}
            accessibilityLabel={`${model.openRecallCount} open recalls. Opens the recalls.`}
          >
            <Text style={styles.value}>{model.openRecallCount}</Text>
          </Cell>
          <Cell eyebrow="History" rule onPress={on.history} accessibilityLabel={`History, ${model.historyCount ?? ''}`}>
            {model.historyCount ? <Text style={styles.value}>{model.historyCount}</Text> : null}
          </Cell>
          <Cell eyebrow="Plan" rule onPress={on.wishlist} accessibilityLabel={`Plan, ${model.wishlistCount ?? ''}`}>
            {model.wishlistCount ? <Text style={styles.value}>{model.wishlistCount}</Text> : null}
          </Cell>
        </View>

        <View style={[styles.row, styles.rowRule]}>
          <Cell
            eyebrow="How you use it"
            onPress={on.profile}
            accessibilityLabel={`How you use it, ${model.usage ?? ''}. Opens what you told us.`}
            across
          >
            {model.usage ? <Text style={[styles.value, styles.timing]}>{model.usage}</Text> : null}
          </Cell>
        </View>
      </View>

      {verdictText || provenance.length > 0 ? (
        <View style={styles.message}>
          {verdictText ? <Text style={styles.verdict}>{verdictText}</Text> : null}
          <ProvenanceRow kinds={provenance} />
        </View>
      ) : null}

      <View style={styles.switches}>
        <Button label="Scan invoice" variant="outline" size="small" onPress={on.scan} style={styles.switch} />
        <Button label="Ask the advisor" variant="outline" size="small" onPress={on.advisor} style={styles.switch} />
      </View>
    </View>
  );
}

/** The ink a reading takes: off-white unless the ramp calls it a warning. */
const WARNING_INK = (band: { name: string }) => ({
  color: band.name === 'warn' || band.name === 'bad' ? status.attention : text.primary,
});

/**
 * One gauge of the binnacle. The value on top, the legend beneath with a hairline
 * chevron after it saying the gauge opens; the sodium `△` beside the
 * legend only on a genuine warning (B7).
 */
function Cell({
  eyebrow,
  children,
  flex = 1,
  rule = false,
  warning = false,
  across = false,
  onPress,
  accessibilityLabel,
}: {
  eyebrow: string;
  children: ReactNode;
  flex?: number;
  /** Every cell after the first in a row draws the rule between it and its neighbour. */
  rule?: boolean;
  warning?: boolean;
  /** A full-width cell lays its value beside the legend rather than over it. */
  across?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [
        styles.cell,
        { flex },
        rule && styles.celled,
        across && styles.cellAcross,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.cellBody, across && styles.cellBodyAcross]}>
        {across ? <Legend eyebrow={eyebrow} warning={warning} chevron={false} /> : null}
        <View style={across ? styles.valueAcross : undefined}>{children}</View>
        {!across ? <Legend eyebrow={eyebrow} warning={warning} /> : null}
        {across ? <Icon name="chevron-right" size={16} color={text.muted} /> : null}
      </View>
    </Pressable>
  );
}

function Legend({ eyebrow, warning, chevron = true }: { eyebrow: string; warning: boolean; chevron?: boolean }) {
  return (
    <View style={styles.legend}>
      {warning ? (
        <Text style={styles.mark} accessibilityElementsHidden>
          △
        </Text>
      ) : null}
      <Text style={styles.eyebrow} numberOfLines={1}>
        {eyebrow}
      </Text>
      {/* The legend says where the gauge opens; a hairline chevron says that it does. */}
      {chevron ? <Icon name="chevron-right" size={14} color={text.muted} /> : null}
    </View>
  );
}

/** A gauge's height — room for a value, its legend, and a thumb. */
const CELL_MIN = 96;

const styles = StyleSheet.create({
  /* No top rule: the sheet's own leading edge is the rule above the first row. */
  binnacle: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border.panel },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: border.panel },
  cell: {
    minHeight: CELL_MIN,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    justifyContent: 'flex-end',
  },
  cellAcross: { minHeight: SPEC_ROW, justifyContent: 'center' },
  /*
    A left rule on every cell after the first, never a right rule on every
    cell but the last — `StatStrip` carries why: a dropped cell must not leave
    a rule hanging at the edge.
  */
  celled: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: border.panel },
  cellBody: { gap: space.xs },
  cellBodyAcross: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  valueAcross: { flex: 1, alignItems: 'flex-end' },
  /* A fill swap under the finger, never a fade. */
  pressed: { backgroundColor: surface.well },
  reading: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  numeral: { ...type.numeralPlate, color: text.primary, ...TABULAR },
  bandWord: { ...type.monoNav, color: text.primary },
  absent: { ...type.mono, color: text.muted },
  /* A count or a timing: mono, tabular, one step up from the row value. */
  value: {
    fontFamily: monoFace('500'), fontWeight: '500',
    fontSize: 20,
    lineHeight: 24,
    color: text.primary,
    ...TABULAR,
  },
  timing: { fontSize: 15, lineHeight: 20 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  eyebrow: { ...type.monoLabel, color: text.muted, flexShrink: 1 },
  mark: { ...type.monoLabel, color: status.attention },
  message: { paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.xs },
  verdict: { ...type.body, fontSize: 14, lineHeight: 20, color: text.secondary },
  switches: { flexDirection: 'row', gap: space.sm, padding: space.lg },
  switch: { flex: 1 },
});
