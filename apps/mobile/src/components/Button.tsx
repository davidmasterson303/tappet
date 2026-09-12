import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { CONTROL_HEIGHT, border, cut, register, space, status, surface, text, type } from '../theme';
import { monoFace } from '../theme/fonts';
import CutSurface from './CutSurface';
import { WorkingMark } from './Working';

/*
  ── ⚠ 6 Sep · `quiet` is gone, and B4's list is why ─────────────────────────

  The brief names three: *"primary off-white fill with graphite mono caps,
  secondary off-white hairline, destructive sodium hairline."* `quiet` was a
  fourth — a graphite fill — and on the specimen sheet it landed directly above
  the field, which is also a graphite fill with a hairline and the same cut at
  the same height. The critique's words: "a tap target and an input are
  indistinguishable."

  That is not a taste call. A filled rectangle that is sometimes pressable and
  sometimes typed into has no way to tell you which it is.

  Its one call site took `outline`, which is the ladder's next rung and what the
  brief calls secondary.
*/
export type ButtonVariant = 'primary' | 'outline' | 'ghost' | 'delete';
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
 * is the screen's single verb; `outline` and `ghost` are the ladder
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
 * ── The accessible name survives the busy form ──────────────────────────────
 *
 * The `<Text>` naming a button is hidden while it works, so a control named by
 * its child would go anonymous at exactly the moment it has something to say.
 * The name is set on the `Pressable` itself and survives every state; enforced
 * repo-wide by `lib/__tests__/mobile-busy-controls-named.test.ts`.
 *
 * ── ⚠ 12 Sep · the busy form is the wait instrument's — brief B7 ────────────
 *
 * This swapped the label for an `ActivityIndicator` — the platform spinner,
 * in a colour chosen per variant so it stayed legible on the fill. It was the
 * right pattern for an app with no wait instrument, and that app is gone: web
 * settled one family for every wait on 11 Sep (`components/Working.tsx`,
 * graded 9/10) and the phone joins it. A busy button now drops to its
 * outlined form at its rest width and says what it is doing in the state
 * voice: the 14pt wait mark and a mono, uppercase status beside it, both in
 * the lit info blue.
 *
 * Two things the web measured, kept here:
 *
 *   - **The rest label sets the width; the status is painted over it.** The
 *     label stays in flow at opacity 0 and the status is absolutely positioned
 *     over the whole control, so the busy form is exactly the rest form's
 *     measured width, never a minimum — nothing beside it shifts. A status
 *     longer than the control clips rather than grows, which is a defect the
 *     eye sees rather than a shift nobody does; so `busyLabel` on a fitted
 *     control is one word, and an icon-only control passes `''` for the bare
 *     mark.
 *   - **Not the disabled fill.** `surface.disabled` under the outline would
 *     read as the control switching itself off under the finger. The busy
 *     form is transparent inside a `border.field` hairline — the same edge a
 *     field at rest wears — and the ink is `register.accentStrong`, web's
 *     `--info-strong`.
 */
export default function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'large',
  busy = false,
  busyLabel,
  disabled = false,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Drops to the busy form and blocks presses. The label stays the accessible name. */
  busy?: boolean;
  /**
   * What it is doing, present tense — "Saving", "Decoding the VIN". Rendered
   * as the mono status beside the mark; defaults to the label. `''` draws the
   * bare mark, for a control too narrow to carry a word.
   */
  busyLabel?: string;
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
          fill={busy ? undefined : inert ? surface.disabled : FILL[variant]?.[pressed ? 1 : 0]}
          stroke={busy ? border.field : inert ? undefined : STROKE[variant]}
        >
          {busy ? (
            <>
              {/*
                The rest label, held in flow and invisible, so the width is
                the rest width. Hidden from assistive technology too: the
                `Pressable` carries the name, and `accessibilityState.busy`
                carries the state.
              */}
              <Text
                style={[
                  styles[`${size}Label` as const],
                  styles[`${variant}Label` as const],
                  styles.restLabel,
                ]}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              >
                {label}
              </Text>
              <View style={styles.status} pointerEvents="none">
                <WorkingMark />
                {(busyLabel ?? label) !== '' ? (
                  <Text style={styles.statusLabel} numberOfLines={1}>
                    {busyLabel ?? label}
                  </Text>
                ) : null}
              </View>
            </>
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
/*
  ── 12 Sep · `ghost` presses to `raised`, as the pressed-states guard says ──

  `mobile-pressed-states.test.ts` has described `surface.raised` as "what
  `ListRow` and `Button`'s `ghost` press to" since August, and the map below
  had no `ghost` entry — so a ghost gave no feedback at all under the finger,
  and the guard's own sentence was the only place the rule existed. Nothing
  at rest (the variant paints no surface), `raised` while pressed: the fill
  swap every other variant makes, and the same one `ListRow` makes.
*/
const FILL: Partial<Record<ButtonVariant, [string | undefined, string]>> = {
  primary: [text.primary, text.secondary],
  ghost: [undefined, surface.raised],
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

    ⚠ 12 Sep · `small` is `CONTROL_HEIGHT`, the brief's 48 and the `Field`'s.
    It was `TARGET_MIN`, and beside a field — the odometer gate's THAT IS
    RIGHT — the two sat bottom-aligned with their tops 4pt apart, which the
    critique measured on the frame. A small control and a field share one
    edge now wherever they meet; nothing that cleared 44 clears it by less.
  */
  small: { minHeight: CONTROL_HEIGHT, paddingHorizontal: space.md },
  large: { minHeight: 52, paddingHorizontal: space.xl },

  /*
    B1: a button label is an action label, so it is mono caps — not the body
    sans it was.
  */
  smallLabel: { ...type.monoLabel },
  largeLabel: { ...type.monoLabel, fontSize: 13, lineHeight: 18 },

  /* B7: graphite ink on the off-white fill. */
  primaryLabel: { color: surface.page },
  outlineLabel: { color: text.primary },
  /*
    ── 12 Sep · a ghost is the roots' text chrome, and speaks in its ink ──────

    The roots set their text controls — ADD CAR, ADD, ACCOUNT — in
    `text.secondary`; a ghost was the same object at full ink, and on the Due
    table eight of them down the right edge outweighed the numerals they sat
    under (round 32: *"compete with the values column"*). The third rung of
    the ladder is quieter than the second: the same mono caps, one step of
    ink down. Still 4.5:1 with room on every surface it sits on.
  */
  ghostLabel: { color: text.secondary },
  deleteLabel: { color: status.dangerText },

  /*
    ⚠ Disabled is a real fill and real ink, never a group opacity — the fill is
    `surface.disabled` inside `CutSurface` and the ink is `text.disabled`, which
    is exempt from the contrast floor under WCAG 1.4.3 and is measured for it.
    An `opacity` here would fade label and surface together and read as the
    button disabling itself under the finger.
  */
  inertLabel: { color: text.disabled },

  /*
    ── The busy form — brief B7 ──────────────────────────────────────────────

    The rest label at opacity 0 holds the width (the contrast audit skips fully
    transparent text rather than measuring it at 1:1 — `test-support/
    contrast.ts`). The status sits over the whole control, centred, and clips
    rather than grows.
  */
  restLabel: { opacity: 0 },
  status: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: space.xs,
    overflow: 'hidden',
  },
  /*
    12pt mono caps at 0.06em, in the lit info blue — the ledger's voice, at
    the ledger's size, which is what fits inside a control's rest width.
  */
  statusLabel: {
    /* One line, for `mobile-font-faces`' line-by-line scan — see `Working`. */
    fontFamily: monoFace('500'), fontWeight: '500',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.7,
    textTransform: 'uppercase',
    color: register.accentStrong,
  },
});
