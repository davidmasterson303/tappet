import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { border, radius, space, surface, text, type } from '../theme';

/**
 * A panel. The most-missing primitive in this app.
 *
 * Every screen currently draws its own container — twelve slightly different
 * radii, borders and paddings, none of them wrong on their own and none of them
 * the same. That inconsistency is most of what reads as "sparse": the eye finds
 * no repeating structure, so nothing groups.
 *
 * ── `elevated`, and why the ladder matters more than the values ─────────────
 *
 * A card on the page background sits on `surface.card`. A card *inside* another
 * panel needs the next step up or it disappears, and the temptation at that
 * point is to reach for a border instead — which is how a screen ends up with
 * four nested outlines. `elevated` takes the step; the border stays subtle.
 */
export default function Card({
  title,
  footnote,
  elevated = false,
  style,
  children,
}: {
  /** Optional heading. Omit for a bare container. */
  title?: string;
  /** Quiet line under the content — provenance, counts, "estimated from". */
  footnote?: string;
  /** Use inside another panel, where the base surface would vanish. */
  elevated?: boolean;
  /**
   * ⚠ `StyleProp<ViewStyle>`, not `ViewStyle`.
   *
   * Widened 23 Aug so a caller can pass `[base, conditional && extra]`, which is
   * how every other component in this app expresses a conditional style. The
   * narrow type forced call sites to pre-flatten, and a call site that flattens
   * by hand is one merge order away from a style that silently loses.
   */
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.card, elevated && styles.elevated, style]}>
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {children}
      {footnote ? <Text style={styles.footnote}>{footnote}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    ── ⚠ 6 Sep · B5: a card is a band now ────────────────────────────────────

    This drew a container: `surface.card` behind a 1px `border.panel` at
    `radius.card`, padded on all four sides. Locked brief B5: *"One graphite
    surface; cards become hairline-ruled bands; no nested cards or shadows."*

    The argument is the same one `SpecBand` makes on web, and it is worth
    restating because it is not obvious: **a card cannot satisfy B5 by being
    restyled.** Its fill *is* the second surface and its border and radius are
    what B4 removes — so the fix is to stop drawing a container at all. What
    separates two sections is one hairline, and what names them is type.

    ⚠ **The rule is on the top edge, and there is no bottom rule.** Two adjacent
    bands would otherwise draw two hairlines a pixel apart, which reads as a
    seam rather than a division — the "four nested outlines" failure the
    original `elevated` note warned about, arriving from the other direction.

    ⚠ **No horizontal padding.** A band spans its container; insetting it
    re-creates the card's margin without its fill, which is the shape that made
    the nested-card screens read as nested in the first place. Callers that need
    a gutter set it on the page, once.
  */
  card: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
    paddingTop: space.lg,
    paddingBottom: space.lg,
    gap: space.md,
  },
  /*
    ⚠ `elevated` is now a no-op, and is kept rather than deleted for one
    release.

    It meant "this card is inside another card, take the next surface step". B5
    removes the nesting it existed to survive, so there is no step to take. It
    stays as an accepted prop so the twelve call sites that pass it keep
    compiling and can be cleaned up as each screen is ported — deleting it now
    would turn a design port into a twelve-file rename.

    A surviving `elevated` is therefore a marker for a screen not yet ported,
    the same way a surviving `radius.card` is.
  */
  elevated: {},
  /* B1: a section head is condensed grotesk caps, not the body sans. */
  title: { ...type.displaySection, color: text.primary },
  footnote: { ...type.mono, color: text.muted },
});
