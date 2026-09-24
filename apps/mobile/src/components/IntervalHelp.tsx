import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Text from './Text';
import Button from './Button';
import Icon from './Icon';
import { apiRequest } from '../api/client';
import { formatMiles, scheduledRotationInterval } from '@tappet/core/tires';
import { TARGET_MIN, border, space, text, type } from '../theme';

/**
 * Under the rotation-interval field: where the number comes from, and the
 * one figure Tappet may offer.
 *
 * ── The ask, and the line held (21 Sep) ────────────────────────────────────
 *
 * David, on the device: "I thought we were going to research the interval?
 * We're requiring the user to enter it?" The tire module's rule stands, and
 * this component is the answer to it rather than a way round it. The interval
 * that matters is the one the owner's *tire* warranty requires; makers'
 * figures genuinely run 3,500–8,000 miles and Michelin publishes three for
 * one warranty (`tires.ts`), so a researched number would be the invented
 * precision CLAUDE.md §10 forbids — feeding a push notification, which is the
 * worse place for it. What can honestly be done is both here:
 *
 *   1. **Say where to find it**, in a fold under the field — the card, the
 *      maker's site, and what the number means.
 *   2. **Offer the car's own schedule figure** where the dossier holds one
 *      (the Forester's says 6,000). The brief allows exactly this: "offer the
 *      vehicle manufacturer's interval as a default only where Tappet already
 *      holds it". It is offered, not assumed — one tap fills the field and
 *      the row carries `interval_source: 'vehicle'`, which draws the overrun
 *      and never the warranty sentence; the server checks the figure against
 *      the schedule before it believes the source.
 */

export function useVehicleRotationInterval(vehicleId: string): number | null {
  const [miles, setMiles] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void Promise.resolve()
      .then(() =>
        apiRequest<{ knowledge?: { maintenance_schedule?: unknown } | null }>(
          `/load-vehicle?vehicleId=${encodeURIComponent(vehicleId)}`
        )
      )
      .then((body) => {
        if (live) setMiles(scheduledRotationInterval(body?.knowledge?.maintenance_schedule));
      })
      .catch(() => {
        if (live) setMiles(null);
      });
    return () => {
      live = false;
    };
  }, [vehicleId]);
  return miles;
}

export default function IntervalHelp({
  vehicleInterval,
  value,
  onUse,
}: {
  /** The schedule's figure, or null when the car has none. */
  vehicleInterval: number | null;
  /** What is in the field now, so the offer is not made for a number already there. */
  value: string;
  onUse: (miles: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const offered = vehicleInterval !== null && value.trim() !== String(vehicleInterval);

  return (
    <View style={styles.wrap}>
      {offered ? (
        <View style={styles.offer} accessibilityRole="summary">
          <Text style={styles.offerText}>
            Your car's own schedule says every {vehicleInterval.toLocaleString('en-US')} miles. That is the car
            maker's figure for wear, not your tire warranty's.
          </Text>
          <Button
            label={`Use ${formatMiles(vehicleInterval)}`}
            variant="outline"
            size="small"
            onPress={() => onUse(vehicleInterval)}
            style={styles.useButton}
          />
        </View>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${open ? 'Hide' : 'Show'} where to find the interval`}
        onPress={() => setOpen((o) => !o)}
        style={styles.fold}
      >
        <Text style={styles.foldLabel}>WHERE TO FIND IT</Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={text.muted} />
      </Pressable>
      {open ? (
        <Text style={styles.help}>
          On the tire's warranty card, or on the maker's site under the tire line's warranty. Makers' rotation
          intervals run about 3,500–8,000 miles and differ from one to the next; the number they print is the one
          their mileage warranty holds you to. Tappet does not guess it, because a wrong one would send you a
          notification about a warranty you do not have.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  offer: { gap: space.sm },
  offerText: { ...type.body, color: text.secondary },
  useButton: { alignSelf: 'flex-start' },
  fold: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: TARGET_MIN,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: border.panel,
  },
  foldLabel: { ...type.label, color: text.secondary },
  help: { ...type.body, color: text.secondary },
});
