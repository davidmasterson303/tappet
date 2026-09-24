import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import type { TireProvenance } from '@tappet/core/tires';
import { text } from '../theme';

/**
 * How Tappet knows a record — three shapes, no colour, no icon, no letter.
 *
 * `service-provenance.ts` already draws the distinction between a document
 * and a recollection in words; the tire record draws it as a 6 × 6pt mark
 * beside the value, because a row has no room for the sentence and the two
 * kinds of row must not look identical (design-loop/tires, §0.7):
 *
 *   read off a scanned invoice   a FILLED square, ink, with a 2pt 45° cut on
 *                                the bottom-left corner — it is a document,
 *                                so it carries the house cut
 *   typed by the owner           a HAIRLINE square, unfilled, no cut
 *   derived by Tappet            a 6pt hairline and no square — today's
 *                                odometer reading, not a record
 *
 * ── ⚠ The derived mark sits on the baseline, not the cap-height centre ──────
 *
 * Corrected in round 3 of the loop, and worth keeping the reason: at centre
 * height, a 6pt hairline 12pt to the left of a numeral has the position, the
 * length and the weight of a **minus sign** — and the row that carries it
 * most often is a subtraction. `20,820 MI` read as *negative* 20,820. On the
 * baseline the same 6pt reads as an underscore rule and cannot be an
 * operator. The caller anchors every mark's 6pt slot on the cap-height centre;
 * for mono 13/18 the baseline is 7pt below that slot's top edge, so the drop
 * is expressed once here (`DERIVED_DROP`) and every derived mark inherits it.
 *
 * ── Spoken, not only drawn ──────────────────────────────────────────────────
 *
 * Nothing on the screen says what the three shapes mean — whether they earn a
 * legend is David's open question (parking lot 5). Until then the row that
 * carries a mark says its provenance in its accessibility label, so a
 * screen-reader user hears the claim the shape makes; `PROVENANCE_SPOKEN` is
 * that sentence, and the mark itself is hidden from the reader as decoration.
 */
export const MARK = 6;
/** How far a derived mark drops below the slot's top, for mono 13/18. */
export const DERIVED_DROP = 7;
/** The gap between a mark and the value it stands beside. */
export const MARK_GAP = 12;

export type MarkProvenance = TireProvenance | 'derived';

export const PROVENANCE_SPOKEN: Record<MarkProvenance, string> = {
  invoice: 'read off a scanned invoice',
  typed: 'typed by you',
  derived: 'from the odometer',
};

export default function ProvenanceMark({
  provenance,
  style,
  testID,
}: {
  provenance: MarkProvenance;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      style={[styles.slot, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID ?? `provenance-${provenance}`}
    >
      {provenance === 'derived' ? (
        <View style={styles.derived} />
      ) : (
        <Svg width={MARK} height={MARK} viewBox={`0 0 ${MARK} ${MARK}`}>
          {provenance === 'invoice' ? (
            /* Filled, with the 2pt cut taken off the bottom-left corner. */
            <Path d={`M0 0 H${MARK} V${MARK} H2 L0 ${MARK - 2} Z`} fill={text.primary} />
          ) : (
            /* A hairline square, drawn inside the slot so the stroke is not clipped. */
            <Rect x={0.5} y={0.5} width={MARK - 1} height={MARK - 1} fill="none" stroke={text.nonText} strokeWidth={1} />
          )}
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { width: MARK, height: MARK },
  /*
    `text.nonText` — the theme's hairline token, "dividers, rules, tick marks",
    never a word. The two squares' hairline and this line are drawn instrument
    lines, the same value the axis itself is drawn in.
  */
  /* 1pt, like the axis and the typed square's stroke: a drawn instrument line, one step above a structural hairline. */
  derived: { width: MARK, height: 1, marginTop: DERIVED_DROP, backgroundColor: text.nonText },
});
