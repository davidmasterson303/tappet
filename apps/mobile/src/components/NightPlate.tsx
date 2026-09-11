import { Image, StyleSheet, type StyleProp, type ImageStyle } from 'react-native';

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
 * lit and the bay is empty. `scripts/render-night-plate.mjs` draws it and says
 * how; it is a committed JPEG rather than a runtime drawing because the grain,
 * the broken reflections and the bokeh are not things `react-native-svg` can
 * paint, and 1.7 million pixels is not a thing to draw on every mount.
 *
 * ⚠ `cover`, never `contain`. B2 and B9 both retire the letterbox; the image
 * is composed tall enough that the vehicle hero keeps the whole scene and the
 * garage's shorter band keeps the horizon and the reflections.
 *
 * Decorative: it names nothing the screen does not already say, so it is
 * hidden from assistive technology rather than announced as "image".
 */
export default function NightPlate({ style }: { style?: StyleProp<ImageStyle> }) {
  return (
    <Image
      source={require('../../assets/night-plate.jpg')}
      style={[StyleSheet.absoluteFill, styles.plate, style]}
      resizeMode="cover"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

const styles = StyleSheet.create({
  plate: { width: '100%', height: '100%' },
});
