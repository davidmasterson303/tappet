import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { brand, grade, status } from '../theme';

/**
 * The house grade, laid over an owner's photograph.
 *
 * ── ⚠ 11 Sep · B9: "owner photos are graded" ────────────────────────────────
 *
 * The studio paragraph: *"Owner photos pass through the house grade (lifted
 * blacks, sodium/cyan split tone, grain) and crop to the plate — never
 * letterboxed."* A daylight snapshot of a car dropped straight into the plate
 * is a hole in the film: every other surface is night, and the photograph is
 * the one thing the owner supplies, so it is the one thing most likely to
 * break the grade.
 *
 * There is no image pipeline on the phone and no native module for one, so the
 * grade is *composited* rather than computed: four layers over the image, each
 * with a blend mode, which React Native's new architecture draws natively.
 *
 *   1. **Lifted blacks** — a near-black `screen`. Screen with a dark colour
 *      raises the shadows a few percent and leaves the highlights alone, which
 *      is what a lifted-black curve does.
 *   2. **Split tone** — sodium into cyan, left to right, as `soft-light`.
 *      A real split tone divides by luminance; this divides by position, which
 *      is what the direction's *scene* does anyway (sodium streetlight on one
 *      side, cold gel on the other) and what the house plate is composed to.
 *   3. **Vignette** — a `multiply` toward the corners, so the car stays and the
 *      edges fall off into the page.
 *   4. **Grain** — the plate's own grain tile, `overlay`, tiled. Mid-grey, so it
 *      changes the texture and not the tone.
 *
 * ⚠ Order matters and is the order above: grain last so it sits on the grade
 * the way film grain sits on a print, not under it.
 *
 * ⚠ **Opacities are low on purpose.** The grade must read as a treatment of the
 * owner's photograph, not as a replacement for it — an owner who cannot find
 * their own car under the tint has been given a poster, and the direction is
 * explicit that this is an instrument.
 *
 * Decorative and non-interactive throughout: `pointerEvents="none"` and hidden
 * from assistive technology, so the image beneath keeps its own label. Rendered
 * as siblings of the photograph rather than in a wrapper — see `INERT`.
 *
 * ── ⚠ 22 Sep · `plate`: the split tone alone, and why that is not the 13 Sep
 * decision coming back ──────────────────────────────────────────────────────
 *
 * On 13 Sep the hub loop stopped the house plate passing through this grade,
 * because *"a plate is already the film; grading it again lifts its blacks
 * twice."* That objection is about the **lift** layer and it is still correct —
 * it is not an argument about the split tone, and the fix removed all four
 * layers because they were one component.
 *
 * It cost more than it looked. `night-plate.jpg` is the most-shown image in
 * the product — every car with no photograph, on the garage, the vehicle hero
 * and the tire plate — and it is the least chromatic frame in the set. Decoded
 * and measured (22 Sep, `house-plate-chroma.test.ts`):
 *
 *   masthead-plan     0.624 mean saturation, luma 32
 *   masthead-service  0.540                  luma 34
 *   masthead-advisor  0.368                  luma 46
 *   night-plate       0.268                  luma 53   ← the default
 *
 * ⚠ The tall frame is not the explanation, which was the first thing checked:
 * every 351-row band of the plate measures 0.256–0.277, so it is flat all the
 * way down rather than averaging a lit top against a dark floor.
 *
 * So `plate` runs **the split tone and nothing else** — no lift, no vignette,
 * no second grain over a frame that has its own. At 0.40 on `soft-light` the
 * plate measures 0.428, inside the band the three committed mastheads occupy,
 * while its luminance moves 53 → 57. That four-point shift is the whole point:
 * the hue axis arrives and the blacks stay where they are, which is what the
 * 13 Sep note asked for and could not express while the layers were welded
 * together.
 *
 * The strength was simulated against the shipped pixels rather than chosen —
 * W3C soft-light over the real gradient, sampled at nine opacities — and the
 * suite re-measures it, so a re-cut frame cannot quietly leave the band.
 */
export type PhotoGradeVariant =
  /** An owner's own photograph: the full house grade, all four layers. */
  | 'owner'
  /** A committed house frame, already graded: the split tone alone. */
  | 'plate';

export default function PhotoGrade({ variant = 'owner' }: { variant?: PhotoGradeVariant } = {}) {
  const plate = variant === 'plate';

  return (
    <>
      {plate ? null : <View style={[StyleSheet.absoluteFill, styles.lift]} {...INERT} />}

      <View
        style={[StyleSheet.absoluteFill, plate ? styles.splitTonePlate : styles.splitTone]}
        {...INERT}
      >
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="houseSplit" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={status.attention} />
              <Stop offset="0.5" stopColor={grade.splitMid} />
              <Stop offset="1" stopColor={brand.accent} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#houseSplit)" />
        </Svg>
      </View>

      {plate ? null : (
        <>
          <View style={[StyleSheet.absoluteFill, styles.vignette]} {...INERT}>
            <Svg width="100%" height="100%">
              <Defs>
                <RadialGradient id="houseVignette" cx="0.5" cy="0.5" r="0.7">
                  <Stop offset="0.45" stopColor={grade.vignetteClear} />
                  <Stop offset="1" stopColor={grade.vignetteEdge} />
                </RadialGradient>
              </Defs>
              <Rect x="0" y="0" width="100%" height="100%" fill="url(#houseVignette)" />
            </Svg>
          </View>

          <Image
            source={require('../../assets/grain.png')}
            style={[StyleSheet.absoluteFill, styles.grain]}
            resizeMode="repeat"
            {...INERT}
          />
        </>
      )}
    </>
  );
}

/**
 * ⚠ A fragment, not a wrapper view — and the reason is Core Animation. A blend
 * mode composites a layer against the group it is drawn into; four layers
 * inside a wrapper of their own blend with each other and then land on the
 * photograph as an ordinary opaque group, which turned the first version into
 * a near-black rectangle over the car. As direct siblings of the image they
 * blend with it.
 */
const INERT = {
  pointerEvents: 'none',
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;

/**
 * The split tone's strength over a committed house frame.
 *
 * ⚠ Exported so `house-plate-chroma.test.ts` simulates the value the app
 * actually renders rather than a copy of it. A literal in both places is how
 * a guard starts measuring a number nothing draws.
 */
export const PLATE_TONE_OPACITY = 0.4;

const styles = StyleSheet.create({
  lift: { backgroundColor: grade.lift, mixBlendMode: 'screen' },
  splitTone: { mixBlendMode: 'soft-light', opacity: 0.55 },
  /** The same layer over an already-graded frame — see the docblock. */
  splitTonePlate: { mixBlendMode: 'soft-light', opacity: PLATE_TONE_OPACITY },
  vignette: { mixBlendMode: 'multiply', opacity: 0.9 },
  grain: { mixBlendMode: 'overlay', opacity: 0.45 },
});
