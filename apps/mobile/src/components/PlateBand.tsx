import { useState } from 'react';
import { Image, StyleSheet, View, type ImageSourcePropType, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { cornerCovers } from './CutSurface';
import NightPlate from './NightPlate';
import { MASTHEADS, type MastheadKey } from './MastheadPlate';
import { cut, rhythm, surface } from '../theme';

/**
 * The night at the head of a screen that is not a root.
 *
 * ── ⚠ 22 Sep · the carrier was scoped to the roots, and the app is mostly
 * not roots ─────────────────────────────────────────────────────────────────
 *
 * On 11 Sep `MastheadPlate` gave Service, Plan and Advisor a plate, on David
 * looking at the phone and saying *"the tabs with images look dramatically
 * better right now … let's add images."* That file's own note states the rule
 * the change was made under, and it is the rule this component exists to
 * finish applying:
 *
 * > the film's look is *"carried by imagery and colour grade while the
 * > interface itself stays flat"*, and **a root with no imagery has nothing
 * > carrying it**.
 *
 * Eleven days later the same observation came back about the whole app, and
 * an audit said why: imagery reached **6 screens of 29**, and 14 screens used
 * no chromatic token at all. The interface being flat is correct and locked —
 * the brief's colour rule is *"two hues only, used as light rather than as
 * fill"*, with the hues living in the photograph. The defect was never the
 * palette. It was that the thing carrying the palette stopped at the tab
 * roots, so twenty-three screens ran the flat half of the direction with
 * nothing on top of it.
 *
 * ⚠ **The fix is coverage, not a third hue.** Between 3 and 5 Sep this
 * codebase deliberately removed a green, a red family and a duplicate amber
 * (`theme/index.ts` carries all three arguments, with the contrast defects
 * each one was hiding). Tinting a card or a chip to answer "it looks grey"
 * walks every one of those back and breaks B5 besides. Nothing here adds a
 * colour: it puts the existing frames on more screens.
 *
 * ── Why this is not `MastheadPlate` ─────────────────────────────────────────
 *
 * That plate is the **ground under a root's large title**, drawn inside
 * `RootScreen`'s animating band and faded out as the title collapses. A pushed
 * screen has no such band — it arrives under a native header that already
 * names it, and `ScreenTitle` deliberately draws nothing there, because two
 * names on one screen was a regression the 11 Sep critique called out on
 * Account by name.
 *
 * So this is the head of the **content** rather than the ground of a title,
 * and it follows from that:
 *
 *   - **It carries no type at all.** Nothing here can fail a contrast check,
 *     which is why it needs no equivalent of `mobile-masthead-plates.test.ts`
 *     measuring ink against shipped pixels. The header above names the screen.
 *   - **It cancels the page body's gutter and top inset**, so the frame runs
 *     edge to edge the way every other plate in this product does. B2 and B9
 *     both retire the letterbox; a plate inset by 16pt is a letterbox with
 *     extra steps.
 *   - **One 45° cut, bottom-right**, painted in the page colour above the
 *     image — the same corner and the same `cornerCovers` geometry as
 *     `MastheadPlate` and `TirePlate`, so `cut-geometry.test.tsx` holds its
 *     legs equal along with theirs.
 *
 * ── Which frame a screen gets ───────────────────────────────────────────────
 *
 * **A screen takes its stack's place.** Pushing deeper does not leave the
 * place you are in: Service History is still the workshop apron, the wishlist
 * is still the road ahead. That rule is what stops this becoming a per-screen
 * art brief, and it is why the prop is a stack key rather than a source.
 *
 * `house` is `NightPlate` — the street with no car in it — for screens in the
 * garage's stack, whose subject is one car rather than a place.
 *
 * ⚠ **Account is the one deviation and it is recorded rather than hidden.**
 * It is not a car screen and has no frame of its own, so it takes the house
 * plate. That is on-vocabulary (night, wet asphalt, sodium against cyan) and
 * much better than graphite, but a frame of its own is the right answer.
 *
 * ⚠ That last sentence used to end "and is an asset job, not a code one",
 * which was wrong for the same reason `NightPlate`'s citation was: the frames
 * are **generated**. `apps/mobile/scripts/build-mastheads.mjs` cuts the three
 * mastheads and carries their prompts verbatim, and
 * `render-night-plate.mjs` composes the house plate from documented numbers.
 * An Account frame is a run of a script that is already here, not a
 * commission.
 */
export type PlateBandFrame = MastheadKey | 'house';

/**
 * The band's height.
 *
 * Shorter than a root's title band, and deliberately: this one is a head, not
 * a ground, and a full-height plate under a native header reads as a hero the
 * screen then fails to live up to. 132 keeps the horizon and the reflections
 * in `night-plate.jpg`'s centred crop, and keeps the mastheads' lit third.
 */
export const PLATE_BAND_HEIGHT = 132;

export default function PlateBand({
  frame,
  top = rhythm.afterNav,
}: {
  frame: PlateBandFrame;
  /**
   * The top padding this band has to cancel to reach the screen's edge.
   *
   * ⚠ Passed rather than assumed, because the screens disagree. Most spread
   * `PAGE_BODY`, whose `paddingTop` is `rhythm.afterNav`; Health and the
   * invoice detail set `padding: space.lg` on all four sides instead, so a
   * band that cancelled 20 there would ride 4pt under the header. The gutter
   * needs no such prop — `PAGE_BODY.paddingHorizontal` and `space.lg` are both
   * 16, so one value cancels either.
   */
  top?: number;
}) {
  /*
    ⚠ **The band sets no `marginBottom`, and the first version did.**

    It carried `marginBottom: top` on the reasoning that the negative top
    margin cancels the container's padding, so the same value should put that
    air back underneath. That is wrong wherever the container also sets a flex
    `gap` — which is every screen that hosts one. Yoga adds `gap` *between*
    children on top of each child's own margins; a margin never absorbs it. So
    the air below the band came out at `top + gap`:

      Account         20 + 24 = 44   against 20 intended
      Health          16 + 12 = 28   against 16
      Invoice detail  16 + 12 = 28   against 16
      Vehicle profile 16 + 16 = 32   against 16

    Wrong on first paint, no interaction needed, and four different values
    where the point of `rhythm` is that screens agree — which is the exact
    defect class the theme's R56 note says that scale exists to prevent
    ("moving between two of them felt like moving between two products").

    The fix is to delete the number rather than correct it. The container's
    `gap` already owns the space between its children, and the band is one of
    them: it gets the screen's own card-to-card rhythm, like everything else
    in the list. A `gap`-aware margin would need the band to be told the
    container's gap as well as its padding, which is a second number to get
    wrong in the same place as the first.

    Found by a defect-hunting agent that read Yoga's own layout source and
    reproduced each screen's container in a real layout engine, after the
    suites and both typechecks had passed green over it.
  */
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  return (
    <View
      style={[styles.band, { marginTop: -top }]}
      onLayout={onLayout}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="plate-band"
    >
      {/*
        ⚠ `NightPlate` renders its own grade as a **sibling** of its image, so
        it must be dropped in as a component rather than have its source
        pulled out into the `Image` below. A blend mode composites against the
        group it is drawn into; lifting the source here and grading it
        separately is exactly the opaque-rectangle bug `PhotoGrade` documents.
      */}
      {frame === 'house' ? (
        <NightPlate />
      ) : (
        <Image source={MASTHEADS[frame] as ImageSourcePropType} style={styles.plate} resizeMode="cover" />
      )}

      {width > 0 ? (
        <Svg width={width} height={PLATE_BAND_HEIGHT} style={StyleSheet.absoluteFill}>
          {cornerCovers(width, PLATE_BAND_HEIGHT, cut.plate, ['bottomRight']).map((d) => (
            <Path key={d} d={d} fill={surface.page} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    ⚠ The negative gutter cancels the page body's `paddingHorizontal` so the
    frame reaches both edges. It is written as the negation of `rhythm.page`
    rather than as `-16`, so a change to the page gutter moves the plate with
    it instead of leaving a seam nobody looks for. The vertical pair is inline
    above, because it is the one value the screens disagree about.

    There is deliberately no `marginBottom` here — see the note in the
    component above for why, and why adding one back is a regression rather
    than a tidy-up.

    ⚠ `backgroundColor` is the raised step rather than the page, so the band
    is a surface for the instant before the image decodes. On the page colour
    a cold launch shows the plate arriving as a flash.
  */
  band: {
    height: PLATE_BAND_HEIGHT,
    marginHorizontal: -rhythm.page,
    overflow: 'hidden',
    backgroundColor: surface.raised,
  },
  plate: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
});
