import { Pressable, StyleSheet, View } from 'react-native';
import Text from '../Text';

import Icon from '../Icon';
import CutSurface from '../CutSurface';
import { TARGET_MIN, border, cut, space, surface, text, type } from '../../theme';

/**
 * The switcher's affordance — a control in the nav row's trailing corner.
 *
 * ── ⚠ 22 Sep · what this replaces, and why a chevron was not enough ─────────
 *
 * The switcher shipped as a mark on the car's name: a `chevron-down` beside
 * the largest string on the page, on the argument that the name is already
 * the door and the mark costs no new element. David, from the device: *"i
 * love the concept and the car selector menu … but the carrot/chevron is
 * perhaps not obvious for all users. let's replace w/ a more obvious cta in
 * top right or top left."*
 *
 * He is right, and the frames say something sharper than "not obvious": the
 * mark was **contradicted by the legend 14pt under it**. The identity block
 * ends in `This car ›` — the page's own door idiom, a mono word and a
 * chevron — and on a multi-car account the press it labels opened the
 * *switcher*, not the car. So the one piece of copy that explained the
 * gesture named the wrong destination, and `detailsDoor`'s accessibility
 * label ("Opens the car's details: mileage, your answers, the photo,
 * removal") announced the wrong destination to a screen reader. That is not
 * a matter of emphasis; the name is the car's door again, and the set has a
 * control of its own.
 *
 * ── Why this corner, and why it is a surface rather than a word ────────────
 *
 * The nav row's trailing slot has been **reserved and empty** since ADD PHOTO
 * moved into the car's details on 22 Sep — 150pt held open for a control that
 * no longer existed. This takes it, which is also the corner David named.
 *
 * ⚠ It is a filled, hairlined surface rather than the row's other text
 * chrome, and the reason is measurable: at rest this row sits **on the
 * owner's photograph**, which since the 22 Sep deletion of `PhotoGrade` is
 * their image unaltered — no house grade, no scrim, no guaranteed ground. An
 * `outline` button paints no fill (`BUTTON_FILL`), so its label would have
 * been off-white type on an unknown sky. The opaque `surface.nav` makes the
 * ratio a fact rather than a hope — 17.3:1 — and `CutSurface` declares that
 * ground to the contrast audit through `auditSurface`, so the guard measures
 * what the eye sees.
 *
 * ⚠ **Drawn at 32pt, tapped at 44.** It was drawn at the full 44 — the nav
 * row's own height — and a critic reading the collapsed bar found what that
 * costs: *"the control is 44pt tall in a 44pt bar, so its outline's bottom
 * edge **is** the bar's rule and the cut reads as a notch in the rule, not
 * the corner of a button."* Two edges at the same y are one edge. The box is
 * inset 6pt top and bottom so the bar's rule runs under it and the cut is a
 * corner again; the `Pressable` keeps `TARGET_MIN`, so nothing moves for a
 * thumb.
 *
 * ⚠ The floor is on the **press target**, never on the drawn box — which is
 * the usual way a design system quietly stops meeting 44pt, by measuring the
 * thing it can see. `car-switch.test.tsx` asserts the target.
 *
 * ⚠ **Never drawn for one car.** The same rule as the eyebrow and the sheet:
 * a control onto a set of one is chrome that says there is somewhere else to
 * be when there is not (`BayRail`'s R20).
 */
/**
 * The box's drawn height, inside a 44pt target.
 *
 * 32 leaves 6pt of air top and bottom in the nav row, which is what keeps the
 * collapsed bar's rule from doubling as this control's bottom edge.
 */
const DRAWN_HEIGHT = 32;

export default function CarSwitch({ count, onPress }: { count: number; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      /*
        The count is spoken and not drawn. `CAR 01 OF 03` over the name
        carries it visually, and this control sits far from that line — but a
        screen reader arrives here with no such neighbour, so the label says
        how many cars there are and what the press does.
      */
      accessibilityLabel={`Your cars. ${count} cars. Switch which car this app is about.`}
      accessibilityHint="Opens the list of your cars"
      style={styles.target}
    >
      {({ pressed }) => (
        <CutSurface
          cut={['bottomRight']}
          size={cut.control}
          fill={pressed ? surface.raised : surface.nav}
          stroke={border.panel}
          style={styles.surface}
        >
          <View style={styles.row}>
            <Text style={styles.label}>Your cars</Text>
            <Icon name="chevron-down" size={14} color={text.primary} />
          </View>
        </CutSurface>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /** The floor lives here — the drawn box is smaller, deliberately. */
  target: { minHeight: TARGET_MIN, justifyContent: 'center' },
  surface: { height: DRAWN_HEIGHT, justifyContent: 'center', paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  /*
    12pt mono caps — the type floor, not under it. `monoLabel` is the token
    every action label in the app takes (`Button`'s `smallLabel` is the same
    one), at `text.primary` rather than the `text.secondary` a ghost takes:
    this is the only control on the hero and it is on a photograph.
  */
  label: { ...type.monoLabel, color: text.primary },
});
