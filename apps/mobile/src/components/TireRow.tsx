import { StyleSheet, Text, View } from 'react-native';

import ProvenanceMark, { MARK, MARK_GAP, PROVENANCE_SPOKEN, type MarkProvenance } from './ProvenanceMark';
import { SPEC_ROW, TABULAR, border, space, text, type } from '../theme';

/**
 * One row of the tire feature's spec table — a record, or a consequence.
 *
 * The feature's one row idiom, shared by both of its screens (design-loop/
 * tires, "BANDS"): a 56pt hairline-ruled band with an optional mono index at
 * the left, one or two lines of label, and one right-aligned mono value with
 * its provenance mark 12pt to the left of it. B6's spec table, drawn once so
 * the rotations and the staggered consequences cannot state the idiom
 * differently.
 *
 * ── Not `BandRow` ───────────────────────────────────────────────────────────
 *
 * `BandRow` is a *destination* — a condensed-caps label, a chevron, a place
 * to go. These rows go nowhere: a rotation is a record and `FRONT TO REAR ·
 * NOT POSSIBLE` is a fact, and a chevron on either would promise a screen
 * that does not exist. So the label is mono (a date is a value) or a mono
 * label (a fact's name), never the grotesk, and there is no chevron. The
 * index, the rules and the 56pt are `BandRow`'s, so the two tables on one
 * phone still read as one system.
 *
 * ── Registration, stated once ───────────────────────────────────────────────
 *
 * The index and the value are both mono 13 and are the row's numerals, so they
 * share one line. A `monoLabel` label sits on that line too; its 16pt box is
 * shorter than mono's 18, and `alignItems: 'center'` on the first line does
 * what the reference's one-point nudge did. The mark's 6pt slot is centred on
 * the value's cap height; a derived mark drops itself to the baseline
 * (`ProvenanceMark`).
 *
 * ── The provenance is spoken ────────────────────────────────────────────────
 *
 * The mark is hidden from the reader as decoration and the row says the same
 * fact in words — "67,012 miles, typed by you" — because nothing on screen
 * says what the three shapes mean, and whether they earn a legend is David's
 * open question. Until it is answered a screen-reader user hears the claim
 * the sighted one infers.
 */
export default function TireRow({
  index,
  label,
  labelStyle = 'label',
  sub,
  value,
  provenance,
  last = false,
  testID,
}: {
  /** `01` — omitted when the row is not one of a numbered list. */
  index?: string;
  label: string;
  /** `'mono'` for a value that names the row (a date); `'label'` for a fact's name. */
  labelStyle?: 'mono' | 'label';
  /** A second, quieter mono-label line under the label. */
  sub?: string;
  value: string;
  /** Draws the mark and says it in the row's name. Records carry one; consequences do not. */
  provenance?: MarkProvenance;
  /** The last row in a table closes it with a hairline beneath. */
  last?: boolean;
  testID?: string;
}) {
  const spoken = [
    index ? `${Number(index)}.` : null,
    label,
    sub,
    value,
    provenance ? PROVENANCE_SPOKEN[provenance] : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={[styles.band, last && styles.last]} accessible accessibilityLabel={spoken} testID={testID}>
      <View style={styles.line}>
        {index ? <Text style={styles.index}>{index}</Text> : null}
        <View style={styles.labels}>
          <Text style={labelStyle === 'mono' ? styles.labelMono : styles.label} numberOfLines={1}>
            {label}
          </Text>
          {sub ? (
            <Text style={styles.sub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        <View style={styles.valueCell}>
          {/* One slot for all three: a derived mark drops itself to the baseline. */}
          {provenance ? <ProvenanceMark provenance={provenance} style={styles.mark} /> : null}
          <Text style={styles.value} numberOfLines={1}>
            {value}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  band: {
    minHeight: SPEC_ROW,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
    justifyContent: 'center',
  },
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border.panel },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  /** The spec table's index — mono, muted, tabular, the same slot `BandRow` gives it. */
  index: { ...type.mono, ...TABULAR, color: text.muted, minWidth: 22 },
  labels: { flex: 1, gap: 2 },
  label: { ...type.monoLabel, color: text.primary, lineHeight: type.mono.lineHeight },
  labelMono: { ...type.mono, ...TABULAR, color: text.primary },
  sub: { ...type.monoLabel, color: text.muted },
  valueCell: { flexDirection: 'row', alignItems: 'flex-start', gap: MARK_GAP },
  /* Centred on the value's cap height: mono 13/18 has ~6pt of leading and cap above the mark. */
  mark: { marginTop: (type.mono.lineHeight - MARK) / 2 },
  value: { ...type.mono, ...TABULAR, color: text.primary, textAlign: 'right' },
});
