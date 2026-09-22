import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { brand, grade, status, surface } from '../theme';

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
 *   2. **Highlight pull** (21 Sep) — a warm mid-grey `multiply` over the whole
 *      frame. Multiply scales every pixel by the layer, so it takes most from
 *      the brightest: a white sky comes down to dusk while a mid-grey car
 *      keeps three-quarters of its light. Round 47's critic, on the daylight
 *      photograph the loop had never graded: *"the sky blows to a milky haze
 *      under CHANGE PHOTO, the grass stays green, and the nav controls sit on
 *      near-white."* Without this the layers below tint a daylight shot
 *      without ever making it evening.
 *   3. **Split tone** — sodium into cyan, left to right, as `soft-light`.
 *      A real split tone divides by luminance; this divides by position, which
 *      is what the direction's *scene* does anyway (sodium streetlight on one
 *      side, cold gel on the other) and what the house plate is composed to.
 *   4. **Vignette** — a `multiply` toward the corners, so the car stays and the
 *      edges fall off into the page.
 *   5. **Nav scrim** (21 Sep) — the page's graphite falling from the top edge
 *      to nothing by two-fifths of the frame, plain alpha, no blend. The nav
 *      row's controls have no plate of their own by design (`BackControl`:
 *      *"a backgroundColor at rest would put a plate under the chevron on the
 *      photograph"*), so the photograph has to be dark where they stand. The
 *      generated plates are composed that way; an owner's sky is not.
 *   6. **Grain** — the plate's own grain tile, `overlay`, tiled. Mid-grey, so it
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
 */
export default function PhotoGrade() {
  return (
    <>
      <View style={[StyleSheet.absoluteFill, styles.lift]} {...INERT} />
      <View style={[StyleSheet.absoluteFill, styles.pull]} {...INERT} testID="grade-pull" />

      <View style={[StyleSheet.absoluteFill, styles.splitTone]} {...INERT}>
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

      <View style={StyleSheet.absoluteFill} {...INERT} testID="grade-scrim">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="houseScrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={surface.page} stopOpacity={0.78} />
              <Stop offset="0.4" stopColor={surface.page} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#houseScrim)" />
        </Svg>
      </View>

      <Image
        source={require('../../assets/grain.png')}
        style={[StyleSheet.absoluteFill, styles.grain]}
        resizeMode="repeat"
        {...INERT}
      />
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

const styles = StyleSheet.create({
  lift: { backgroundColor: grade.lift, mixBlendMode: 'screen' },
  pull: { backgroundColor: grade.pull, mixBlendMode: 'multiply', opacity: 0.55 },
  /* 0.65, from 0.55 (21 Sep): the shadows cool a step further under the pull. */
  splitTone: { mixBlendMode: 'soft-light', opacity: 0.65 },
  vignette: { mixBlendMode: 'multiply', opacity: 0.9 },
  grain: { mixBlendMode: 'overlay', opacity: 0.45 },
});
