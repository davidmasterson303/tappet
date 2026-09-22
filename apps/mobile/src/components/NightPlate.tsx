import { Image, StyleSheet, type StyleProp, type ImageStyle } from 'react-native';

import PhotoGrade from './PhotoGrade';

/**
 * The house plate: the night a car stands in when its owner has not
 * photographed it.
 *
 * ── ⚠ 11 Sep · B2, the half that was a void ─────────────────────────────────
 *
 * Locked brief B2: *"Plate is a night, wet-asphalt, sodium/cyan image,
 * full-bleed with one 45° cut."* The direction says the film — night, wet
 * asphalt, sodium against cold cyan — is *"carried by imagery and colour
 * grade"*, and on every graded screen there was none: the no-photo plate was a
 * graphite gradient with the make's name centred on it in the sans. The
 * critique called that a wordmark doing an image's job, and the one AI tell
 * left on the phone. Fair. An instrument with no night behind it is a spec
 * sheet.
 *
 * This is the same image for every car and every screen, deliberately — the
 * bay is a *place*, and a room whose weather changed per make would read as a
 * lightbox. It contains no car, which is the honest empty state: the street is
 * lit and the bay is empty. `apps/mobile/scripts/render-night-plate.mjs`
 * draws it and says how; it is a committed JPEG rather than a runtime drawing
 * because the grain, the broken reflections and the bokeh are not things
 * `react-native-svg` can paint, and 1.7 million pixels is not a thing to draw
 * on every mount.
 *
 * ⚠ **The plate is rendered, not photographed, and that matters for anyone
 * trying to make it less flat.** The script composes it from numbers — horizon
 * at 42%, a sodium source upper-left with its bloom and reflection, a cyan
 * source off the right edge, bokeh along the horizon — so re-tuning it is an
 * edit, not a shoot. `lib/__tests__/house-plate-chroma.test.ts` holds a
 * saturation floor under the output, which is what stops a flatter re-render
 * landing silently.
 *
 * ⚠ **22 Sep: this citation was deleted as nonexistent and then restored.** A
 * pass that afternoon looked for the script at repo-root `scripts/` instead of
 * here, ran `git log --all --diff-filter=A` on that same wrong path, and
 * rewrote this paragraph to say the file had never been committed. It has been
 * here since 20 Sep (`a46d219`). The consequence was not only a wrong
 * docblock: the same pass told David the flat plate "needs a camera", when the
 * thing that renders it is in the tree and takes arguments.
 *
 * `MastheadPlate` carries the longer version of this note. The rule both
 * earned: a negative from one directory is not a negative from the
 * repository.
 *
 * ⚠ `cover`, never `contain`. B2 and B9 both retire the letterbox; the image
 * is composed tall enough that the vehicle hero keeps the whole scene and the
 * garage's shorter band keeps the horizon and the reflections.
 *
 * Decorative: it names nothing the screen does not already say, so it is
 * hidden from assistive technology rather than announced as "image".
 *
 * ── ⚠ 22 Sep · the plate takes the split tone ─────────────────────────
 *
 * This file is the app's most-shown image and was its least chromatic: 0.268
 * mean saturation against 0.368–0.624 for the three mastheads, flat in every
 * band rather than dark at one end. On a direction whose colour is *"carried
 * by imagery and colour grade while the interface itself stays flat"*, the
 * frame every car without a photograph falls back to was carrying the least
 * of it — and it is the frame an owner sees most.
 *
 * `PhotoGrade`'s `plate` variant is the split tone alone, which is the layer
 * that carries the sodium/cyan axis; its docblock holds why the other three
 * stay off and why that is not the 13 Sep double-lift coming back.
 *
 * ⚠ The grade layers must be **siblings** of the image, not children — a blend
 * mode composites against the group it is drawn into, so a wrapper turns the
 * grade into an opaque rectangle over the plate. `PhotoGrade`'s own note has
 * the case. That is why this returns a fragment, and why `style` still lands
 * on the `Image` alone.
 */
export default function NightPlate({ style }: { style?: StyleProp<ImageStyle> }) {
  return (
    <>
      <Image
        source={require('../../assets/night-plate.jpg')}
        style={[StyleSheet.absoluteFill, styles.plate, style]}
        resizeMode="cover"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
      <PhotoGrade variant="plate" />
    </>
  );
}

const styles = StyleSheet.create({
  plate: { width: '100%', height: '100%' },
});
