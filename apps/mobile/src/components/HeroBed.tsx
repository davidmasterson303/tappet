import { StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import NightPlate from './NightPlate';

import { hero } from '../theme';

/**
 * What the vehicle hero's photograph sits under, and what stands in for it.
 *
 * ── Two layers, and they are not the same thing ─────────────────────────────
 *
 * **The dim** is the bay light going down as the floor comes up. It is a flat
 * `#08090B` whose opacity is driven by scroll, and the reading is deliberate —
 * `tokens/environment.css` makes the same argument for `--bay-led`: *the car
 * goes into shadow*, rather than a UI layer fading in over it. So it is not
 * chrome arriving; it is the room being switched off.
 *
 * **The bed** is fixed and never animates. It is the contrast floor the name
 * and mileage sit on, and its bottom stop is `rgb(8 9 11 / 0.82)` — which is
 * the value `contrast.test.tsx` should sample against rather than the
 * photograph, per §5 of the handoff. The two-stop pair at the top is what stops
 * the floating back and settings pills dissolving into a bright sky.
 *
 * ⚠ This is the mechanism that makes text over a photograph legal here at all.
 * `DiagnosticHero` on web established the rule that nothing is printed over a
 * photograph, after measuring ~1.7% passthrough through six compositing layers.
 * The rule was never "no type on photographs" — it was "no type whose contrast
 * depends on the photograph". A guaranteed floor is the other way to satisfy
 * it, and it is the way this design chose.
 *
 * ── ⚠ 23 Sep · the floor stopped reaching the type, and nothing said so ─────
 *
 * The stops used to be fixed fractions of the hero: 0.95 at the foot, 0.55 at
 * 22%, **zero at 52%**. That was measured against the identity block as it
 * stood, and then the block grew — the stat strip, the `THIS CAR` legend, and
 * on 22 Sep the switcher's `CAR 01 OF 03` eyebrow, which put the block's top
 * at about **48% of the hero**. The bed was delivering 0.08 there.
 *
 * Worst case, a car photographed against a bright sky, computed from these
 * stops:
 *
 * ```
 *   THIS CAR legend  bed 0.65   2.92:1
 *   MILEAGE label    bed 0.46   1.94:1
 *   the car's name   bed 0.25   1.61:1
 *   CAR 01 OF 03     bed 0.08   1.09:1     ← the largest type on the screen
 * ```                                        is the second worst line here
 *
 * Every string on the plate, under the floor, on any photograph brighter than
 * the fixture. It is CLAUDE.md §6's shape twice over: nothing errors, and the
 * night photograph every round was captured against made it look immaculate.
 * The screen's own style sheet said *"Legal here because of `HeroBed`'s
 * guaranteed floor"* while the floor guaranteed nothing where it was needed.
 *
 * So the bed is **driven by the block it exists for** rather than by a
 * fraction someone measured once. `coverTo` is where the type ends, and the
 * gradient holds `COVER_FLOOR` up to there before falling away. A block that
 * grows again moves the stop with it; that is the whole repair, and the
 * arithmetic is in `bedStops` where a test can reach it.
 *
 * ⚠ The span is **not** extended — it ends at `coverTo + FALLOFF`, about 58%,
 * against the old 52%. What changed is the shape inside it. The photograph
 * above the type is as untouched as it was; what darkens is the band the type
 * was already sitting on, which is mostly road.
 *
 * ── Why SVG and not `expo-linear-gradient` ──────────────────────────────────
 *
 * The handoff offers either. `react-native-svg` is already in the binary —
 * `BayRoom`, `ClusterGauge` and `Icon` all use it — and `expo-linear-gradient`
 * is a native module, so adopting it would cost an EAS build out of a monthly
 * allowance of about fifteen. Same picture, no build.
 */

/** The bed's darkest stop. Exported because the contrast harness samples it. */
export const HERO_BED_FLOOR = hero.shadow;
export const HERO_BED_FLOOR_ALPHA = 0.82;

/**
 * The alpha the bed must still be delivering where the type ends.
 *
 * ⚠ Derived, not chosen, and derived from the **dimmest ink on the plate**.
 * Over a white photograph, at the 12pt type floor, AA (4.5:1) arrives at:
 *
 * ```
 *   text.primary   #F5F3F0            0.583
 *   text.secondary white at 0.72      0.671   ← the plate's dimmest
 *   text.muted     white at 0.5       0.837
 * ```
 *
 * The 36pt name needs only 0.464 for its 3:1. **0.68** clears the secondary,
 * which is what the stat strip's ask takes on the photograph — the one rung
 * of the ink ladder that survives there, because a question must not read as
 * a fact (`StatStrip`). What this buys, stated plainly: every string on the
 * plate clears AA against **any** photograph an owner can supply.
 *
 * ⚠ Muted is deliberately **not** covered. 0.837 is a scrim heavy enough to
 * lose the car, and the photograph is the one place in this product an owner
 * sees their own. So nothing on the plate may take `text.muted`; lower an ink
 * there and this constant is wrong rather than merely tight.
 */
export const COVER_FLOOR = 0.68;

/** How far above the type the bed takes to reach nothing. A fraction of the hero. */
const FALLOFF = 0.1;

/**
 * Where the plateau begins, under the lowest string on the plate.
 *
 * ⚠ The bed **eases off below the type as well as above it**, and the reason
 * is a regression this file caused. Holding the floor all the way down to the
 * hero's foot took the last 40pt of photograph to luminance 9.3 against the
 * panel's 15.1 — the plate ended up *darker than the surface it sits on*, so
 * its bottom edge and the 45° cut that lives on that edge had nothing to read
 * against. Measured on the device, and a critic reading the frames called it
 * before the numbers did: *"the gradient has taken the photograph to the
 * panel's own black, so there is nothing to cut against."*
 *
 * Nothing is printed below this line — `THIS CAR` is the lowest string, about
 * 92pt up on the reference display — so the floor has no work to do there,
 * and the asphalt keeps its tone.
 */
const PLATEAU_FROM = 0.14;

/**
 * What the bed covers before the block has been measured.
 *
 * ⚠ It errs **long**, and that is the whole of its design. `coverTo` arrives
 * from the identity block's `onLayout`, and `CutSurface`'s own docblock
 * records a case on this very app where forty surfaces rendered and not one
 * layout event arrived. If that happens here the bed keeps this value, so
 * this value must be one that covers a real block: 0.5 clears the ~0.48 a
 * three-line plate reaches, where the 0.42 first written here did not.
 *
 * Under-covering is the silent failure — unreadable type on a bright
 * photograph, which looks perfect on every night fixture. Over-covering is a
 * slightly darker road. Those are not the same size of mistake.
 */
const DEFAULT_COVER = 0.5;

/**
 * The three stops, bottom-up, as fractions of the hero's height.
 *
 * Separated from the drawing so the contrast guard can ask what alpha the bed
 * delivers at a given height without rendering an SVG — `hero-bed.test.ts`
 * walks it against the identity block's measured extent.
 */
export function bedStops(coverTo: number = DEFAULT_COVER): Array<[number, number]> {
  /*
    ⚠ Clamped, because `coverTo` comes from a layout measurement. A block
    taller than the hero would otherwise push the falloff past 1 and produce a
    gradient with no zero stop — a bed over the whole photograph, arriving
    silently on whichever display made the block tall.

    ⚠ And never below `PLATEAU_FROM`: a `coverTo` under the plateau's own
    start would put the stops out of order, which `LinearGradient` does not
    reject — it draws something, and what it draws is not a floor.
  */
  const cover = Math.max(PLATEAU_FROM + 0.05, Math.min(0.75, coverTo));
  return [
    [0, HERO_BED_FLOOR_ALPHA],
    [PLATEAU_FROM, COVER_FLOOR],
    [cover, COVER_FLOOR],
    [Math.min(1, cover + FALLOFF), 0],
  ];
}

/**
 * The bed's alpha at `frac` of the hero's height, measured from its foot.
 *
 * ⚠ The floor the type stands on is `COVER_FLOOR`, not
 * `HERO_BED_FLOOR_ALPHA`. The near-opaque value at the very foot is there to
 * seat the plate against the panel, and no string is down there.
 */
export function bedAlphaAt(frac: number, coverTo?: number): number {
  const stops = bedStops(coverTo);
  if (frac <= 0) return stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    const [x0, a0] = stops[i - 1];
    const [x1, a1] = stops[i];
    if (frac <= x1) return a0 + ((a1 - a0) * (frac - x0)) / (x1 - x0);
  }
  return 0;
}

/**
 * The fixed contrast bed.
 *
 * Bottom-up: near-opaque at the floor, still `COVER_FLOOR` where the type
 * ends, gone a tenth of the hero above that — so it bites under the whole
 * identity block and leaves the car's middle alone. Plus a shorter wash from
 * the top for the nav pills.
 *
 * `coverTo` is the top of the type, as a fraction of the hero's height. The
 * screen knows it (`titleAnchor + identityHeight`); this component must not
 * guess it, which is what the fixed 52% was.
 */
export function HeroBed({ coverTo }: { coverTo?: number } = {}) {
  const stops = bedStops(coverTo);
  return (
    <Svg
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id="heroBedUp" x1="0" y1="1" x2="0" y2="0">
          {stops.map(([offset, opacity]) => (
            <Stop key={offset} offset={offset} stopColor={HERO_BED_FLOOR} stopOpacity={opacity} />
          ))}
        </LinearGradient>
        <LinearGradient id="heroBedDown" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={HERO_BED_FLOOR} stopOpacity={0.78} />
          <Stop offset="0.2" stopColor={HERO_BED_FLOOR} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroBedUp)" />
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroBedDown)" />
    </Svg>
  );
}

/**
 * What stands in for the photograph on the vehicle hero.
 *
 * ⚠ 11 Sep · the empty hero was a lit-room gradient — the same graphite radial
 * as the bay's — and the critique named the pair "a graphite gradient with
 * 'BMW' centred in it" as B2's whole gap. It is the house plate now, the same
 * night the garage bay stands in, so the car's two screens agree about where
 * the car is when there is no photograph of it. `NightPlate` carries the
 * argument.
 */
export function HeroEmpty() {
  return <NightPlate />;
}
