import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

import Icon from './Icon';
import { space, surface, text, type } from '../theme';

/**
 * The way back: a hairline chevron and the previous screen's name in mono caps.
 *
 * ── ⚠ 12 Sep · B1 and B8: one back control, one implementation ─────────────
 *
 * The vehicle screen has drawn its own back control since the hero pullback —
 * "‹ GARAGE", a 16pt hairline chevron beside a `monoNav` label — because its
 * header is hidden and its nav floats over the photograph. Every screen pushed
 * *from* it used the native stack's default: UIKit's heavy chevron, and a
 * label the 6 Sep pass put in the mono face but could not put in caps, because
 * `headerBackTitleStyle` is handed to a native label that ignores
 * `textTransform`. So one push apart the chrome disagreed — a thin "‹ GARAGE"
 * under the car's mono-caps title on Vehicle, then "‹ BMW M235i" behind a
 * heavy system chevron on Health. The critique named it the moment the second
 * screen was in frame.
 *
 * This is the one control both draw. The navigator hands it to every pushed
 * screen through `screenOptions.headerLeft` (native-stack hides its own back
 * button when `headerLeft` is set and passes the previous screen's title as
 * `label`), and the vehicle screen's nav row renders the same component with
 * its own label. The chevron is the app's hairline `Icon`, the label is
 * `monoNav` — a JS `Text`, which does honour `textTransform`, so "BMW M235i"
 * lands as BMW M235I with no change to the string the route publishes.
 *
 * ── The target ──────────────────────────────────────────────────────────────
 *
 * Drawn at 36 because that is what reads as a control over a photograph
 * rather than as a bar; `hitSlop` grows the target to the 44pt floor around
 * the drawing (R25). Legal because a back control stands alone at the left
 * end of its row, so the slop cannot overlap anything.
 */
export default function BackControl({
  label,
  onPress,
  accessibilityLabel,
  style,
}: {
  /** The previous screen's name. Uppercased by the face, never by the caller. */
  label: string;
  onPress: () => void;
  /** Spoken name; defaults to "Back to <label>". */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `Back to ${label}`}
      hitSlop={{ top: 4, bottom: 4, left: 8, right: 8 }}
      style={({ pressed }) => [styles.control, pressed && styles.pressed, style]}
    >
      <Icon name="chevron-left" size={16} color={text.primary} />
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /*
    ⚠ Geometry only — no fill, no radius. A `backgroundColor` at rest would put
    a plate under the chevron on the photograph; the pressed fill is the
    system's fill swap, never a group opacity (see `Button`).
  */
  control: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    minHeight: 36,
    paddingLeft: space.sm,
    paddingRight: space.md,
  },
  pressed: { backgroundColor: surface.raised },
  /*
    ⚠ B7: never the accent. A back label drawn in cyan made the most-pressed
    control on the screen the same colour as the system's information signal.
  */
  label: { ...type.monoNav, color: text.primary },
});
