import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { TARGET_MIN, cut, space, status, surface, text, type } from '../theme';
import CutSurface from './CutSurface';

export type ButtonVariant = 'primary' | 'quiet' | 'outline' | 'ghost' | 'delete';
export type ButtonSize = 'small' | 'large';

/**
 * The button primitive. Web got one in v8 §8a; this app did not.
 *
 * Six variants, four states each, two sizes — the board's "primitive set"
 * section in full. **States are not optional**: a variant without its pressed
 * and disabled treatment is where every one of this product's contrast defects
 * has come from, and the two worst were both disabled states.
 *
 * ── ⚠ `inverse` is gone, 23 Aug. There is one filled treatment ─────────────
 *
 * There used to be a sixth variant: white fill, near-black ink, for a verb that
 * had to outrank everything. It was well built — four dedicated tokens, four
 * states, measured contrast at each — and it was **against the system**. The
 * readme's override register says it plainly: *"Advisor CTA — white fill →
 * `.btn-primary`; a white button is a foreign colour here."*
 *
 * The v8.3 review found what that cost. `Take a photo`, `That is right` and
 * `Ask` were white; `See suggestions` was cyan. Two filled primaries in one
 * app, and the **more common one was the one the system forbids** — so the
 * screens disagreed with each other about what a primary action looks like,
 * which is the thing a design system exists to stop.
 *
 * The tokens went with it rather than being left dead. `theme/index.ts` carries
 * the rule about why: a token nothing reads is how a retired treatment comes
 * back, one call site at a time, with its argument already written.
 *
 * What survives is the reasoning that made `inverse` worth building — the
 * treatment must be a primitive, not six private copies. Before 15 Aug it lived
 * in sign-in, add-vehicle, the wishlist, the advisor, the invoice scan and the
 * service milestone, diverging the way private copies do: 15pt against 16,
 * weight 600 against 700, letter-spacing on some and not others, on the app's
 * most important control. That is why `primary` is a variant here and not a
 * style anybody may write out.
 *
 * ── One filled primary per screen ───────────────────────────────────────────
 *
 * Every screen spec says it, and this is where the temptation lives. `primary`
 * is the screen's single verb; `quiet`, `outline` and `ghost` are the ladder
 * beneath it. Two filled primaries on one screen means neither is one.
 *
 * ── Pressed deepens; it never lightens ──────────────────────────────────────
 *
 * With near-white ink, lighter always means less contrast. The board's first
 * draft sent pressed *up* the ramp to `#0891B2` — 3.51:1, and the exact hex v8
 * removed at 3.68:1. Every variant here presses **down**, and
 * `theme-backdrop.test.tsx` pins the direction rather than any single value.
 *
 * ── Disabled is a fill swap, never a group opacity ──────────────────────────
 *
 * An `opacity` on the container composites everything beneath it, including ink
 * that was compliant at full strength. Not hypothetical: this app put a
 * near-black "Ask" label at **1.61:1** exactly that way, invisible to both
 * guards — the source scan saw no colour literal inside an opacity, and the
 * rendered suite did not composite parent alpha until 7 Aug.
 *
 * WCAG 1.4.3 exempts inactive controls, which is why `text.disabled` may sit
 * below the floor. A deliberate exemption, not an oversight.
 *
 * ── The accessible name survives the spinner ────────────────────────────────
 *
 * The `<Text>` naming a button is swapped for an `ActivityIndicator` while it
 * works, so a control named by its child goes anonymous at exactly the moment
 * it has something to say. Enforced repo-wide by
 * `lib/__tests__/mobile-busy-controls-named.test.ts`.
 */
export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  busy = false,
  disabled = false,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows the spinner and blocks presses. The label stays the accessible name. */
  busy?: boolean;
  disabled?: boolean;
  /**
   * Override the spoken name when the visible text is ambiguous *on this
   * screen* — two controls reading "Add a car" is ambiguous to a screen reader
   * in a way it is not to the eye, which has position to go on.
   *
   * Not for paraphrasing the label; an override that merely restates it makes
   * the two surfaces drift.
   */
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  const inert = disabled || busy;

  return (
    <Pressable
      onPress={onPress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: inert, busy }}
      style={[styles.base, style]}
    >
      {({ pressed }: { pressed: boolean }) => (
        /*
          ── ⚠ 6 Sep · B4: the button's shape is drawn, and it *wraps* ────────

          A `backgroundColor` cannot have a 45° corner, so the fill moved into a
          `CutSurface`.

          ⚠ **It has to be the label's parent, not an absolutely-filled
          sibling.** The first version placed it behind the label with
          `StyleSheet.absoluteFill`, which looks identical and is wrong for a
          reason that only shows up in the audit: `test-support/contrast.ts`
          composites surfaces **down the ancestor chain**, so a sibling — however
          it is positioned — is not on the path between the screen and the text.
          Every button label came back measured against the page at 1.00:1
          against graphite ink. Wrapping puts the declared ground where the walk
          actually looks.

          ⚠ **`ghost` gets a surface too, and paints nothing with it.** Keeping
          the tree shape identical across variants is what stops this class of
          bug returning: one variant whose label has a different set of
          ancestors is one variant the audit measures differently.
        */
        <CutSurface
          style={[styles.surface, styles[size]]}
          cut={['bottomRight']}
          size={cut.control}
          fill={inert ? surface.disabled : FILL[variant]?.[pressed ? 1 : 0]}
          stroke={inert ? undefined : STROKE[variant]}
        >
          {busy ? (
            /*
              The spinner has to be legible on the fill it spins on. `SPINNER`
              carries the exception per variant and `text.primary` is the
              default — the case this was written for was the retired white
              control, where the platform default and `text.primary` were both
              white on white, giving a control that looks empty at exactly the
              moment it is working. The off-white primary re-creates that
              hazard, which is why `SPINNER.primary` is graphite.
            */
            <ActivityIndicator color={SPINNER[variant] ?? text.primary} />
          ) : (
            <Text
              style={[
                styles[`${size}Label` as const],
                styles[`${variant}Label` as const],
                inert && styles.inertLabel,
              ]}
            >
              {label}
            </Text>
          )}
        </CutSurface>
      )}
    </Pressable>
  );
}

/**
 * The spinner's ink per variant, where the default is wrong.
 *
 * Only the brand fill needs naming — its ink is `text.onPrimary`, not white.
 * Everything else spins in `text.primary` against a dark or absent fill.
 */
const SPINNER: Partial<Record<ButtonVariant, string>> = {
  /*
    ⚠ 6 Sep: the primary's ink is graphite now. The original note here was
    written for the *retired* white control and warned its spinner went
    white-on-white — the exact hazard the off-white fill re-creates, so the
    exception is re-pointed rather than removed.
  */
  primary: surface.page,
  delete: status.dangerText,
};

/**
 * ── ⚠ 6 Sep · B7: the filled primary is off-white, not the brand cyan ───────
 *
 * *"Primary off-white fill with graphite mono caps, secondary off-white
 * hairline, destructive sodium hairline."*
 *
 * ⚠ **This reverses the 23 Aug decision** that deleted `surface.inverse` on the
 * reading that "a white button is a foreign colour here", leaving `brand.primary`
 * as the app's only filled control. That was right for the system as it stood.
 * The system moved: under the two-hue collapse a *hue* fill is what is reserved
 * for hover and critical, and good news — including the primary action — is
 * off-white ink. A teal block is now the foreign colour.
 *
 * ⚠ The fill is `text.primary` (`#F5F3F0`), **not** `#FFFFFF`. Pure white was
 * the retired token and is not coming back through this door; this is the
 * system's own ink used as a ground. Logged in `docs/design-system-drift.md`
 * §6.7.
 */
const FILL: Partial<Record<ButtonVariant, [string, string]>> = {
  primary: [text.primary, text.secondary],
  quiet: [surface.raised, surface.well],
  delete: [surface.page, surface.raised],
};

/** Hairline edges. Secondary is off-white; destructive is sodium. */
const STROKE: Partial<Record<ButtonVariant, string>> = {
  outline: text.primary,
  delete: status.dangerText,
};

const styles = StyleSheet.create({
  /*
    ── ⚠ 6 Sep · B4: the pill is gone and the corner is a cut ────────────────

    This carried `borderRadius: radius.pill` under a long note arguing that "the
    phone's own idiom is the pill" and that a 12pt corner "reads as a web form
    submit" — a deliberate native override of the design system's radius map,
    logged as such at the time. Both clients are on the 45° cut now, so the
    override has nothing left to be an override *of*.

    ⚠ There is no `borderRadius` here at all. The shape is drawn by
    `CutSurface`; a radius on this view would round the *touch target* around a
    cut fill and show as a hairline of page colour in the corners.
  */
  base: {},
  /*
    The padded, centred box. This is the `CutSurface`, so the padding and the
    minimum height live here rather than on the `Pressable` — the fill has to
    reach the control's edges, and a `Pressable` that carried the padding would
    leave an unpainted gutter around the cut.
  */
  surface: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  /*
    ── Both sizes clear 44pt ─────────────────────────────────────────────────

    "Small" is narrower and lighter in type; it is **not** shorter. The floor is
    a coarse-pointer target rather than a style, and a 36pt button is the most
    common way a design system quietly stops meeting it.

    ⚠ `large` stays 52 against the brief's 48. The brief names a height; this app
    has a floor it has cleared since August, and lowering a shipped control to
    match a number in a paragraph would be a regression dressed as compliance.
    52 satisfies "at least 48" and every existing screen's measurements.
  */
  small: { minHeight: TARGET_MIN, paddingHorizontal: space.md },
  large: { minHeight: 52, paddingHorizontal: space.xl },

  /*
    B1: a button label is an action label, so it is mono caps — not the body
    sans it was.
  */
  smallLabel: { ...type.monoLabel },
  largeLabel: { ...type.monoLabel, fontSize: 13, lineHeight: 18 },

  /* B7: graphite ink on the off-white fill. */
  primaryLabel: { color: surface.page },
  quietLabel: { color: text.primary },
  outlineLabel: { color: text.primary },
  ghostLabel: { color: text.primary },
  deleteLabel: { color: status.dangerText },

  /*
    ⚠ Disabled is a real fill and real ink, never a group opacity — the fill is
    `surface.disabled` inside `CutSurface` and the ink is `text.disabled`, which
    is exempt from the contrast floor under WCAG 1.4.3 and is measured for it.
    An `opacity` here would fade label and surface together and read as the
    button disabling itself under the finger.
  */
  inertLabel: { color: text.disabled },
});
