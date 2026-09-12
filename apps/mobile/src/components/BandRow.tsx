import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from './Icon';
import { SPEC_ROW, TABULAR, border, space, status, surface, text, type } from '../theme';

/**
 * A place to go, as a row of the spec table.
 *
 * ── What it replaced, and why (12 Sep) ─────────────────────────────────────
 *
 * `NavRow` was the iOS grouped-table destination: a Lucide glyph, a sans
 * label, a sans count, an inset divider. It was David's own correction on
 * 23 Aug, made against a hub of four bare sans words in a card — *"ugly and
 * uninviting to engage with"* — and the glyphs were its answer: four
 * left-aligned words in a box gave the eye nothing to land on, so the icon
 * was made *required*, on the reasoning that an optional one gets omitted
 * under deadline on exactly the screen that needs it.
 *
 * The locked brief came after that decision, and two graded frames showed
 * what it cost under it. First the score row: "What is driving this score"
 * was the only bold sentence-case sans head in the app, with a sliders glyph,
 * directly above OPEN RECALLS in condensed caps — two voices for two rows of
 * one table, named four rounds running. Then the hub itself, the first time a
 * frame scrolled past the recall: the one iOS-settings block in an app that is
 * otherwise the spec table, its values ("No schedule yet", "5", "Daily
 * Driver") in sans where the garage and the strip set the same strings in
 * mono, and the clock and wrench meaning Plan and Service in the tab bar while
 * meaning Service and History one screen up. B1 gives section heads the
 * condensed grotesk and values the mono; B5 makes a group a band; and the
 * web's own destination rows — VEHICLE DOSSIER, WISHLIST on the dossier — are
 * condensed caps, a chevron, and nothing else.
 *
 * So this is the row `RecallBand` was already drawing, with the recall taken
 * out of it: a hairline above (and one below the last row, so a stack reads as
 * one table rather than a pile of bands — the garage's readings follow the
 * same rule), a condensed caps label, an optional sans line beneath it, an
 * optional mono value at the right, and the chevron that says it goes
 * somewhere. What the 23 Aug correction argued for survives as structure —
 * the label outside the group, 56pt rows the eye can count, each carrying
 * what is behind it. The glyph does not, and that supersession is logged in
 * `docs/design-system-drift.md` §6.13 for David to overrule.
 *
 * ── The only mark is the warning ────────────────────────────────────────────
 *
 * `warning` draws `△` in sodium and nothing else can be drawn there. B7 gives
 * sodium one job — *"a hairline triangle beside a genuine warning"* — and a
 * `mark` prop that took any glyph would be the door through which a row grows
 * an icon again. A row that is not a warning carries no glyph; the label is
 * the row's whole identity, as it is on the web.
 */
export default function BandRow({
  label,
  detail,
  count,
  warning = false,
  onPress,
  accessibilityLabel,
  last = false,
}: {
  label: string;
  /** One quiet sans line under the label, for a destination that needs explaining. */
  detail?: string | null;
  /** The value in the numeral column — mono, right-aligned. Omit when there is none. */
  count?: string | null;
  /** Draw the sodium `△` beside the label. Only for a genuine warning. */
  warning?: boolean;
  onPress: () => void;
  /**
   * One utterance for the reader, when the label alone is not the sentence.
   * `RecallBand` says "View 2 open recalls. Fuel system — …" here.
   */
  accessibilityLabel?: string;
  /** The last row in a table closes it with a hairline beneath. */
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, count, detail].filter(Boolean).join(', ')}
      style={({ pressed }) => [styles.band, last && styles.last, pressed && styles.pressed]}
    >
      {warning ? (
        /*
          ⚠ `△` (U+25B3), the outlined triangle, in sodium — B7's "hairline
          triangle beside a genuine warning". Hidden from the reader because the
          label already says what it marks.
        */
        <Text style={styles.mark} accessibilityElementsHidden>
          △
        </Text>
      ) : null}

      <View style={styles.labelBlock}>
        <Text style={styles.label} numberOfLines={1}>
          {label}
        </Text>
        {detail ? (
          <Text style={styles.detail} numberOfLines={2}>
            {detail}
          </Text>
        ) : null}
      </View>

      {count ? <Text style={styles.count}>{count}</Text> : null}
      <View style={styles.chevron}>
        <Icon name="chevron-right" size={18} color={text.secondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /*
    Everything aligns to the label's first line, not the row's middle: the
    detail beneath the label would otherwise push the mark, the count and the
    chevron down to sit beside the prose instead of beside the thing they mark.
    `SPEC_ROW` is B6's 56, rule to rule.
  */
  band: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    minHeight: SPEC_ROW,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  /* One rule under the last row, so two rows are one table and not two bands. */
  last: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: border.panel },
  /* A fill swap on press. Never a group opacity — see `Button`. */
  pressed: { backgroundColor: surface.well },
  mark: {
    ...type.monoLabel,
    lineHeight: type.displaySection.lineHeight,
    color: status.attention,
    width: 16,
    textAlign: 'center',
  },
  labelBlock: { flex: 1, gap: 2 },
  /* B1: a section-grade label in the condensed grotesk. */
  label: { ...type.displaySection, color: text.primary },
  detail: { ...type.body, color: text.muted },
  /* B6: the numeral, mono and right-aligned. */
  count: {
    ...type.mono,
    ...TABULAR,
    color: text.primary,
    fontSize: 15,
    lineHeight: type.displaySection.lineHeight,
  },
  chevron: { height: type.displaySection.lineHeight, justifyContent: 'center' },
});
