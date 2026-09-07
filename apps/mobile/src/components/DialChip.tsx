import { StyleSheet, Text, View } from 'react-native';

import CutSurface from './CutSurface';
import Svg, { Path } from 'react-native-svg';

import { R, TRACK, VIEW_H, VIEW_W } from '@wellkept/core/cluster-geometry';
import { getHealthBandJudgement, healthBandHex } from '@wellkept/core/health-band';
import { border, cut, plinth, radius, space, surface, TABULAR, text } from '../theme';
import { monoFace, interFace } from '../theme/fonts';

/**
 * What the hero dial hands off to when it reaches the nav bar.
 *
 * ── Two drawings and one crossfade, never a morph ───────────────────────────
 *
 * The handoff is explicit that the dial does **not** shrink into the bar: *"a
 * 184pt dial at nav scale is 40pt across and its readout would be 9pt; an
 * instrument you cannot read is decoration."* So over its last third of travel
 * the dial fades out and this fades in. Do not try to interpolate one into the
 * other — they are different objects that happen to say the same number.
 *
 * ── ⚠ Why the arc is drawn here rather than from `ClusterGauge` ─────────────
 *
 * §6 of the handoff says not to touch `ClusterGauge`'s internals, and names
 * `variant="row"` as what this should use. In this repository `row` is
 * **text only** — a 30pt numeral over a 12pt verdict, no arc at all — because
 * of `DIAL_MIN`: *"below this a dial stops being a dial. Under ~88pt the ticks
 * stop resolving and the instrument is decoration."* A 26pt `ClusterGauge`
 * resolves to `row` and returns two lines of text at the wrong size for a nav
 * bar.
 *
 * The design system's own `row` variant evidently draws a small arc; this
 * app's does not. Rather than change a shared instrument to settle it, the arc
 * is drawn here from **`@wellkept/core/cluster-geometry`** — the same `TRACK`
 * path and viewBox the real dial uses — so it cannot drift from the instrument
 * it is standing in for.
 *
 * ⚠ And `DIAL_MIN` is not being dodged. That floor governs a dial somebody
 * **reads a value from**. This arc has no needle, no ticks and no readout by
 * design — the handoff says so — and the numeral beside it carries the value.
 * It is a mark, not an instrument, which is the one reading under which a 26pt
 * arc is honest. Logged in `docs/design-system-drift.md`.
 */

/** The arc's rendered width. The numeral beside it carries the reading. */
const ARC = 26;

export default function DialChip({ score }: { score: number }) {
  const band = getHealthBandJudgement(score);
  /*
    ── ⚠ 6 Sep · B3 and B7: the chip stopped being gold ──────────────────────

    This stroked its arc and set its numeral in `healthBandHex(band)` at every
    reading, so a 70 drew in the `ok` band's `#D6BE9B` — the gold B3 names and
    bans, on the one element that persists through the entire scroll.

    The critique's Cut list asked for this chip to go entirely, on the reading
    that the score is repeated further down the screen. **It is not chrome and
    it is not being removed.** R10/R25 made it a control: it is the only
    affordance that stays in reach for the whole scroll, it carries the spoken
    name "Health score 70 out of 100 — Fair. Opens health detail", and the
    alternative route into health is a row most of the way down the sheet.
    Deleting a documented, screen-reader-labelled door because a still frame
    looked redundant would be a regression the next critique could not see.

    So the violation is fixed rather than the element removed: the same rule the
    main dial follows — ink unless the band is a genuine warning.
  */
  const isWarning = band.name === 'warn' || band.name === 'bad';
  const colour = isWarning ? healthBandHex(band) : text.primary;
  const rounded = Math.round(score);

  /*
    ⚠ **`pathLength` does not exist on `react-native-svg`.** The web dial
    normalises the arc with `pathLength={100}` so the dasharray *is* the
    reading; native does not implement it, and `ClusterGauge` carries the same
    note. So the arc length is computed from the shared radius instead — one
    expression, from `cluster-geometry`, so this and the instrument cannot
    disagree about what 70 looks like.
  */
  const ARC_LENGTH = 1.5 * Math.PI * R;
  const lit = (Math.max(0, Math.min(100, rounded)) / 100) * ARC_LENGTH;

  return (
    /*
      ── ⚠ 6 Sep · B4: this was a pill, and B4 names pills specifically ────────

      `borderRadius: radius.pill` on a bordered, filled chip is the one shape the
      line rules out — *"every container corner is a 45° cut at zero radius …
      no capsules or pills."* `CutSurface` draws the ground and the corner; the
      radius scale it used is zeroed anyway, so the pill was the last one left.
    */
    <CutSurface
      style={styles.chip}
      cut={['bottomRight']}
      size={cut.control}
      fill={surface.card}
      stroke={border.panel}
      accessibilityRole="image"
      accessibilityLabel={`Health score ${rounded} out of 100 — ${band.label}`}
    >
      {/*
        The milled edge, as on the plinth the dial left behind. One inset
        catch-light along the top — not a shadow, and not a blur: there is no
        glassmorphism anywhere in this product.
      */}
      <View
        style={styles.catchLight}
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />

      <Svg
        width={ARC}
        height={(ARC * VIEW_H) / VIEW_W}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Path
          d={TRACK}
          stroke={border.field}
          strokeWidth={14}
          strokeLinecap="butt"
          fill="none"
        />
        {/*
          ⚠ Butt caps, like the instrument. A round cap adds half a stroke width
          at each end, so 0 paints a stub and every reading sits ~2% long — the
          note `cluster-geometry.ts` carries, and it applies at 26pt too.
        */}
        <Path
          d={TRACK}
          stroke={colour}
          strokeWidth={14}
          strokeLinecap="butt"
          fill="none"
          strokeDasharray={[lit, ARC_LENGTH]}
        />
      </Svg>

      <Text style={[styles.reading, { color: colour }]}>{rounded}</Text>
    </CutSurface>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.sm,
    paddingVertical: 5,
    /* ⚠ Ground, border and corner are `CutSurface`'s; a fill here squares it. */
    overflow: 'hidden',
  },
  catchLight: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    height: 1,
    backgroundColor: plinth.catchLight,
  },
  /**
   * 16/600 tabular.
   *
   * Tabular is not decoration here: this numeral is on screen while the dial
   * behind it is still crossfading, and proportional figures make a 1 about
   * half the width of a 7 — the number would visibly shift as the two drawings
   * hand over.
   */
  reading: {
    fontSize: 16,
    lineHeight: 20,
    /*
      ── ⚠ 6 Sep · B1: mono. This was `interFace('600')` ───────────────────────

      A health score is a *value*, and B1 gives values mono — this was the last
      one on the sheet still set in Inter. The critique caught that it was not
      mono but guessed it was the condensed grotesk, and told me to check the
      code rather than trust the eye. It was neither: Inter semibold, which at
      16pt in a small chip reads close enough to both to hide.

      ⚠ One line, still — RN does not synthesise weights; see `mobile-font-faces`.
    */
    fontFamily: monoFace('500'),
    ...TABULAR,
  },
});

/** The nav row reserves this much for the chip. See §4.6 — the title must clear it. */
export const DIAL_CHIP_SLOT = 56;
