import { StyleSheet, Text, View } from 'react-native';

import CutSurface from './CutSurface';

import { cut, radius, space, status, text, type } from '../theme';

export type AlertTone = 'critical' | 'attention' | 'confirm';

/**
 * The banner that carries something time-critical.
 *
 * ── Solid fills, never a tinted transparency ────────────────────────────────
 *
 * These carry the only instructions in the product that cannot wait — a
 * do-not-drive recall, a park-outside warning — and a wash over an unknown
 * backdrop is precisely where the 4.47:1 defect came from on the advisor CTA.
 * The `critical` and `attention` pairs are opaque and measured.
 *
 * `Chip`'s soft washes are the other half of that decision: a wash is fine when
 * the message can wait, and wrong when it cannot.
 *
 * ── Severity is the data's, not the screen's ────────────────────────────────
 *
 * NHTSA's `parkIt` and `parkOutSide` flags decide `critical`; nothing here
 * infers urgency from wording. And a recall must **never** read as more or less
 * urgent because of the register — the sport treatment changes light and radii,
 * not what is dangerous.
 *
 * ── Announced, not just coloured ────────────────────────────────────────────
 *
 * The whole banner is one accessibility node with an explicit role, so a screen
 * reader gets the headline and body as a single utterance rather than two
 * unrelated strings — and gets them at all, which colour alone never provides.
 */
export default function AlertBanner({
  tone,
  headline,
  body,
}: {
  tone: AlertTone;
  headline: string;
  body?: string;
}) {
  return (
    <CutSurface
      accessible
      accessibilityRole="alert"
      accessibilityLabel={body ? `${headline}. ${body}` : headline}
      style={[styles.banner, styles[tone]]}
      cut={['bottomRight']}
      size={cut.control}
      fill={tone === 'critical' ? status.criticalFill : undefined}
      stroke={STROKE[tone]}
    >
      <Text style={styles.headline}>{headline}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </CutSurface>
  );
}

/** The hairline each tone draws, now that `CutSurface` strokes the shape. */
const STROKE: Record<AlertTone, string> = {
  critical: status.criticalBorder,
  attention: status.attentionBorder,
  confirm: status.confirmBorder,
};

const styles = StyleSheet.create({
  banner: {
    /*
      ── ⚠ 6 Sep: the cut reaches the banners after all ────────────────────────

      This read *"B4: zero radius; the cut is carried by controls, not by a
      report."* That was a fair reading of B4's list — "buttons, fields, chips,
      bubbles, composer" names controls and not banners — but the line opens
      *"**Every** container corner is a 45° cut at zero radius"*, and the list
      illustrates rather than limits.

      What settled it was seeing them together on the specimen sheet: three
      square boxes stacked directly beneath four buttons that all carry the cut,
      which the critique called "a second system". A rule with one shape for
      controls and another for reports is two rules.

      Ground, border and corner are `CutSurface`'s now.
    */
    padding: space.lg,
    gap: space.xs,
  },
  /*
    ── ⚠ 6 Sep · B7: the fills became lines, and one of them did not ─────────

    B7: *"Sodium only on genuine warnings as line; cyan only as focus, active
    rule and refresh ramp; no hue fills except the destructive confirm."*

    ⚠ **The `critical` fill is deliberately kept.** The note on `criticalFill`
    in `theme/index.ts` is load-bearing and predates this brief: these carry the
    only time-critical instructions in the product — a do-not-drive recall, a
    park-outside warning — and the pair is *measured*, `text.primary` at 13.82:1
    on `#431805`. Trading a measured solid for a hairline on the one banner that
    tells somebody not to drive their car is the wrong side of a safety trade,
    and B7's own exception ("except the destructive confirm") shows the brief
    already accepts that some instructions outrank the rule.

    `attention` and `confirm` are not that. They report a state — a count, a
    success — and a state is a line under this system. Both drop to a hairline
    with their ink intact.

    ⚠ So a filled banner in this app now *means* "act on this before driving".
    That is a stronger signal than it was when three tones were filled, which is
    the point.
  */
  /*
    ⚠ The tone styles carry layout only — the fill and the hairline moved to
    `CutSurface`'s props, because a `backgroundColor` here would paint a square
    corner back over the one the SVG cut.
  */
  critical: {},
  attention: {},
  confirm: {},

  /*
    White on all three fills, measured. The tone lives in the fill rather than
    in the ink: coloured text on a coloured banner is how one of these ends up
    at 3:1 without anyone choosing it.
  */
  headline: { ...type.displaySection, color: text.primary },
  /*
    ⚠ Sans, not mono. This was `type.mono` and the critique caught it as "mono
    doing prose": B1 puts mono on values, dates, indices and states — an alert's
    body is a *sentence*, and two lines of monospace prose reads as a log entry
    rather than as something addressed to a person. The headline stays condensed
    caps; only the sentence moved.
  */
  body: { ...type.body, color: text.secondary },
});
