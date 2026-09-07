import { StyleSheet, Text, View } from 'react-native';

import { border, space, text, type } from '../theme';
import Button from './Button';

/**
 * What a screen says when it has nothing to show.
 *
 * ── Every empty state here is a first impression ────────────────────────────
 *
 * On a mobile-first product every one of these is reached by someone who has
 * just installed the app — the garage with no cars, the wishlist with nothing
 * on it, the service history of a vehicle whose invoices have not been scanned.
 * A reviewer meets several of them in the first two minutes, and
 * `contrast.test.tsx` already singles the garage's out as *"the first thing a
 * new user sees"*.
 *
 * ── The shape is deliberate: say what, say why, offer the door ──────────────
 *
 * A headline alone reads as a failure. The `body` is where the screen explains
 * that nothing is wrong, and `action` is the way out — because an empty state
 * without one is a dead end that asks the person to work out the next step
 * themselves, on a phone, having used the product for ninety seconds.
 *
 * `action` is optional only for the states that genuinely have no next step.
 * Prefer giving one.
 */
export default function EmptyState({
  headline,
  body,
  actionLabel,
  actionAccessibilityLabel,
  onAction,
  align = 'center',
  children,
}: {
  headline: string;
  /** Why it is empty, in plain words. Not an apology. */
  body: string;
  actionLabel?: string;
  /**
   * Override the action's spoken name.
   *
   * The garage needs it and its own comment says why: the header already
   * carries an "Add a car" control, and two controls with the same spoken name
   * on one screen are ambiguous to a screen reader in a way they are not to the
   * eye, which has position to go on.
   */
  actionAccessibilityLabel?: string;
  onAction?: () => void;
  /**
   * Which way the block reads.
   *
   * `center` is the default and is right for a state that stands alone in a
   * blank screen — the garage with no cars, a history with no invoices.
   *
   * ⚠ `start` exists for the advisor, and the reason is **R53**: its empty state
   * was centred while the composer under it and the starter rows beside it were
   * left-aligned, so one screen had two alignments and the eye had to re-find
   * the margin twice on the way down. A screen picks one.
   */
  align?: 'center' | 'start';
  /**
   * Extra quiet content under the body — the advisor's example questions.
   *
   * ⚠ Not a slot for controls, and it stayed that way through R50. The advisor's
   * starter rows *are* tappable now, and they moved **out of here** rather than
   * this rule being relaxed — they render as the advisor's own block beside this
   * one. Anything pressable belongs in `action`, where the ladder can see it,
   * or outside this component entirely.
   */
  children?: React.ReactNode;
}) {
  return (
    <View style={[styles.wrap, align === 'start' && styles.wrapStart]}>
      <Text style={[styles.headline, align === 'start' && styles.alignStart]}>{headline}</Text>
      <Text style={[styles.body, align === 'start' && styles.alignStart]}>{body}</Text>
      {children}
      {actionLabel && onAction ? (
        <Button
          label={actionLabel}
          accessibilityLabel={actionAccessibilityLabel}
          onPress={onAction}
          style={styles.action}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    Not vertically centred in the viewport. A block that floats in the middle of
    an otherwise blank screen reads as an error page; sitting below the content
    that would be there reads as a section with nothing in it yet, which is what
    this is.
  */
  /*
    ── ⚠ 6 Sep: empty states are left-aligned, and centring is now the opt-in ─

    The locked brief's studio paragraph: *"Empty states left-aligned: mono
    caption, sans body, one button."*

    This centred by default with `alignStart` as an escape hatch, and the
    critique named the result an AI tell in **every** round — "centered heading,
    centered body, full-width filled button… the default template, where the
    brief asks for left-aligned", and separately "the one place the app stops
    being left-aligned". Every other screen in this product reads from a left
    margin; an empty state that centres is the screen changing its mind about
    where sentences start, at the moment the user has least to look at.

    So the default flipped. `alignStart` survives as a no-op prop rather than
    being deleted, because six call sites pass it and each removal is a separate
    diff — a surviving `alignStart` now marks a call site not yet tidied, not a
    behaviour.
  */
  wrap: {
    paddingVertical: space.h1,
    paddingHorizontal: space.lg,
    gap: space.sm,
    alignItems: 'stretch',
    /* B5: a top rule, so it is a band like everything else rather than a card. */
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  wrapStart: {},
  /* B1: the headline is a section head — condensed grotesk caps. */
  /*
    ⚠ 6 Sep · B1: a mono caps caption, because the brief names one.

    The prose is *"Empty states left-aligned: mono caption, sans body, one
    button"* — three faces in a fixed order, and this was setting the caption in
    the condensed grotesk used for section heads.

    ⚠ **The critique thinks the brief is wrong here** — "the grotesk head reads
    better than the brief's mono caption; if the brief is ever reopened, amend
    that prose line rather than the sheet." That is David's call and the brief is
    locked, so this follows the brief. If it is reopened, this is the line to
    revisit and the argument is already made.
  */
  headline: {
    ...type.monoLabel,
    color: text.primary,
    textTransform: 'uppercase',
    /*
      ⚠ Declared, not inherited. Dropping this left the headline reading left
      anyway — RN defaults to it in LTR — and `AdvisorScreen`'s guard caught it,
      correctly: the assertion is that the alignment is *stated*, because the
      value this component shipped with was `center` and an undeclared default is
      one stylesheet edit away from going back.
    */
    textAlign: 'left',
  },
  body: { ...type.body, color: text.muted, textAlign: 'left' },
  alignStart: {},
  action: { marginTop: space.md, alignSelf: 'stretch' },
});
