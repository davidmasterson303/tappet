import { Pressable, StyleSheet, Text, View } from 'react-native';

import Icon from './Icon';
import { TABULAR, border, space, status, surface, text, type } from '../theme';

/**
 * The open recalls, as a band on the car's screen.
 *
 * ── ⚠ 11 Sep · B5 and B7: a box became a row ────────────────────────────────
 *
 * This was `AlertBanner` in its `attention` tone — a sodium-stroked cut panel
 * with a condensed headline and a sans body. Under B5 (*"cards become
 * hairline-ruled bands; no nested cards"*) an outlined box on a screen of
 * bands is the one card left, and the critique named it: *"a sodium-outlined
 * box — a card"*. Under B7 the sodium is a line beside a warning, not a frame
 * around one.
 *
 * So it is the spec-table row every other record on the phone is: a hairline
 * above and below, the sodium hairline triangle at the left — the same `△` the
 * health drivers use, outlined and not filled — a condensed caps label, the
 * count right-aligned in mono, and the chevron that says it goes somewhere.
 *
 * ── What it keeps from the banner ──────────────────────────────────────────
 *
 * The worst open recall, named. The banner's note argued it and the argument
 * holds: *"a banner that describes itself is furniture, and a banner that names
 * the defect is information."* The defect sits under the label as one quiet
 * sans line, where a `NavRow`'s `detail` would.
 *
 * ── Why the count is not in the label ──────────────────────────────────────
 *
 * "2 OPEN RECALLS" with a "2" beside it says the number twice. The label names
 * the thing and the value carries the number, which is how every row on the
 * service record reads — and it is what lets the count sit in the mono column
 * B6 gives to numerals.
 */
export default function RecallBand({
  count,
  worst,
  onPress,
}: {
  count: number;
  /** The worst open recall, in the product's words. Omitted when unknown. */
  worst?: string | null;
  onPress: () => void;
}) {
  const noun = count === 1 ? 'recall' : 'recalls';

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`View ${count} open ${noun}${worst ? `. ${worst}` : ''}`}
      style={({ pressed }) => [styles.band, pressed && styles.pressed]}
    >
      {/*
        ⚠ `△` (U+25B3), the outlined triangle, in sodium — B7's "hairline
        triangle beside a genuine warning". A recall is one. Hidden from the
        reader because the label already says what it marks.
      */}
      <Text style={styles.mark} accessibilityElementsHidden>
        △
      </Text>

      <View style={styles.labelBlock}>
        <Text style={styles.label} numberOfLines={1}>
          Open {noun}
        </Text>
        {worst ? (
          <Text style={styles.detail} numberOfLines={2}>
            {worst}
          </Text>
        ) : null}
      </View>

      <Text style={styles.count}>{count}</Text>
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
  */
  band: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.md,
    minHeight: 56,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: border.panel,
  },
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
