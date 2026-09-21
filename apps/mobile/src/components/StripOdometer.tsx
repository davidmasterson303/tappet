import { useState } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';

import {
  TIRE_COPY,
  formatMiles,
  pastCaption,
  sinceLabel,
  type TireAxis,
  type TireReading,
} from '@tappet/core/tires';
import ProvenanceMark, { DERIVED_DROP, MARK } from './ProvenanceMark';
import { TABULAR, space, status, text, type } from '../theme';

/**
 * The strip odometer — the tire set's own instrument.
 *
 * One numeral, two captions, one axis, one caption under it. The numeral is
 * the miles since the last rotation (or since the install, when there is
 * none); the axis runs from the install odometer to today, with every
 * rotation plotted as a tick carrying its provenance mark; and **the one
 * sodium mark on the screen** is a 2pt run from the missed due point to the
 * right terminal, captioned once, `PAST 5,400 MI`.
 *
 * ── ⚠ It is not a progress bar ──────────────────────────────────────────────
 *
 * It grows *from* a target toward the edge and has no maximum. The critic's
 * line was *"a warning that is also a measurement"*: the sodium's length **is**
 * the overrun, at the same scale as every other span on the line. Do not add
 * a track, a maximum, a percentage or a fill; the health dial is taken and
 * this system has no fills. And the sodium is a line, never ink — no word,
 * numeral or icon here is ever `status.attention`; the caption is off-white
 * ink under the rule, which is §0.3's grammar (the ink says what, the rule
 * says how urgently) with the rule above the ink.
 *
 * ── One scale, read off core ────────────────────────────────────────────────
 *
 * Nothing here computes a mile. `tireAxis` hands every event and the run as
 * **fractions** of one span, and this component multiplies each by the
 * measured width — the same multiplication for a tick, the due point and both
 * ends of the run. A third rotation puts a third tick on the line without a
 * style changing, and a changed interval moves the run and the caption
 * together, because they are one object. `StripOdometer.test.tsx` proves that
 * against the rendered geometry by mutation, the way the loop's ratchet
 * proved it against the HTML.
 *
 * ── Ticks and marks share one registration rule ─────────────────────────────
 *
 * Every event is one idiom: a 1.5pt tick crossing the line and a 6pt mark on
 * one float line above it, both centred on the event's own x. Half a tick and
 * three points of a terminal mark sit in the gutter, which is not a type
 * problem, and the axis has one rule with no exceptions in it (round 3, gap 6).
 * The install and the rotations carry their record's mark; today's reading is
 * the derived hairline — it is the odometer, not a record.
 *
 * ── Zero sodium without an interval ─────────────────────────────────────────
 *
 * `axis.run` is null when no interval was entered, whatever the mileage, and
 * the caption is bound to the same condition: a set with no interval has no
 * obligation, and a run there would be Tappet asserting a term nobody gave it.
 * The second caption (`YOUR INTERVAL`) goes with it; the absence is stated
 * once, in the rotations table, where the control that answers it sits.
 */

/** The line's own vertical geometry, in points, from the numeral block's foot. */
const FLOAT_TOP = 8;
const TICK_TOP = FLOAT_TOP + MARK + 4;
const TICK_HEIGHT = 16;
const AXIS_TOP = TICK_TOP + TICK_HEIGHT / 2;
const CAPTION_TOP = AXIS_TOP + 16;
const TICK_WIDTH = 1.5;

export default function StripOdometer({ reading, axis }: { reading: TireReading; axis: TireAxis | null }) {
  const [width, setWidth] = useState(0);

  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width * 100) / 100;
    if (next !== width) setWidth(next);
  };

  if (reading.since === null) return null;

  const label = sinceLabel(reading.sinceBasis);
  const spokenSince = `${reading.since.toLocaleString('en-US')} ${label?.toLowerCase() ?? 'miles'}`;
  const spokenInterval = reading.interval ? `, your interval ${formatMiles(reading.interval.miles).toLowerCase()}` : '';
  const spokenPast = axis?.run ? `, ${pastCaption(axis.run.miles).toLowerCase()}` : '';

  return (
    <View accessible accessibilityLabel={`${spokenSince}${spokenInterval}${spokenPast}`} testID="strip-odometer">
      <View style={styles.head}>
        <Text style={styles.numeral} testID="odometer-since">
          {reading.since.toLocaleString('en-US')}
        </Text>
        <View style={styles.captions}>
          {label ? <Text style={styles.caption}>{label}</Text> : null}
          {reading.interval ? (
            <Text style={styles.caption} testID="odometer-interval">
              {TIRE_COPY.yourInterval}{' '}
              <Text style={styles.captionValue}>{formatMiles(reading.interval.miles)}</Text>
            </Text>
          ) : null}
        </View>
      </View>

      {axis ? (
        <View style={styles.line} onLayout={onLayout} testID="odometer-axis">
          {width > 0 ? (
            <>
              <View style={styles.axis} />
              {axis.run ? (
                <View
                  style={[styles.run, { left: axis.run.from * width, width: (axis.run.to - axis.run.from) * width }]}
                  testID="odometer-run"
                />
              ) : null}
              {axis.events.map((event, i) => (
                <View key={`${event.kind}-${event.odometer}-${i}`} testID="odometer-event">
                  <View style={[styles.tick, { left: event.x * width - TICK_WIDTH / 2 }]} />
                  <ProvenanceMark
                    provenance={event.provenance}
                    style={[
                      styles.mark,
                      /*
                        The squares stand on the float line; the derived
                        hairline lies on it. `ProvenanceMark` drops a derived
                        mark 7pt below its slot's top, so the slot is raised
                        by that much to put the line where the squares' feet
                        are — one float line, every mark on it.
                      */
                      event.provenance === 'derived' && styles.markDerived,
                      { left: event.x * width - MARK / 2 },
                    ]}
                    testID={`odometer-mark-${event.kind}-${i}`}
                  />
                </View>
              ))}
              {axis.run ? (
                <Text style={styles.past} testID="odometer-past">
                  {pastCaption(axis.run.miles)}
                </Text>
              ) : null}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: space.md },
  numeral: { ...type.numeralPlate, ...TABULAR, color: text.primary },
  captions: { alignItems: 'flex-end', paddingTop: space.xs, gap: space.sm },
  caption: { ...type.monoLabel, color: text.muted, textAlign: 'right' },
  captionValue: { ...type.monoLabel, ...TABULAR, color: text.primary },
  /* The axis block: the float line, the ticks, the line and its one caption. */
  line: { height: CAPTION_TOP + type.mono.lineHeight, marginTop: space.sm },
  /* A drawn instrument line — the hairline token at 1pt, never a word. */
  axis: { position: 'absolute', left: 0, right: 0, top: AXIS_TOP, height: 1, backgroundColor: text.nonText },
  /* The one sodium mark: 2pt, a line and never ink, over the axis so its length reads at the line's own scale. */
  run: { position: 'absolute', top: AXIS_TOP - 0.5, height: 2, backgroundColor: status.attention },
  tick: { position: 'absolute', top: TICK_TOP, width: TICK_WIDTH, height: TICK_HEIGHT, backgroundColor: text.primary },
  mark: { position: 'absolute', top: FLOAT_TOP },
  markDerived: { top: FLOAT_TOP - DERIVED_DROP + MARK - 1 },
  past: { ...type.mono, ...TABULAR, color: text.primary, position: 'absolute', right: 0, top: CAPTION_TOP },
});
