import { Pressable, StyleSheet, Text, View } from 'react-native';

import Button from '../../components/Button';
import Icon from '../../components/Icon';
import ProvenanceRow from '../../components/ProvenanceRow';
import SectionHeader from '../../components/SectionHeader';
import { SPEC_ROW, TABULAR, border, space, status, surface, text, type } from '../../theme';
import { monoFace } from '../../theme/fonts';
import IndexRail from './IndexRail';
import type { HubModel } from './hub-model';

/**
 * Concept B · WORK ORDER — the hub leads with what the car needs, and the
 * navigation is demoted to an index.
 *
 * ── The idea ────────────────────────────────────────────────────────────────
 *
 * A race engineer's sheet, not a settings page. The two tools come first, as a
 * rail under the plate — SCAN INVOICE is how a need gets closed and filed,
 * ASK THE ADVISOR is who you ask about one. Then the punch list: every open
 * item on this car as a numbered row of the spec table (B6), most urgent
 * first, each row the door to the place where it is dealt with — the service
 * that is due, the recalls, and the reading itself, which is on the list
 * because a reading that predates the records is a thing the car needs
 * refreshed. The rest of the places — history, plan, what you told us — are
 * where an index belongs on a work order: at the foot, in the chrome's voice.
 *
 * What it breaks, knowingly: hero-then-ledger (the tools sit above the
 * ledger), the one-filled-primary-at-the-bottom (the primary is at the top,
 * and it is the scan), the row-list-of-links (three of the six destinations
 * are an index line). What it keeps: the 01 index, the hairline row, the mono
 * value at the right, sodium as a line beside a genuine warning.
 *
 * ⚠ The service row prints the sweep's headline service and core's own words
 * for when — the same `describeNextService` the garage prints — never a
 * position this screen worked out for itself.
 */
export default function HubWorkOrder({ model }: { model: HubModel }) {
  const { score, band, verdictText, provenance, nextService, serviceDue, on } = model;
  const overdue = nextService.kind === 'known' && /^(overdue|due now)/.test(nextService.timing);

  const rows: Array<{
    key: string;
    label: string;
    detail?: string | null;
    value?: string | null;
    warning?: boolean;
    onPress: () => void;
    accessibilityLabel: string;
  }> = [
    {
      key: 'service',
      /* The service by name where the sweep has one; the row's permanent label where it has not. */
      label: nextService.kind === 'known' ? nextService.service : 'Next service',
      value: serviceDue,
      warning: overdue,
      onPress: on.milestone,
      accessibilityLabel: `Next service, ${
        nextService.kind === 'known' ? `${nextService.service}, ${nextService.timing}` : serviceDue
      }. Opens what is due.`,
    },
  ];

  if (model.openRecallCount > 0) {
    const noun = model.openRecallCount === 1 ? 'recall' : 'recalls';
    rows.push({
      key: 'recalls',
      label: `Open ${noun}`,
      detail: model.worstRecall,
      value: String(model.openRecallCount),
      warning: true,
      onPress: on.recalls,
      accessibilityLabel: `View ${model.openRecallCount} open ${noun}${model.worstRecall ? `. ${model.worstRecall}` : ''}`,
    });
  }

  if (score !== null && band) {
    rows.push({
      key: 'health',
      label: 'Health',
      detail: verdictText,
      value: `${score} ${band.label}`,
      onPress: on.health,
      accessibilityLabel: `Health score ${score} out of 100 — ${band.label}. Opens what is driving it.`,
    });
  }

  return (
    <View>
      <View style={styles.tools}>
        <Button label="Scan invoice" size="small" onPress={on.scan} style={styles.tool} />
        <Button label="Ask the advisor" variant="outline" size="small" onPress={on.advisor} style={styles.tool} />
      </View>

      <View style={styles.list}>
        <SectionHeader title="What this car needs" />
        {rows.map((row, index) => (
          <Pressable
            key={row.key}
            onPress={row.onPress}
            accessibilityRole="button"
            accessibilityLabel={row.accessibilityLabel}
            style={({ pressed }) => [styles.row, index === rows.length - 1 && styles.last, pressed && styles.pressed]}
          >
            <Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text>
            <View style={styles.labelBlock}>
              <Text style={styles.label} numberOfLines={2}>
                {row.label}
              </Text>
              {row.detail ? <Text style={styles.detail}>{row.detail}</Text> : null}
              {row.key === 'health' ? <ProvenanceRow kinds={provenance} /> : null}
            </View>
            <View style={styles.valueBlock}>
              {row.warning ? (
                <Text style={styles.mark} accessibilityElementsHidden>
                  △
                </Text>
              ) : null}
              {row.value ? (
                <Text style={[styles.value, row.key === 'health' && WARNING_INK(band)]}>{row.value}</Text>
              ) : null}
            </View>
            <View style={styles.chevron}>
              <Icon name="chevron-right" size={18} color={text.secondary} />
            </View>
          </Pressable>
        ))}
      </View>

      <View style={styles.foot}>
        <IndexRail
          rows={[
            [
              { label: 'History', value: model.historyCount, onPress: on.history },
              { label: 'Plan', value: model.wishlistCount, onPress: on.wishlist },
            ],
            [{ label: 'How you use it', value: model.usage, onPress: on.profile }],
          ]}
        />
      </View>
    </View>
  );
}

/** The ink a reading takes: off-white unless the ramp calls it a warning. */
const WARNING_INK = (band: { name: string } | null) => ({
  color: band && (band.name === 'warn' || band.name === 'bad') ? status.attention : text.primary,
});

const styles = StyleSheet.create({
  tools: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.lg },
  tool: { flex: 1 },
  list: { paddingHorizontal: space.lg },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
    minHeight: SPEC_ROW,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border.panel },
  pressed: { backgroundColor: surface.well },
  /* B6: the index column, fixed so the labels beside it align. */
  index: { ...type.monoLabel, color: text.muted, minWidth: 22, lineHeight: 20 },
  labelBlock: { flex: 1, gap: 2 },
  /* A need's name is a factor's — the section head in miniature, so a service's full name fits. */
  label: { ...type.displaySection, fontSize: 15, lineHeight: 20, color: text.primary },
  detail: { ...type.body, fontSize: 14, lineHeight: 20, color: text.muted },
  valueBlock: { flexDirection: 'row', alignItems: 'center', gap: space.xs, height: 20, maxWidth: 160 },
  mark: { ...type.monoLabel, color: status.attention },
  value: {
    fontFamily: monoFace('500'), fontWeight: '500',
    fontSize: 13,
    lineHeight: 20,
    color: text.primary,
    textAlign: 'right',
    textTransform: 'uppercase',
    flexShrink: 1,
    ...TABULAR,
  },
  chevron: { height: 20, justifyContent: 'center' },
  foot: { paddingHorizontal: space.lg, paddingTop: space.xl },
});
