import BandRow from './BandRow';

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
 * above, the sodium hairline triangle at the left — the same `△` the health
 * drivers use, outlined and not filled — a condensed caps label, the count
 * right-aligned in mono, and the chevron that says it goes somewhere.
 *
 * ── 12 Sep · the drawing moved to `BandRow` ────────────────────────────────
 *
 * The row above this one on the vehicle screen — "What is driving this
 * score" — needed the same voice, and two copies of one row is how the two
 * drift. `BandRow` draws; this names the noun, carries the count into the
 * numeral column, and writes the reader's sentence. The row's own rules,
 * including which of them is the last in the table, are the caller's.
 *
 * ── What it keeps from the banner ──────────────────────────────────────────
 *
 * The worst open recall, named. The banner's note argued it and the argument
 * holds: *"a banner that describes itself is furniture, and a banner that names
 * the defect is information."* The defect sits under the label as one quiet
 * sans line.
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
  last = false,
}: {
  count: number;
  /** The worst open recall, in the product's words. Omitted when unknown. */
  worst?: string | null;
  onPress: () => void;
  /** The last row of the table it sits in draws the closing hairline. */
  last?: boolean;
}) {
  const noun = count === 1 ? 'recall' : 'recalls';

  return (
    <BandRow
      warning
      label={`Open ${noun}`}
      detail={worst}
      count={String(count)}
      onPress={onPress}
      accessibilityLabel={`View ${count} open ${noun}${worst ? `. ${worst}` : ''}`}
      last={last}
    />
  );
}
