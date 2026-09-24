import { StyleSheet, View } from 'react-native';
import Text, { typeScale } from './Text';
import Icon from './Icon';

import { TABULAR, border, space, text, type } from '../theme';

/**
 * The mono stat strip that sits beneath the plate.
 *
 * ── ⚠ Why this is a component and not a joined string ───────────────────────
 *
 * Both callers used to build one: `[mileage, trim, status].join(' · ')`, handed
 * down as a `subtitle`. That produced "66,000 mi · xDrive · Daily Driver" —
 * three *values* set as a sentence, in the body sans, with a middot doing the
 * work of a rule.
 *
 * The brief asks for the web dossier's strip: **a mono eyebrow over its value,
 * in hairline-separated cells.** A joined string cannot express that, because
 * by the time it reaches the view the labels are gone and the separators are
 * punctuation. Hence cells in, strip out.
 *
 * ⚠ **The two screens disagreed on order** — Garage read trim/status/mileage and
 * Vehicle read mileage/trim/status, from two independent `join` calls that
 * nobody had reason to compare. The critique caught it as "ordered differently
 * on Garage and Vehicle". One component is how that stops recurring: the order
 * is the array's, and the array is built in one place per screen against the
 * same contract.
 *
 * ── The empty cell is dropped, not blanked ──────────────────────────────────
 *
 * A cell with no value is removed by the caller rather than rendered with a
 * dash. `advice-range.ts` carries the product's position: a missing value is
 * "we cannot say", and an em-dash under MILEAGE reads as a reading of nothing
 * rather than as an absence.
 */
export type Stat = {
  /** The mono eyebrow — a noun, not a sentence. Rendered in caps. */
  label: string;
  /** The value beneath it. Already formatted; this component does not format. */
  value: string;
  /**
   * A line under the value in the eyebrow's ink — the value's provenance
   * (22 Sep: "4 wk ago" under an odometer, the age of the reading). Short: a
   * cell is a third of the strip.
   */
  note?: string;
  /**
   * The note wears the door's mark — a hairline chevron — where the cell is
   * one (22 Sep: the plate opens the car's details, and the odometer is the
   * fact that goes stale monthly; UX U6). The press is the caller's.
   */
  door?: boolean;
  /**
   * The value in the absent ink — an ask standing where a fact would (22 Sep:
   * "Tell us" under USE while the owner has not said how they use the car).
   * The cell is not dropped, because this is not a reading we lack; it is a
   * question the page has, and dropping it hid the question (IA's round-6
   * parking lot: *"the only empty on the page that does not invite"*).
   */
  muted?: boolean;
};

/**
 * ⚠ `onPhoto` puts every ink in this strip at `text.primary`.
 *
 * The strip's ladder — a muted label over a secondary value — is written for
 * a **flat ground**, where muted white measures 5.34:1 on the page. On the
 * car's plate the ground is the owner's photograph, and over a bright sky the
 * same label needs a bed alpha of 0.837 to clear AA where primary needs 0.583
 * (`HeroBed`'s `COVER_FLOOR`). The difference is a scrim that keeps the car
 * and one that loses it, so on the photograph the ladder collapses to one
 * rung. Flat grounds keep the ladder; it is doing real work there.
 *
 * ⚠ **One rung survives, and a test insisted on it.** `stat.muted` is not a
 * contrast decision — it is the ask standing where a fact would ("Tell us"
 * under USE), and `VehicleDetailScreen.test.tsx` pins its ink because David
 * ruled that question into the strip on 22 Sep. Collapsing it to primary made
 * a question look like an answer, which is a worse defect than the one this
 * prop exists to fix. On the photograph the ask takes `text.secondary`: still
 * a step below the facts around it, and `COVER_FLOOR` is set at the alpha
 * **that ink** needs rather than the alpha primary needs.
 */
export default function StatStrip({ stats, onPhoto = false }: { stats: Stat[]; onPhoto?: boolean }) {
  if (stats.length === 0) return null;

  return (
    <View style={styles.strip}>
      {stats.map((stat, i) => (
        <View key={stat.label} style={[styles.cell, i > 0 && styles.celled]}>
          <Text style={[styles.label, onPhoto && styles.onPhoto]} numberOfLines={1}>
            {stat.label}
          </Text>
          {/* A value wraps rather than losing its end once the text is larger (21 Sep: "Daily Dri…"). */}
          <Text
            style={[
              styles.value,
              stat.muted && styles.valueMuted,
              onPhoto && (stat.muted ? styles.askOnPhoto : styles.onPhoto),
            ]}
            numberOfLines={typeScale() > 1 ? 2 : 1}
          >
            {stat.value}
          </Text>
          {stat.note ? (
            <View style={styles.noteRow}>
              <Text style={[styles.note, onPhoto && styles.onPhoto]} numberOfLines={1}>
                {stat.note}
              </Text>
              {/*
                The mark, and the only thing that separates a stale reading
                from a current one on this strip — so it is findable by a
                test. `Icon` is hidden from assistive tech by design (it
                never carries meaning alone), which is why a testID rather
                than a label.
              */}
              {stat.door ? (
                <View testID="stat-note-door">
                  <Icon name="chevron-right" size={12} color={onPhoto ? text.primary : text.muted} />
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    /*
      A rule above and below, so the strip reads as one band rather than as
      three labels floating under a photograph. B5's hairline band, applied to
      the header rather than to a card.
    */
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: border.panel,
    paddingVertical: space.sm,
  },
  cell: { flex: 1, paddingHorizontal: space.md, gap: 2 },
  /*
    ⚠ The separator is a left border on every cell *after* the first, not a
    right border on every cell but the last. Both draw the same two rules today;
    the difference shows when a cell is dropped for having no value — a trailing
    right border would leave a rule hanging at the strip's edge.
  */
  celled: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: border.panel },
  /*
    ⚠ 6 Sep · B1 and B2: mono, not Inter. This shipped as `type.label` — the sans
    eyebrow — and got graded as mono, which is the more useful half of the story:
    at 12pt caps with tracking the two faces are close enough that a reader can
    miss it, so the strip was passing B2's "mono stat strip" on a technicality.

    ⚠ An eyebrow over a value is **mono**, while a section's eyebrow is
    **condensed** (`SectionHeader`). They look alike and they are not the same
    thing: this one is half of a value pair — MILEAGE belongs to 66,000 mi the
    way an axis label belongs to its axis — and B1 gives values mono. A section
    eyebrow names what follows and takes the grotesk with the other heads.
  */
  label: { ...type.monoLabel, color: text.muted, textTransform: 'uppercase' },
  value: { ...type.mono, color: text.primary, ...TABULAR },
  valueMuted: { color: text.muted },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  /* The value's provenance: the eyebrow's face and ink, sentence case, under the value. */
  note: { ...type.monoLabel, color: text.muted, ...TABULAR, flexShrink: 1 },
  /* One rung, on the photograph — see the prop's note. Last in every array, so it wins. */
  onPhoto: { color: text.primary },
  /* Except the ask, which stays a step down so it still reads as a question. */
  askOnPhoto: { color: text.secondary },
});
