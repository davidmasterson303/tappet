import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import {
  CX,
  CY,
  R,
  TRACK,
  VIEW_H,
  VIEW_W,
  angleFor,
  pointAt,
} from '@wellkept/core/cluster-geometry';
import { getHealthBandJudgement, healthBandHex } from '@wellkept/core/health-band';

import { DIAL_MIN, TABULAR, surface, text, type } from '../theme';
import { useReducedMotion } from '../motion/reduced-motion';
import { displayFace, interFace } from '../theme/fonts';

/**
 * The health score as an instrument cluster, on the phone.
 *
 * The web `ClusterGauge` argues the design at length and that argument is not
 * repeated here: a 270° tachometer face open at the bottom, ticks with the
 * numbers on the majors, one accent used as light rather than fill, and a
 * needle sweep at ignition. Read `components/ClusterGauge.tsx` for the why.
 *
 * What this file is responsible for is the three ways the phone is not a
 * browser.
 *
 * ── 1. The geometry is imported, not re-typed ───────────────────────────────
 *
 * `@wellkept/core/cluster-geometry` already exists for exactly this reason —
 * `BuildGauge` needed the same dial and a second copy of
 * `M 50.5 149.5 A 70 70 0 1 1 149.5 149.5` is a second copy. A third client
 * hand-copying it is the same mistake at worse odds, because the drift would be
 * invisible until someone held a phone next to a laptop.
 *
 * ── 2. `pathLength` does not exist on this renderer ─────────────────────────
 *
 * ⚠ The web dial normalises the arc with `pathLength={100}` so the dasharray is
 * literally the score — no circumference arithmetic and no chance of the fill
 * and the track describing different curves. **`react-native-svg` does not
 * implement `pathLength` on native.** It appears once in that package, in
 * `src/web/utils`, the react-native-web passthrough list — so on a device the
 * attribute is dropped silently and a dasharray of `61 100` paints 61 *user
 * units* of a 330-unit arc: every reading would land at about a fifth of its
 * true position, and it would look plausible.
 *
 * So the length is computed here, once, from the geometry the arc is actually
 * drawn with. `cluster-gauge.test.tsx` pins it against R.
 *
 * ── 3. Under `DIAL_MIN` this stops drawing a dial ───────────────────────────
 *
 * At row scale the ticks do not resolve and an instrument that cannot be read
 * is decoration. The `row` variant is not a smaller dial, it is a different
 * object: a tabular numeral and the verdict, both in the band colour.
 */

/**
 * The lit arc's length in user units — 270° at r=70.
 *
 * `2πR × 270/360`, which is `1.5πR`. The one piece of arithmetic the web
 * version got to skip.
 */
const ARC_LENGTH = 1.5 * Math.PI * R;

/**
 * The arc's weight, in viewBox units.
 *
 * ⚠ **This is 2 where the tachometer's was 6, and "hairline" is the brief's
 * word, not a preference.** B3 asks for a hairline arc; a 6-unit stroke on a
 * 70-unit radius is a ring, and a ring reads as a progress bar bent into a
 * circle — which is what makes a filled gauge feel like a game meter rather
 * than an instrument.
 */
const HAIRLINE = 2;

/**
 * The two dots that terminate the arc: its extents, 0 and 100.
 *
 * These replace twenty-seven tick marks. They are not a scale — they say where
 * the instrument begins and ends, which is the only part of a scale a reading
 * this large actually needs.
 */
const TERMINALS = [0, 100];

/** The ignition sweep: 0 → 100 → settle, ~900ms. Split as the web dial splits it. */
const SWEEP_UP = 420;
const SETTLE = 480;

/**
 * The ignition sweep, as a rendered reading.
 *
 * Driving the needle and the arc from one number keeps them on the same value
 * at every frame — they are one quantity drawn twice, not two animations that
 * happen to agree.
 *
 * `useNativeDriver` is false and cannot be true: the value drives an SVG
 * dasharray and a rotation *expressed in a transform string*, neither of which
 * the native driver can touch. A 900ms one-shot on a nine-element SVG is well
 * inside budget on the phones this app targets; a sweep on every scroll frame
 * would not be.
 */
function useIgnitionSweep(target: number, enabled: boolean): number {
  const reduced = useReducedMotion();
  /*
    Seeded with the target rather than 0. If every effect below were somehow
    skipped — a test that never flushes, a platform without Animated — this
    still reads correctly. The one state the instrument may never rest in is
    zero-beside-a-verdict.
  */
  const [reading, setReading] = useState(target);
  const driver = useRef(new Animated.Value(target)).current;

  useEffect(() => {
    if (reduced || !enabled) {
      driver.stopAnimation();
      driver.setValue(target);
      setReading(target);
      return;
    }

    const listener = driver.addListener(({ value }) => setReading(value));
    driver.setValue(0);

    const sweep = Animated.sequence([
      Animated.timing(driver, {
        toValue: 100,
        duration: SWEEP_UP,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
      Animated.timing(driver, {
        toValue: target,
        duration: SETTLE,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }),
    ]);

    /*
      The end state is set from the callback rather than left to the last
      animation frame, and it runs whether or not the sweep finished. An
      interrupted sweep — a screen popped mid-flight, reduced motion switched on
      at frame 200 — lands on the reading instead of wherever it was cancelled.
    */
    sweep.start(() => setReading(target));

    return () => {
      sweep.stop();
      driver.removeListener(listener);
    };
  }, [target, enabled, reduced, driver]);

  return reading;
}

export type ClusterGaugeVariant = 'hero' | 'card' | 'row';

export default function ClusterGauge({
  score,
  variant = 'hero',
  size,
  active = true,
}: {
  score: number;
  /**
   * `hero` is the full dial — minors, numbered majors, needle, hub, and the
   * readout on its own line. `card` is the same instrument at the plinth's
   * scale, deliberately still. `row` is not a dial at all.
   */
  variant?: ClusterGaugeVariant;
  /** Rendered width in points. Defaults to the variant's design size. */
  size?: number;
  /** Hold the sweep until the caller's own reveal has finished. */
  active?: boolean;
}) {
  const band = getHealthBandJudgement(score);
  const colour = healthBandHex(band);
  /*
    ── ⚠ 6 Sep · B3 and B7: the arc is off-white unless something is wrong ────

    The dial used to stroke itself in the band colour at every score, which put
    `#D6BE9B` — the `ok` band — on screen for every reading between 60 and 79.
    That is the gold the locked brief names in B3 ("no gold"), and it was a
    third hue on a two-hue system.

    The band is **not** recoloured to fix that, and must not be: thresholds,
    wording and colour are owned by `@wellkept/core/health-band` and shared with
    web, and the phone holding a second opinion about what "Fair" looks like is
    the defect that ownership exists to prevent. What changes is only *when the
    dial spends a hue at all*.

    B7: "Sodium only on genuine warnings as line." Good and Fair are readings
    that need no colour — they are off-white ink, which is what the system means
    by good news. `warn` and `bad` are already sodium (`#DE8A3A`, `#F4511E`), so
    a warning keeps its band colour and nothing else does.
  */
  const isWarning = band.name === 'warn' || band.name === 'bad';
  const arcInk = isWarning ? colour : text.primary;
  const rounded = Math.round(score);

  const width = size ?? (variant === 'hero' ? HERO_SIZE : CARD_SIZE);

  /*
    The degrade is a floor, not a preference. A caller asking for a hero at 72pt
    gets the row scale, because at 72pt the minors are sub-pixel and six numbers
    are illegible — the same judgement `DIAL_MIN` is named for. Passing a small
    size is how this mistake will actually be made; refusing it in the type
    system would only move it to a magic number at the call site.
  */
  const resolved: ClusterGaugeVariant = variant === 'row' || width < DIAL_MIN ? 'row' : variant;

  const swept = useIgnitionSweep(score, active && resolved === 'hero');

  if (resolved === 'row') {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel={`Health score ${rounded} out of 100 — ${band.label}`}
        style={styles.row}
      >
        {/*
          30 and 12, both in the band colour. The numeral is the instrument
          here, so it carries the weight the dial would have; the verdict sits
          under it in the type scale's own label role rather than a shrunken
          copy of the hero's caption.
        */}
        <Text style={[styles.rowReading, { color: colour }]}>{rounded}</Text>
        <Text style={[styles.rowVerdict, { color: colour }]}>{band.short}</Text>
      </View>
    );
  }

  const isCard = resolved === 'card';

  /*
    Two viewBoxes, one geometry — the web dial's note applies unchanged. The
    hero crops to 178 tall because the 26 units below the arc are the readout's
    line; the card has no readout line, so it takes a square window centred on
    the pivot instead and its number sits in the well.
  */
  const viewBox = isCard ? `14 14 172 172` : `0 0 ${VIEW_W} ${VIEW_H}`;
  const height = isCard ? width : (width * VIEW_H) / VIEW_W;

  const value = isCard ? score : swept;
  const clamped = Math.max(0, Math.min(100, value));
  const lit = (clamped / 100) * ARC_LENGTH;

  /*
    ── The readout is real text on top of the SVG, not `<SvgText>` ────────────

    ⚠ `react-native-svg`'s `fontVariant` is the **SVG** property — `normal` or
    `small-caps`. It has no tabular-numerals setting of any kind, so a number
    drawn inside the SVG gets proportional figures.

    That is fine for the tick numbers, which never change. It is not fine for
    the readout: the sweep animates it through every value from 0 to 100 and
    back down, and with proportional figures a 1 is about half the width of a 7
    — the number visibly jitters sideways for the whole 900ms. `TABULAR` exists
    in the theme for exactly this and only React Native's own `Text` honours it.

    So the readout is positioned over the dial instead. The arithmetic is the
    viewBox mapping, stated once: the hero's readout line is y=150 of a 200-wide
    box drawn at `width`, and the card's number sits on the pivot, which its
    square window puts at dead centre.
  */
  /*
    ── ⚠ 6 Sep · B3: the reading moved to the middle and got much bigger ──────

    Both changes are consequences of deleting the hub, and neither was available
    before it.

    **Size.** The hero readout was `30/200` of the width — about 28pt on a 184pt
    dial, which is smaller than the screen's own title. B3 asks for a *dominant*
    grotesk numeral, and dominant is the whole point: the reading is what the
    screen is for, and it was previously the fourth-largest thing on it.

    **Position.** It sat at `0.75` of the width — low, where a tachometer puts
    its digital readout, because *"centring it in the well is not available once
    there is a hub: the needle would cross the digits."* There is no hub and no
    needle now, so the constraint that pushed it down is gone and the reading
    sits in the middle of its own arc.
  */
  const readoutSize = Math.round(width * (isCard ? 60 / 172 : 0.34));
  const readoutLine = Math.round(readoutSize * 1.02);
  const readoutTop = 0.5 * width - readoutLine / 2;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`Health score ${rounded} out of 100 — ${band.label}`}
      style={styles.dial}
    >
      <View style={{ width, height }}>
        <Svg viewBox={viewBox} width={width} height={height}>
          {/*
          The unlit face. On the card it takes a wash of the band rather than
          plain white, because at that size the ring is most of what is seen and
          a neutral track reads as a broken instrument rather than a quiet one.
        */}
          <Path
            d={TRACK}
            fill="none"
            stroke={text.nonText}
            strokeOpacity={0.25}
            strokeWidth={HAIRLINE}
            strokeLinecap="butt"
          />

          {/*
          The reading.

          Butt caps, not round — a round cap adds half a stroke width of arc at
          each end, so a score of 0 still paints a visible stub and every
          reading sits about 2% long. On a dial with ticks that error is
          legible, and it is the defect the web gauge's caps were changed for.
        */}
          <Path
            d={TRACK}
            fill="none"
            stroke={arcInk}
            strokeWidth={HAIRLINE}
            strokeLinecap="butt"
            strokeDasharray={[lit, ARC_LENGTH]}
          />

          {/*
            ── ⚠ 6 Sep · B3: the ticks, the numbers, the needle and the hub all
            went, and this is the largest single deletion in the design port ───

            What stood here was a 270° tachometer face: twenty-one minor
            hairlines, six numbered majors, a swept needle and a hub cap. Every
            piece of it was carefully built and the whole thing was the wrong
            object — the locked brief's word for it is "gaming-HUD
            skeuomorphism", and the critique's word was "a picture of a dial".

            B3: *"Dial is a hairline off-white arc with dot terminals, dominant
            grotesk numeral, mono state word; no needle, scale, gold or icon."*

            The scale is not lost information. Both ends of the arc are where
            they always were, the reading is the largest thing on the screen,
            and the full "N out of 100" is on the container's accessibility
            label — which is where it was doing the real work anyway, because
            the tick numbers sat at the type floor and a scale nobody reads is
            decoration with a legibility cost.
          */}

          {/*
            The terminals. Two dots, at the ends of the track rather than at the
            reading — they are the instrument's extents, so they do not move.

            Drawn at `text.nonText` like the track: a dot brighter than the arc
            it terminates reads as a value marker, which is the one thing it
            must not be mistaken for.
          */}
          {TERMINALS.map((tick) => {
            const at = pointAt(tick, R);
            return (
              <Circle
                key={`terminal-${tick}`}
                cx={at.x}
                cy={at.y}
                r={HAIRLINE * 1.5}
                fill={text.nonText}
                fillOpacity={0.5}
              />
            );
          })}

          {/*
            The reading's own dot, riding the end of the sweep.

            This is the one place the dial spends a hue, and only when the band
            is a genuine warning — see `arcInk` above. At rest it is off-white,
            which is what makes a sodium dot mean something when it appears.
          */}
          <Circle
            cx={pointAt(clamped, R).x}
            cy={pointAt(clamped, R).y}
            r={HAIRLINE * 2}
            fill={arcInk}
          />
        </Svg>

        {/*
          The readout. On the hero it sits on the line the 178-tall viewBox
          exists to make, below the hub and between the 0 and 100 labels —
          exactly where a tachometer puts its digital readout. Centring it in
          the well is not available once there is a hub: the needle would cross
          the digits.

          No "/100". No instrument prints its own denominator when the scale is
          drawn around it and both ends are numbered; the full reading is on the
          container's accessibility label, where the dial cannot be seen.

          `pointerEvents` none so the number never intercepts a press meant for
          whatever the dial is sitting on.
        */}
        <Text
          pointerEvents="none"
          style={[
            styles.readout,
            {
              top: readoutTop,
              fontSize: readoutSize,
              lineHeight: readoutLine,
              color: isCard ? text.primary : arcInk,
            },
          ]}
        >
          {Math.round(value)}
        </Text>
      </View>

      {/*
        The verdict, in real text rather than in the SVG — it is language, and
        it should scale with the platform's type settings like every other
        string on the screen.

        `short` on the card: "Needs attention" does not fit under a 104pt dial.
        Same band, abbreviated; never a different judgement.
      */}
      <Text
        style={[
          styles.verdict,
          {
            /* B7: the state word is ink, not a hue, unless it is a warning. */
            color: arcInk,
            fontSize: isCard ? type.label.fontSize : Math.round(width * 0.07),
          },
        ]}
      >
        {isCard ? band.short : band.label}
      </Text>
    </View>
  );
}

/**
 * The design sizes, from the baseline board.
 *
 * Hero is one per screen and lives in the garage bay. Card is the plinth on
 * vehicle detail. Anything under `DIAL_MIN` is a row and has no dial at all.
 */
export const HERO_SIZE = 184;
export const CARD_SIZE = 104;

const styles = StyleSheet.create({
  dial: { alignItems: 'center', flexShrink: 0 },
  readout: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    /*
      ⚠ B3: the reading is set in the condensed grotesk, not in Inter. It is the
      "dominant grotesk numeral" the brief names, and the display face is what
      makes it read as an instrument's own numerals rather than as large UI
      text. `TABULAR` stays — a score that reflows mid-count-up reads as a
      glitch, and that is what the 900ms sweep spends its time doing.
    */
    /*
      Spread rather than picked apart, because `mobile-font-faces.test.ts`
      scans line by line: a `fontWeight` whose `fontFamily` is on the line above
      reads to it as a naked weight, and it is right to — that is exactly the
      shape that renders San Francisco in silence. The size and line height are
      overridden inline from the dial's width.
    */
    ...type.numeral,
    ...TABULAR,
  },
  /* B1: a state word is a state label, and state labels are mono caps. */
  verdict: { ...type.monoLabel },
  row: { alignItems: 'flex-end' },
  /**
   * 30, off the type scale on purpose. The scale names roles for language —
   * 12 labels a value, 13 is a value, 14 is UI, 16/18 are body — and an
   * instrument reading is none of those. It is the dial, at the size the dial
   * is not available.
   */
  rowReading: { fontSize: 30, lineHeight: 34, fontFamily: displayFace('700'), fontWeight: '700', ...TABULAR },
  rowVerdict: { ...type.monoLabel },
});
