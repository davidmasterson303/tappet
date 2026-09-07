import { StyleSheet, Text, View } from 'react-native';
import { getHealthBandJudgement } from '@wellkept/core/health-band';
import type { HealthDriver } from '@wellkept/core/health-drivers';

import { TABULAR, border, space, status, text, type } from '../theme';
import { monoFace } from '../theme/fonts';

/**
 * What the health score is made of — the three drivers.
 *
 * ── ⚠ These do not add up to the score, and this component must not imply it ─
 *
 * `health_score` comes from the model. These three are **computed** from facts
 * the database holds — `evaluateSchedule` over the car's own schedule, the
 * NHTSA recall list, and mileage against model-year age. So they explain the
 * *subject* without arithmetically explaining the *total*.
 *
 * That is why they are laid out as three peers with their own labels, and never
 * as terms in a sum. No plus signs, no "= 74", no ordering that suggests one
 * contributes more than another. `health-drivers.ts` carries the same warning
 * at the source; this is where it would actually be broken.
 *
 * Whether `health_score` eventually becomes a function of the three is a
 * product decision that has not been taken.
 *
 * ── Why each driver carries a sentence ──────────────────────────────────────
 *
 * Because the card exists to be tapped. A number with no account of itself is
 * the black box this product's whole argument is against — and it is the reason
 * the drivers are computed rather than generated, since a driver the model
 * invented could not be explained at all.
 */
/**
 * The bands that earn a sodium mark.
 *
 * ⚠ Named here rather than tested with `score < 60`, so the threshold stays
 * owned by `@wellkept/core/health-band`. A numeric comparison in this file
 * would be the phone holding a second opinion about where "Fair" ends.
 */
const WARNING_BANDS = new Set(['warn', 'bad']);

export default function HealthDrivers({ drivers }: { drivers: HealthDriver[] }) {
  if (drivers.length === 0) return null;

  return (
    <View style={styles.drivers}>
      {drivers.map((driver, index) => (
        <View key={driver.key} style={styles.driver}>
          <View style={styles.row}>
            {/*
              ⚠ B6: the 01-style index. It is not decoration — it is what makes
              three readings read as a *table* of contributors rather than three
              unrelated statements, and it is the same device the web dossier
              uses on its factor column.

              Padded to two digits deliberately: "1" and "01" set different
              column widths, so an unpadded index would make the labels beside
              them fail to line up the moment a car had ten drivers.
            */}
            <Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text>
            <Text style={styles.label}>{driver.label}</Text>
            {/*
              ⚠ Banded on the same ramp as the score, because a driver *is* a
              reading on that scale — 40 means the same thing here as it does on
              the dial. An unmeasured driver takes the muted ink instead, never
              a band: colouring a `null` would assert a condition nobody checked,
              which is the overclaim the garage card's "no score is not a zero"
              rule exists to prevent.
            */}
            {/*
              ── ⚠ 6 Sep · B6 and B7: the numeral stopped carrying the band ────

              This was banded on the health ramp at every value, so a contributor
              of 35 printed in sodium and a 100 printed in the `good` off-white —
              which meant the column had three different inks in it and the eye
              read the colour before the number.

              The brief is explicit: *"Sodium is a hairline triangle beside a
              genuine warning; 100s are off-white ink."* So the **warning moved
              out of the numeral and into a mark beside it**, and the numerals
              became one ink and one column.

              ⚠ The ramp is still consulted — `getHealthBandJudgement` decides
              whether the mark appears at all. What changed is that the phone no
              longer paints with the band, only asks it a question. An
              unmeasured driver still takes muted ink and gets no mark: marking a
              `null` would assert a condition nobody checked, which is the
              overclaim the garage card's "no score is not a zero" rule prevents.
            */}
            {driver.score !== null &&
              WARNING_BANDS.has(getHealthBandJudgement(driver.score).name) && (
                <Text style={styles.warningMark} accessibilityElementsHidden>
                  {/*
                    ⚠ `△` (U+25B3), the *outlined* triangle — not `▲` (U+25B2).
                    The brief says "a **hairline** triangle", and the filled
                    glyph was the only hue fill left on the sheet outside the
                    settled critical banner. One character apart, and the
                    difference is the whole of B7's "sodium as line, not fill".
                  */}
                  △
                </Text>
              )}
            <Text
              style={[styles.reading, driver.score === null && styles.unknown]}
            >
              {driver.score === null ? '—' : driver.score}
            </Text>
          </View>

          {/*
            Always present, including at `null`. A dash on its own reads as a
            bug; "Recalls have not been checked for this vehicle" reads as an
            honest gap, and it is the difference between the two that the
            sentence is carrying.
          */}
          <Text style={styles.detail}>{driver.detail}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  drivers: { gap: space.md },
  /**
   * Separated by a rule rather than by three nested cards.
   *
   * The card ladder has three steps and this is inside the second one; a third
   * box per driver would spend the whole ladder on one card and leave the
   * screen nowhere to go. A hairline is enough to group a label with its own
   * sentence.
   */
  driver: { gap: 2, paddingTop: space.md, borderTopWidth: 1, borderTopColor: border.panel },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: space.sm },
  /** B6: the index column. Fixed width so the labels beside it align. */
  /*
    ⚠ `text.muted`, not `text.nonText`. The index was written at `nonText` on the
    reading that a row number is furniture — and the contrast suite caught it at
    3.78:1 against a 4.5 floor. The theme says it outright: `nonText` is "a
    hairline token, never a word … if it is carrying language, it is wrong". An
    01 is language; it names which row you are on.
  */
  index: { ...type.monoLabel, color: text.muted, minWidth: 22 },
  /* B1: a factor's name is a section head in miniature — grotesk, not sans. */
  label: { ...type.displaySection, fontSize: 15, lineHeight: 20, color: text.primary, flex: 1 },
  /**
   * 20, tabular, mono. A reading, not a heading — it must not reflow as it
   * changes, and under B6 it is the right-aligned value of a spec table.
   */
  reading: {
    fontSize: 20,
    lineHeight: 24,
    /* ⚠ One line — the face carries the weight; see `mobile-font-faces`. */
    fontFamily: monoFace('500'), fontWeight: '500',
    color: text.primary,
    textAlign: 'right',
    ...TABULAR,
  },
  /** The sodium mark, which replaced the sodium numeral. A line, not a fill. */
  warningMark: { ...type.monoLabel, color: status.attention },
  unknown: { color: text.muted },
  /*
    ⚠ Sans, not mono. The critique caught this alongside the alert bodies as
    "mono doing prose" — B1 gives mono the values, dates, indices and states, and
    this line is a sentence explaining where a number came from. The *value* in
    the row above it stays mono; the explanation is prose and reads as prose.
  */
  detail: { ...type.body, color: text.muted, paddingLeft: 22 + space.sm },
});
