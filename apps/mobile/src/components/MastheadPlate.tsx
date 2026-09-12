import { useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { cornerCovers } from './CutSurface';
import { cut, surface } from '../theme';

/**
 * The night behind a root's name.
 *
 * ── ⚠ 11 Sep · every tab opens on the film, not only the two with a car ────
 *
 * Garage and Vehicle open on a plate — the owner's photograph through the
 * house grade, or the rendered night street — and the other three roots
 * opened on graphite. Looking at the phone, David: *"the tabs with images look
 * dramatically better right now … let's add images."* The direction agrees
 * with him: the film's look is *"carried by imagery and colour grade while the
 * interface itself stays flat"*, and a root with no imagery has nothing
 * carrying it.
 *
 * So the title band of Service, Plan and Advisor takes a plate. The screen's
 * name sits over its lower third in condensed caps, which is exactly where B2
 * puts the model name on the garage's plate — one grammar, two subjects. The
 * plate runs under the status bar the way the vehicle's does, carries one 8pt
 * 45° cut, and goes with the large title when the band collapses into the
 * mono nav title: the night is the *large* title's ground, and the collapsed
 * band is graphite like every native nav bar, including the one a pushed
 * Service arrives under.
 *
 * ── Three frames, one film ──────────────────────────────────────────────────
 *
 * Each root's plate is about that root, in the vocabulary the brief fixes —
 * night, wet asphalt, a sodium streetlamp against a cold cyan gel, anamorphic
 * grain — and none of them holds a car, a person, or a word:
 *
 *   - **Service** — the wet apron outside a closed workshop, a sodium work
 *     lamp over the roller shutter, a cyan street lamp beyond.
 *   - **Plan** — the road ahead: an empty wet road entering a concrete
 *     underpass, one sodium lamp on its wall, the exit a cold cyan haze. (It
 *     was an open road with lamps down both sides for one round; the critique
 *     read that as a colour split rather than a place, and it was.)
 *   - **Advisor** — the driver's seat of a parked car at night, the street's
 *     lights as soft bokeh through a rain-covered windscreen.
 *
 * `scripts/build-mastheads.mjs` says where the frames came from and how they
 * were cut and graded for the band, and is the record of what the JPEGs are.
 *
 * ── ⚠ Type over a photograph, and why this one is allowed ──────────────────
 *
 * `HeroBed`'s docblock holds the rule: not "no type on photographs" but *"no
 * type whose contrast depends on the photograph"*. The vehicle hero satisfies
 * it with a bed — an opaque floor under the name — because its photograph is
 * the owner's and unknown. This plate is **known**: a committed asset, cut and
 * graded here so its lower half falls to dark asphalt, and
 * `lib/__tests__/mobile-masthead-plates.test.ts` reads the shipped pixels
 * under the title and under ACCOUNT and measures the ink against them. A
 * brighter frame swapped in later fails the suite rather than the reader.
 * That is the same answer the plate's cut got in round 22 — measured, not
 * argued — and it is why there is no scrim here: a scrim would hide the edge
 * and the cut that B2 asks to see.
 *
 * ── The cut ─────────────────────────────────────────────────────────────────
 *
 * Bottom-right, not the garage plate's top-right: this plate's top edge *is*
 * the screen's, so its only corners on the page are the bottom two, and the
 * bottom-right is the corner every control in the system already cuts. It is
 * painted the way `CutSurface`'s `ground` paints the garage plate's — the page
 * colour laid back over the corner, above the image — and the shape is
 * `cornerCovers`', so `cut-geometry.test.tsx` already holds its legs equal.
 *
 * Decorative: it names nothing the band does not already say, so it is hidden
 * from assistive technology rather than announced as "image".
 */
export default function MastheadPlate({
  source,
  height,
}: {
  source: ImageSourcePropType;
  /**
   * The band's expanded height — where the cut corner is painted.
   *
   * Passed rather than measured, because the band's height *animates* as the
   * title collapses and a cover that followed it would re-lay out on every
   * frame of the ease. The cut belongs to the expanded plate; while the band
   * shrinks it is clipped away with the rest, and the plate is fading anyway.
   * Only the width is measured, and it changes only on rotation.
   */
  height: number;
}) {
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  return (
    <View
      style={StyleSheet.absoluteFill}
      onLayout={onLayout}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      /* For `RootScreen.test.tsx`, which delivers the layout by hand. */
      testID="masthead-plate"
    >
      <Image source={source} style={styles.plate} resizeMode="cover" />
      {width > 0 && height > 0 ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
          {cornerCovers(width, height, cut.plate, ['bottomRight']).map((d) => (
            <Path key={d} d={d} fill={surface.page} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/**
 * The three plates, keyed by the root that carries each.
 *
 * Keyed rather than passed as a source so a root names *which* plate it opens
 * on, and a guard can hold that the three image roots each open on their own
 * — `Service` on the advisor's windscreen would be a silent swap.
 */
export const MASTHEADS = {
  service: require('../../assets/masthead-service.jpg') as ImageSourcePropType,
  plan: require('../../assets/masthead-plan.jpg') as ImageSourcePropType,
  advisor: require('../../assets/masthead-advisor.jpg') as ImageSourcePropType,
} as const;

export type MastheadKey = keyof typeof MASTHEADS;

const styles = StyleSheet.create({
  plate: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
});
