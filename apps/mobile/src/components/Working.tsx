import { useEffect, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { R, TRACK, pointAt } from '@tappet/core/cluster-geometry';

import { TABULAR, border, register, space, status, text, type } from '../theme';
import { monoFace } from '../theme/fonts';
import { useReducedMotion } from '../motion/reduced-motion';
import type { WorkingStage } from './working-stages';

/**
 * The wait instrument, on the phone: the health dial's ignition sweep, held
 * until the work is done.
 *
 * ── What it is, in one paragraph ────────────────────────────────────────────
 *
 * Web's `components/Working.tsx` carries the whole argument and it is not
 * repeated here: David asked for "more engaging loading states" on 11 Sep,
 * the product boundary (CLAUDE.md §10) rules out a percentage, a bar that
 * fills, a stage a timer advanced or a duration nobody measured, so
 * "engaging" became an instrument that is visibly alive and copy that is true
 * for the whole of the wait. The instrument is the dial's own "switched on,
 * no reading yet" motion — a 24° cyan pip hunting terminal to terminal on the
 * hairline arc, an empty centre where the numeral would be — kept going. The
 * web loop graded it 9/10, nine of nine brief lines, and the phone joins that
 * system rather than getting a parallel one (`design-loop/mobile-ios/brief.md`).
 *
 * ⚠ It swings, it does not fill. The dash pattern is a fixed length and only
 * its *offset* animates, between the two ends of the scale; an arc that draws
 * to 100 and restarts is a progress bar in the dial's clothes.
 *
 * ── What this file is responsible for: the four ways the phone differs ──────
 *
 * **1. `pathLength` does not exist here.** The web pip is a dash pattern in
 * percent of a `pathLength="100"` path, and the keyframes name positions on
 * it. `react-native-svg` drops that attribute silently on a device —
 * `ClusterGauge` records the finding — so the pip is `[SEGMENT, ARC_LENGTH]`
 * in user units, computed from the geometry the arc is actually drawn with,
 * and the offset travels between `0` (the foot) and `-(ARC_LENGTH - SEGMENT)`
 * (the head). The rest position is the midpoint: twelve o'clock.
 *
 * **2. The motion is `Animated`, on the JS driver.** There is no CSS here, so
 * the sweep is an `Animated.loop` of two eased traverses driving
 * `strokeDashoffset` on an `Animated.createAnimatedComponent(Path)`, and the
 * terminal flash (brief B5) is a cyan dot over each terminal whose opacity
 * lights at the pip's arrival and decays over 312ms — the web's 12% of a
 * 2600ms loop. `useNativeDriver` is false and cannot be true: the values are
 * SVG props, which the native driver cannot touch. A three-path SVG at 60fps
 * is well inside budget; the flash rides the same sequence rather than a
 * second loop, so the two can never drift apart.
 *
 * **3. Reduced motion is a designed still, not a stopped animation.** Under
 * `useReducedMotion` the pip is set to twelve o'clock and the flashes to zero
 * — the same frame `frozen` holds for the specimen and the design loop's
 * captures, so a screenshot under reduced motion and a specimen frame are one
 * picture by construction. Nothing here ever waits on the preference: the
 * module warms it at import (`motion/reduced-motion.ts`), and a late "reduced"
 * lands the pip at the centre mid-flight.
 *
 * **4. The full face is a band, not a panel.** Web's full face draws its own
 * graphite panel with the 45° cut (web brief B3). The phone's brief B5 is
 * *"one graphite surface; cards become hairline-ruled bands; no nested
 * cards"*, so here the full face is a hairline rule and the cluster on the
 * page surface — the phone's `Card` made the same move on 6 Sep. And it
 * stacks arc over text on one left edge, which is what the web brief already
 * says the phone-width composition does. Recorded in
 * `docs/design-system-drift.md` §6.14.
 *
 * ── Strokes are pixels ──────────────────────────────────────────────────────
 *
 * A hairline is a rendered width. The frame is the arc's own bounding box
 * (140 × 120 user units, the web's `ARC_BOX`), so at 128pt one unit is
 * 128/140 pt and a 1pt track is 1.09 units; the compact face is 140 units
 * over 20pt, the mark 140 over 14. Each face derives its widths from its
 * rendered size rather than carrying a table, and the terminal is a `Circle`
 * whose radius is half its pixel diameter in the same units.
 *
 * ⚠ The strokes overflow the frame by half their width, and unlike the web's
 * `overflow="visible"` a native SVG view paints nothing outside its bounds.
 * So the viewBox is padded by half the widest stroke and the view is drawn
 * that much larger, then pulled back with a negative margin — the layout box
 * stays the arc's box, which is what the text column aligns to.
 *
 * ── Copy ────────────────────────────────────────────────────────────────────
 *
 * `line` is what is happening, present tense, set in mono caps — the state
 * voice. Required: a caller that cannot say what it is waiting on should not
 * render this. `detail` is the facts the caller was handed and what the
 * answer will contain. Neither is a place for a number nobody measured; the
 * only duration the product prints on any wait is web's "usually under a
 * minute" on vehicle research, and the phone has no such wait.
 */

/** The arc's length in user units: 270° at r=70. The dial's arithmetic, again. */
export const ARC_LENGTH = 1.5 * Math.PI * R;

/**
 * The pip: 9% of the arc, which is 24° of the 270° scale — brief B5. The dash
 * array is `[SEGMENT, ARC_LENGTH]`, so exactly one pip is ever on the scale.
 */
export const SEGMENT = 0.09 * ARC_LENGTH;

/** The pip's three positions, as dash offsets. Negative moves it along the arc. */
export const PIP_FOOT = 0;
export const PIP_HEAD = -(ARC_LENGTH - SEGMENT);
/** Twelve o'clock: the rest frame, the reduced-motion frame and the frozen frame. */
export const PIP_CENTRE = PIP_HEAD / 2;

/** One traverse, terminal to terminal — brief B5's "about 1.3s". */
export const TRAVERSE_MS = 1300;
/** The terminal's flash decays over 12% of the 2600ms round trip, as the web's does. */
export const FLASH_MS = 312;
/** Page-level waits hold invisible this long, so a hold that ends sooner never paints. */
export const ENTER_DELAY_MS = 350;
const ENTER_MS = 180;

/**
 * The window onto the dial: the arc's bounding box — brief B2. x from 30 to
 * 170 (R=70 about x=100), y from the top of the arc at 30 to its feet at
 * 149.5. Web's `ARC_BOX`, so a 128pt box is a 128pt ring.
 */
const ARC_X = 30;
const ARC_Y = 30;
const ARC_W = 140;
const ARC_H = 120;

/** The three sizes — brief B2: 128 full on a phone, 20 compact, 14 mark. */
export const FULL_SIZE = 128;
export const COMPACT_SIZE = 20;
export const MARK_SIZE = 14;

type Face = 'full' | 'compact' | 'mark';

/**
 * Pixel widths per face. Full and compact keep the terminals (brief B1); the
 * mark does not — at 14pt two dots on a 5pt-radius arc read as a face, and
 * the mark only has to say "this control is working". The compact dot is 3pt
 * rather than the brief's 4: measured on the web at 20px and recorded in
 * drift §14.2 as the size that reads as a dot rather than a bead.
 */
const FACES: Record<Face, { size: number; track: number; pip: number; dot: number }> = {
  full: { size: FULL_SIZE, track: 1, pip: 2, dot: 4 },
  compact: { size: COMPACT_SIZE, track: 1, pip: 2, dot: 3 },
  mark: { size: MARK_SIZE, track: 1, pip: 2, dot: 0 },
};

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/**
 * The three animated values one dial owns, and the loop that drives them.
 *
 * Returned as refs rather than state: a `setState` per frame for the length
 * of a model call would re-render the caller's whole subtree sixty times a
 * second for nothing. The values reach the SVG through `createAnimatedComponent`,
 * which is what react-native-svg's `setNativeProps` hack exists for.
 */
function useSweep(live: boolean) {
  const offset = useRef(new Animated.Value(PIP_CENTRE)).current;
  const footFlash = useRef(new Animated.Value(0)).current;
  const headFlash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!live) {
      offset.stopAnimation();
      footFlash.stopAnimation();
      headFlash.stopAnimation();
      offset.setValue(PIP_CENTRE);
      footFlash.setValue(0);
      headFlash.setValue(0);
      return;
    }

    /*
      One sequence, two legs. Each leg is the pip's traverse in parallel with
      the flash of the terminal it is *leaving* — the dot lights at the moment
      of arrival, which is the end of the previous leg, and decays as the pip
      pulls away. The web times the same thing with two 2600ms loops on one
      clock; here the flash is inside the traverse, so there is no second
      clock to drift.

      ⚠ `Easing.inOut(Easing.ease)`, not the house ease-out. The web measured
      why: a swing wants the same curve in both directions, and an ease-out
      played backwards snaps the pip into the foot.
    */
    const traverse = (to: number) =>
      Animated.timing(offset, {
        toValue: to,
        duration: TRAVERSE_MS,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      });
    const flash = (dot: Animated.Value) =>
      Animated.sequence([
        Animated.timing(dot, { toValue: 1, duration: 0, useNativeDriver: false }),
        Animated.timing(dot, {
          toValue: 0,
          duration: FLASH_MS,
          easing: Easing.linear,
          useNativeDriver: false,
        }),
      ]);

    offset.setValue(PIP_FOOT);
    const sweep = Animated.loop(
      Animated.sequence([
        Animated.parallel([traverse(PIP_HEAD), flash(footFlash)]),
        Animated.parallel([traverse(PIP_FOOT), flash(headFlash)]),
      ])
    );
    sweep.start();

    return () => {
      sweep.stop();
    };
  }, [live, offset, footFlash, headFlash]);

  return { offset, footFlash, headFlash };
}

/**
 * The dial itself. Track, pip, terminals — nothing that could be read as a
 * number. No needle: a needle points at a value, and there is none.
 */
function Dial({
  face,
  live,
  ink,
  size: sizeOverride,
}: {
  face: Face;
  live: boolean;
  /** The mark's ink — the control's own. Full and compact take the system's. */
  ink?: string;
  size?: number;
}) {
  const spec = FACES[face];
  const size = sizeOverride ?? spec.size;
  const unit = size / ARC_W;
  const { offset, footFlash, headFlash } = useSweep(live);

  /*
    The overflow the frame has to absorb: half the widest stroke, in points,
    rounded up so the padding is whole pixels on every scale.
  */
  const widest = Math.max(spec.pip, spec.dot);
  const padPx = Math.ceil(widest / 2);
  const pad = padPx / unit;
  const height = size * (ARC_H / ARC_W);
  const viewBox = `${ARC_X - pad} ${ARC_Y - pad} ${ARC_W + 2 * pad} ${ARC_H + 2 * pad}`;

  const terminals = spec.dot > 0;
  const foot = pointAt(0, R);
  const head = pointAt(100, R);
  const pipInk = ink ?? register.accent;

  return (
    <View
      style={{ width: size, height }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
    >
      <Svg
        viewBox={viewBox}
        width={size + 2 * padPx}
        height={height + 2 * padPx}
        style={{ margin: -padPx }}
      >
        {/*
          The scale: a solid hairline, open at the bottom. Not dashed — the
          web's first draft borrowed the reading dial's "measured range, no
          measurement" face and the critique read the dots as stock spinner
          grammar. 0.22 of white, which is `text.nonText` at 0.55.
        */}
        <Path
          d={TRACK}
          fill="none"
          stroke={ink ?? text.nonText}
          strokeOpacity={ink ? 0.3 : 0.55}
          strokeWidth={spec.track / unit}
          strokeLinecap="butt"
        />

        {/*
          The pip. Round caps, the info blue, one pip on the scale at a time
          because the gap is the whole arc. `strokeDasharray` is constant by
          design; only `strokeDashoffset` moves — that is the whole design.
        */}
        <AnimatedPath
          d={TRACK}
          fill="none"
          stroke={pipInk}
          strokeWidth={spec.pip / unit}
          strokeLinecap="round"
          strokeDasharray={[SEGMENT, ARC_LENGTH]}
          strokeDashoffset={offset}
        />

        {terminals ? (
          <>
            {/*
              The two ends of the scale, filled — the reading dial's
              terminals, in the off-white good news is set in. Over each, the
              flash: the same dot in the lit step, at zero until the pip
              arrives.
            */}
            <Circle cx={foot.x} cy={foot.y} r={spec.dot / 2 / unit} fill={status.confirm} />
            <Circle cx={head.x} cy={head.y} r={spec.dot / 2 / unit} fill={status.confirm} />
            <AnimatedCircle
              cx={foot.x}
              cy={foot.y}
              r={spec.dot / 2 / unit}
              fill={register.accentStrong}
              opacity={footFlash}
            />
            <AnimatedCircle
              cx={head.x}
              cy={head.y}
              r={spec.dot / 2 / unit}
              fill={register.accentStrong}
              opacity={headFlash}
            />
          </>
        ) : null}
      </Svg>
    </View>
  );
}

/**
 * Page-level waits arrive late on purpose. Most first paints resolve in a few
 * hundred milliseconds, and a dial that flashes for one frame before the
 * content lands reads as a glitch rather than as patience. So the instrument
 * holds at opacity 0 for 350ms and only then fades in; a hold that ends
 * sooner never paints it. Opt-in per call site — a wait somebody just started
 * by pressing a button wants its feedback at once.
 *
 * ⚠ Reduced motion keeps the delay and drops the fade: the point of the delay
 * is not motion, it is not painting a dial for a hold that ends first.
 * `frozen` paints at once — the specimen has nothing to wait for.
 */
function useEnter(delay: boolean, reduced: boolean): Animated.Value {
  const opacity = useRef(new Animated.Value(delay ? 0 : 1)).current;

  useEffect(() => {
    if (!delay) {
      opacity.setValue(1);
      return;
    }
    const enter = Animated.sequence([
      Animated.delay(ENTER_DELAY_MS),
      Animated.timing(opacity, {
        toValue: 1,
        duration: reduced ? 0 : ENTER_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    enter.start();
    return () => {
      enter.stop();
    };
  }, [delay, reduced, opacity]);

  return opacity;
}

/**
 * A stage's glyph, at the row's right edge: 8pt, drawn as a circle rather
 * than a rounded `View` because B4 zeroed every radius in the theme and a
 * dot is not a container corner — it is the same glyph as the dial's
 * terminals, at the ledger's scale.
 */
const STAGE_MARK = 8;

function StageMark({ state }: { state: WorkingStage['state'] }) {
  const ring =
    state === 'done' ? text.primary : state === 'active' ? register.accent : border.fieldHover;
  return (
    <Svg width={STAGE_MARK} height={STAGE_MARK} style={styles.stageMark}>
      <Circle
        cx={STAGE_MARK / 2}
        cy={STAGE_MARK / 2}
        r={STAGE_MARK / 2 - 0.5}
        stroke={ring}
        strokeWidth={1}
        fill={state === 'done' ? text.primary : 'none'}
      />
    </Svg>
  );
}

/**
 * The ledger: real stages on hairline rules — brief B4. Number and label
 * left, glyph at the right edge. Done is a filled off-white dot with off-white
 * ink (good news carries no hue); active is a cyan ring and cyan ink; pending
 * is a grey ring and grey ink. The glyphs are static: one moving thing per
 * panel, and the pip is it.
 */
function Ledger({ stages, footer }: { stages: WorkingStage[]; footer?: ReactNode }) {
  return (
    <View style={styles.ledger}>
      {stages.map((stage, index) => {
        const ink =
          stage.state === 'active'
            ? styles.inkActive
            : stage.state === 'done'
              ? styles.inkDone
              : styles.inkPending;
        return (
          <View
            key={stage.label}
            style={styles.stage}
            /*
              The state is spoken as well as drawn — a screen reader gets
              "done" or "in progress" after the label rather than a dot.
            */
            accessible
            accessibilityLabel={`${stage.label} — ${
              stage.state === 'done'
                ? 'done'
                : stage.state === 'active'
                  ? 'in progress'
                  : 'not started'
            }`}
          >
            <Text style={[styles.stageIndex, ink]}>{String(index + 1).padStart(2, '0')}</Text>
            <Text style={[styles.stageLabel, ink]} numberOfLines={1}>
              {stage.label}
            </Text>
            <StageMark state={stage.state} />
          </View>
        );
      })}
      {footer ? <Text style={styles.footer}>{footer}</Text> : null}
    </View>
  );
}

export default function Working({
  line,
  detail,
  value,
  stages,
  variant = 'full',
  frozen = false,
  delay = false,
  rule = true,
  children,
  style,
}: {
  /** What is happening, present tense. Rendered in mono caps. */
  line: string;
  /** The facts this wait was handed, and what the answer will contain. One sentence. */
  detail?: string;
  /**
   * A bare value the wait was handed — a file name — set in the mono a value
   * takes on this platform (brief B1), where `detail` is a sentence in the
   * body sans. The critic's round-29 gap 2 read a file name in Inter as a
   * slip, and it was: the web's one grey sentence carries its file names,
   * but the phone's brief gives every value to the mono.
   */
  value?: string;
  /** Real stages, in order. Omit when the work is one opaque call. */
  stages?: WorkingStage[];
  variant?: 'full' | 'compact';
  /** Hold the sweep on its twelve-o'clock frame. Specimen and screenshots only. */
  frozen?: boolean;
  /**
   * Fade in after 350ms rather than at once, so a hold that resolves sooner
   * never paints a dial. For page loads; not for a wait somebody just started.
   */
  delay?: boolean;
  /**
   * The full face's hairline rule above the cluster — the band's edge (B5). A
   * caller whose page already rules the slot turns it off.
   */
  rule?: boolean;
  /** Anything else true about the wait — a real count. The ledger's footer. */
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const live = !frozen && !reduced;
  const opacity = useEnter(delay && !frozen, reduced);

  /*
    Announced once, as one thing: the line and the sentence. The SVG is hidden
    from assistive technology, and the ledger's rows speak for themselves.
  */
  const announced = [line, value, detail].filter(Boolean).join('. ');

  if (variant === 'compact') {
    return (
      <Animated.View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={announced}
        accessibilityLiveRegion="polite"
        style={[styles.compact, { opacity }, style]}
      >
        <Dial face="compact" live={live} />
        <View style={styles.compactText}>
          <Text style={styles.compactLine} numberOfLines={2}>
            {line}
          </Text>
          {value ? <Text style={styles.compactValue} numberOfLines={1}>{value}</Text> : null}
          {detail ? <Text style={styles.compactDetail}>{detail}</Text> : null}
        </View>
      </Animated.View>
    );
  }

  return (
    <Animated.View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={announced}
      accessibilityLiveRegion="polite"
      style={[styles.full, rule && styles.ruled, { opacity }, style]}
    >
      <Dial face="full" live={live} />
      <View style={styles.fullText}>
        <Text style={styles.fullLine}>{line}</Text>
        {value ? <Text style={styles.fullValue} numberOfLines={1}>{value}</Text> : null}
        {detail ? <Text style={styles.fullDetail}>{detail}</Text> : null}
      </View>
      {stages && stages.length > 0 ? (
        <Ledger stages={stages} footer={children} />
      ) : children ? (
        <Text style={styles.footer}>{children}</Text>
      ) : null}
    </Animated.View>
  );
}

/**
 * The sweep at control scale, in the control's own ink.
 *
 * Rendered by `Button`'s busy form (brief B7) beside its mono status, and bare
 * by icon-only controls whose accessible name carries the state. No
 * terminals, no bloom: it only has to say "this control is working", which
 * the moving pip does alone. Hidden from assistive technology — the control
 * is the announcement.
 */
export function WorkingMark({
  ink = register.accentStrong,
  size = MARK_SIZE,
  frozen = false,
  delay = false,
  style,
}: {
  ink?: string;
  size?: number;
  frozen?: boolean;
  /**
   * The page-load hold, for the one bare mark that is not in a control: the
   * app's root gate in `App.tsx`, which waits on the Keychain and the fonts
   * and so cannot set a line in the mono it is waiting for.
   */
  delay?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const reduced = useReducedMotion();
  const opacity = useEnter(delay && !frozen, reduced);
  return (
    <Animated.View style={[{ opacity }, style]}>
      <Dial face="mark" live={!frozen && !reduced} ink={ink} size={size} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  /*
    ── The full face is a band, left-anchored — brief B3 under the phone's B5 ─

    Arc, then the status, then one sentence, then the ledger, on one left
    edge: the web brief's own phone composition ("mobile stacks arc over text
    on the same left edge"). 24pt above and below — the web's phone padding,
    drift §14.3 — and no horizontal inset, because a band spans its container
    and the page sets the gutter once (`Card` makes the same argument).
  */
  full: {
    paddingTop: space.xxl,
    paddingBottom: space.xxl,
    gap: space.xl,
  },
  ruled: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  fullText: { gap: space.sm },
  /*
    The status: 14pt mono caps at 0.08em — the web brief's line for the full
    face. Off the phone's mono ramp on purpose (12 labels a value, 13 is the
    nav), because at 128pt the arc wants a line with a little more weight
    beside it than a value label carries, and the web set the same number.
  */
  /*
    Face and weight on one line, because `mobile-font-faces.test.ts` scans line
    by line and a weight whose face sits on the line above reads to it as the
    naked weight that renders San Francisco — `ClusterGauge` records the same.
  */
  fullLine: {
    fontFamily: monoFace('500'), fontWeight: '500',
    fontSize: 14,
    lineHeight: 20,
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    color: text.primary,
  },
  fullDetail: { ...type.value, color: text.muted },
  /* A value is mono on this platform — B1 — and quiet, like the sentence. */
  fullValue: { ...type.mono, color: text.muted },

  /* The compact face: the dial at 20pt beside the line, no rule of its own. */
  compact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  compactText: { flexShrink: 1, gap: 2 },
  compactLine: { ...type.monoLabel, color: text.primary },
  compactDetail: { ...type.value, color: text.muted },
  compactValue: { ...type.mono, color: text.muted },

  /*
    The ledger — brief B4. A rule above the first row and under every row;
    the last row's rule closes the table the way `BandRow` closes its list.
  */
  ledger: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  stage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: border.panel,
  },
  stageIndex: { ...type.mono, ...TABULAR },
  stageLabel: { ...type.monoLabel, flexShrink: 1 },
  /* Done: filled off-white. Active: a cyan ring. Pending: a grey ring. */
  stageMark: { marginLeft: 'auto' },
  inkDone: { color: text.primary },
  inkActive: { color: register.accent },
  inkPending: { color: text.muted },
  /* A real count, in off-white, under the rows. */
  footer: { ...type.monoLabel, color: text.primary, paddingTop: space.md },
});
