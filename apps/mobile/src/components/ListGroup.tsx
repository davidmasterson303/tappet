import { StyleSheet, Text, View } from 'react-native';

import { border, space, text, type } from '../theme';

/**
 * A set of rows in one inset block, with its label outside it.
 *
 * ── Why this exists, which is a correction ──────────────────────────────────
 *
 * The vehicle hub's destinations were nav rows inside a `Card` with a
 * `SectionHeader` at the top of it. That is a *card with a title*, and it is
 * not what `specs/native-vehicle-detail.spec.html` draws. David's read on
 * 23 Aug, after the first attempt: *"'This car' section is still really bad UI
 * and UX, it's ugly and uninviting to engage with."*
 *
 * Looking at the rendered spec rather than its text — which is what I should
 * have done the first time — the differences are structural, not decorative:
 *
 *   - The label **`THIS CAR` sits above the block, not inside it.** A heading
 *     inside a card competes with the rows; a label outside names the group and
 *     gets out of the way.
 *   - Every row carries a **Lucide icon**. This is the single biggest reason
 *     the first attempt read as a wall of text: four left-aligned words in a
 *     box, with nothing to scan by.
 *   - The dividers are **inset to the label column**, not run edge to edge. A
 *     full-bleed rule cuts the block into slices; an inset one reads as a
 *     seam between rows of the same object.
 *   - The rows are **tighter** than a comfortable card row. A hub is a list of
 *     places, and places want to be countable at a glance.
 *
 * ── It is not a `Card`, and that is deliberate ──────────────────────────────
 *
 * `Card` is a container for *content*. This is a control surface: no inner
 * padding of its own, because the rows own their insets so a pressed row can
 * fill the block's full width. Two different jobs, and collapsing them is what
 * produced the version David rejected.
 *
 * ── ⚠ 12 Sep · B5: the block is a band now, not a box ──────────────────────
 *
 * It was `surface.raised` inside a hairline frame — a filled, outlined block
 * on a screen whose every other section had become a hairline band. The
 * vehicle screen was graded on its first fold for twenty-seven rounds and
 * this sat under it; the first frame scrolled past the recall row showed two
 * boxes on a page of bands. B5: *"One graphite surface; cards become
 * hairline-ruled bands; no nested cards or shadows."* So the fill and the
 * frame are gone: a hairline above the first row, one beneath the last, the
 * rows' own inset dividers between — the spec-table grammar the readings
 * under the garage dial and the two rows under the reading already use. The
 * pressed fill on a row is unchanged (a fill swap on press is a state, not a
 * surface). What the 23 Aug correction argued for — label outside, glyphs,
 * inset seams, tight rows — is untouched; only the container went.
 */
export default function ListGroup({
  label,
  children,
}: {
  /**
   * The group's name, rendered above it.
   *
   * Optional: a single unlabelled group on a screen that has already said what
   * it is does not need naming twice.
   */
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label.toUpperCase()}</Text> : null}
      <View style={styles.group}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  /*
    ⚠ B1: the condensed eyebrow, not `type.label`. The same slip `SectionHeader`
    carried until 6 Sep — the sans eyebrow the critique called "tracked grey
    sans, neither condensed nor mono" — survived here because this label was
    below the fold on the one screen that uses it with a name. Indented to the
    rows' own inset so it sits over the column it names.
  */
  label: { ...type.displayLabel, color: text.muted, paddingHorizontal: space.xs },
  /*
    Two hairlines and nothing between them but the rows. No fill (B5's one
    surface), no radius (B4's zero), no frame. Each row draws its own inset
    seam under itself but the last, so the band reads as one object with its
    rows countable — the property the 23 Aug rewrite was for.

    ⚠ 12 Sep, later the same day: the vehicle hub left for `BandRow` (its
    docblock says why), so the one screen this was written for no longer
    uses it. `WishlistAddScreen` still groups its suggestions here.
  */
  group: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: border.panel,
  },
});
