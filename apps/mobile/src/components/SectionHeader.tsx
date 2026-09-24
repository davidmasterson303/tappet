import { StyleSheet, View } from 'react-native';
import Text from './Text';

import { space, text, type } from '../theme';

/**
 * The label that names a block.
 *
 * The cheapest fix for the thing that made this app read as a wall: a long
 * screen with no headers has no shape, so the eye has nothing to skip to and
 * every block looks equally important.
 *
 * ── A real heading, not styled text ─────────────────────────────────────────
 *
 * `accessibilityRole="header"` is what lets a screen-reader user jump between
 * sections by rotor. Without it a header is a paragraph that happens to be
 * uppercase, and the navigation it implies visually does not exist for anyone
 * not looking at it.
 *
 * ── Uppercasing is done here, once ──────────────────────────────────────────
 *
 * `type.label` carries the size and tracking but not the case, so the token
 * stays usable for sentence-case labels. Doing it at call sites is how half of
 * them end up shouting and half do not.
 */
export default function SectionHeader({ title, trailing }: { title: string; trailing?: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text accessibilityRole="header" style={styles.title}>
        {title.toUpperCase()}
      </Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    marginBottom: space.sm,
  },
  /*
    ⚠ 6 Sep · B1: condensed, not Inter. This was `type.label` — the sans eyebrow
    — and the critique named it in three consecutive rounds as "tracked grey
    sans, neither condensed nor mono". B1 gives section heads the condensed
    grotesk.

    ⚠ 21 Sep · `displayHead`, not `displayLabel`. The 12pt eyebrow was the
    condensed face all along, and five critiques read it as a proportional
    sans anyway — twice at native scale (rounds 46–49). The web's section
    head is 17px bold condensed; at that size the face registers. Same head
    on Health, Build and the hub, so the three never drift.
  */
  title: { ...type.displayHead, color: text.muted },
});
