import { useState } from 'react';
import { Image, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { cornerCovers } from './CutSurface';
import NightPlate from './NightPlate';
import PhotoGrade from './PhotoGrade';
import { cut, surface } from '../theme';

/**
 * The plate over the tire set — the vehicle's own, at one height.
 *
 * ── Whose photograph a tire set's plate carries ─────────────────────────────
 *
 * The **vehicle's**: the owner's photograph through the house grade, else the
 * car's generation plate, else the night street — exactly what the hub draws
 * over the same car, read off the same `photo_url` / `photo_kind` the vehicle
 * route already serves. `isOwnerPhoto` in `VehicleDetailScreen` carries the
 * rule for when the grade applies (only the owner's picture; a plate is
 * already the film, and grading it again lifts its blacks twice).
 *
 * ── 268pt, on every screen in this feature ──────────────────────────────────
 *
 * One element, one height. The graded round gave the plate the 120pt the cuts
 * recovered and made it a fixed panel rather than the remainder left after the
 * facts — a header whose height depends on how much data the body happens to
 * hold is a header that is a remainder, and the whole argument for the height
 * was that it is not one. `PLATE_HEIGHT` is the only place the figure lives.
 *
 * ⚠ The composition has never been graded with a real photograph: 36% of the
 * final fold was a flat stand-in, deliberately, because a faked plate would
 * have made the frame ungradeable. A sodium-raked owner photo and the 2pt
 * sodium warning below it are two orange things on one screen; the one-mark
 * rule governs the interface, not the image, and the plate may not be washed
 * out to rescue the warning or the warning tinted to match the plate.
 *
 * ── The cut ─────────────────────────────────────────────────────────────────
 *
 * Bottom-right, 8pt, painted the way `MastheadPlate` paints its own — the
 * page colour laid back over the corner above the image, with
 * `cornerCovers`' shape so `cut-geometry.test.tsx` already holds its legs
 * equal. The plate sits on the page and nothing else, which is the one case
 * the cover is honest for.
 *
 * Decorative: it names nothing the sheet beneath does not say, so it is
 * hidden from assistive technology rather than announced as "image".
 */
export const PLATE_HEIGHT = 268;

export default function TirePlate({
  photo,
  graded,
}: {
  /** Signed URL of the owner's photo or the generation plate, or null for the night street. */
  photo: string | null;
  /** Whether `photo` is the owner's, and so passes through the house grade. */
  graded: boolean;
}) {
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    if (next !== width) setWidth(next);
  };

  return (
    <View
      style={styles.plate}
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="tire-plate"
    >
      {photo ? (
        <>
          <Image source={{ uri: photo }} style={styles.image} resizeMode="cover" />
          {graded ? <PhotoGrade /> : null}
        </>
      ) : (
        <NightPlate />
      )}
      {width > 0 ? (
        <Svg width={width} height={PLATE_HEIGHT} style={StyleSheet.absoluteFill} pointerEvents="none">
          {cornerCovers(width, PLATE_HEIGHT, cut.plate, ['bottomRight']).map((d) => (
            <Path key={d} d={d} fill={surface.page} />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  plate: { height: PLATE_HEIGHT, width: '100%', overflow: 'hidden', backgroundColor: surface.raised },
  image: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
});
