import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Text from '../components/Text';
import AlertBanner from '../components/AlertBanner';
import Button from '../components/Button';
import Working from '../components/Working';
import { apiRequest, ApiRequestError } from '../api/client';
import {
  REMOVAL_INCOMPLETE,
  REMOVAL_IRREVERSIBLE,
  REMOVAL_NOTHING_ELSE,
  removalInventoryIncomplete,
  removalLines,
  removalTitle,
  type VehicleRemovalInventoryLike,
} from '@tappet/core/vehicle-removal-copy';
import { space, surface, text, type } from '../theme';

/**
 * Remove a car — the confirmation that says what is about to go, from rows.
 *
 * ── Why the phone did not have this (20 Sep) ────────────────────────────────
 *
 * There was no route. The web had `deleteVehicle`; a phone-only owner —
 * every App Store customer — could not remove a car at all. And the web's
 * delete left the receipt photographs in the bucket (proven with a probe
 * object that outlived its row), so the privacy policy's sentence — *delete
 * the vehicle and its receipts go with it* — described an action the phone
 * did not offer and the web did not perform. `lib/vehicle-deletion.ts` is
 * now the one path for both; this screen is the phone's door to it.
 *
 * ── The confirmation is the same design problem as the waiting states ──────
 *
 * "Are you sure?" tells the owner nothing. This reads the inventory —
 * `GET /api/v1/vehicle-removal` — and quotes it: "24 open recalls and what
 * you have marked repaired", "6 service records", "3 receipt photographs".
 * A count the API could not read produces no line and one sentence saying
 * the list may be incomplete; a car with nothing on file says so rather
 * than listing zeros. `@tappet/core/vehicle-removal-copy` words it, so the
 * web can say the same thing.
 *
 * ── Failure ─────────────────────────────────────────────────────────────────
 *
 * The route refuses the removal if any photograph cannot be removed (409),
 * and says so in a sentence; the car stays. That is the honest outcome:
 * a car gone with its photographs still in the bucket is the defect this
 * exists to end.
 */

type Inventory = VehicleRemovalInventoryLike & { vehicle: { id: string } & VehicleRemovalInventoryLike['vehicle'] };

type State =
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; inventory: Inventory; removing: boolean; failure: string | null };

interface Props {
  vehicleId: string;
  onSignOut: () => void;
  /** The car is gone — back to the garage, which refetches on focus. */
  onRemoved: () => void;
  /** The owner kept it. */
  onKeep: () => void;
}

export function RemoveVehicleScreen({ vehicleId, onSignOut, onRemoved, onKeep }: Props) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    setState({ kind: 'loading' });
    try {
      const body = await apiRequest<{ inventory?: Inventory }>(
        `/vehicle-removal?vehicleId=${encodeURIComponent(vehicleId)}`
      );
      if (!body.inventory) {
        setState({ kind: 'error', message: 'This car could not be found.' });
        return;
      }
      setState({ kind: 'ready', inventory: body.inventory, removing: false, failure: null });
    } catch (error) {
      if (error instanceof ApiRequestError && error.isLocallySignedOut) {
        onSignOut();
        return;
      }
      setState({ kind: 'error', message: error instanceof Error ? error.message : 'Could not read what is on file.' });
    }
  }, [onSignOut, vehicleId]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = useCallback(async () => {
    if (state.kind !== 'ready' || state.removing) return;
    setState({ ...state, removing: true, failure: null });
    try {
      // A purge of objects and rows can outlive the 20 s default; and a car
      // that is already gone (a retry after a timeout) answers 404, which is
      // the outcome that was asked for, not a failure.
      await apiRequest(`/vehicle-removal?vehicleId=${encodeURIComponent(vehicleId)}`, {
        method: 'DELETE',
        timeoutMs: 45_000,
      });
      onRemoved();
    } catch (error) {
      if (error instanceof ApiRequestError && error.isLocallySignedOut) {
        onSignOut();
        return;
      }
      if (error instanceof ApiRequestError && error.status === 404) {
        onRemoved();
        return;
      }
      // The route's own sentence — a refused purge says what stayed and why.
      setState({ ...state, removing: false, failure: error instanceof Error ? error.message : 'Could not remove the car.' });
    }
  }, [onRemoved, onSignOut, state, vehicleId]);

  if (state.kind === 'loading') {
    return (
      <ScrollView contentContainerStyle={styles.body}>
        <Working delay line="Reading what is on file" />
      </ScrollView>
    );
  }

  if (state.kind === 'error') {
    return (
      <View style={styles.centre}>
        <Text style={styles.errorTitle}>Could not read what is on file</Text>
        <Text style={styles.errorBody}>{state.message}</Text>
        <Button label="Try again" variant="outline" onPress={() => void load()} />
      </View>
    );
  }

  const { inventory, removing, failure } = state;
  const lines = removalLines(inventory);
  const incomplete = removalInventoryIncomplete(inventory);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body} testID="remove-vehicle">
      <Text style={styles.title} accessibilityRole="header">
        {removalTitle(inventory.vehicle)}
      </Text>

      {lines.length > 0 ? (
        <View style={styles.block}>
          <Text style={styles.lead}>This also removes</Text>
          {lines.map((line, index) => (
            <View key={line} style={styles.row} accessible accessibilityLabel={line}>
              <Text style={styles.index}>{String(index + 1).padStart(2, '0')}</Text>
              <Text style={styles.line}>{line}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.lead}>{REMOVAL_NOTHING_ELSE}</Text>
      )}

      {incomplete ? <Text style={styles.hint}>{REMOVAL_INCOMPLETE}</Text> : null}

      <Text style={styles.irreversible}>{REMOVAL_IRREVERSIBLE}</Text>

      {failure ? <AlertBanner tone="critical" headline="The car was not removed" body={failure} /> : null}

      <View style={styles.actions}>
        <Button
          label="Remove this car"
          variant="delete"
          onPress={() => void remove()}
          busy={removing}
          busyLabel="Removing"
          accessibilityLabel={`Remove this car. ${REMOVAL_IRREVERSIBLE}`}
        />
        <Button label="Keep it" variant="outline" onPress={onKeep} disabled={removing} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  body: { padding: space.lg, gap: space.lg, paddingBottom: space.h2 },
  centre: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.h1, gap: space.sm },
  errorTitle: { ...type.title, color: text.primary },
  errorBody: { ...type.body, color: text.muted, textAlign: 'center' },
  title: { ...type.title, color: text.primary },
  lead: { ...type.body, color: text.secondary },
  block: { gap: space.sm },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  index: { ...type.mono, color: text.muted, paddingTop: 2 },
  line: { ...type.body, color: text.primary, flexShrink: 1 },
  hint: { ...type.value, color: text.muted, lineHeight: 19 },
  irreversible: { ...type.bodyStrong, color: text.primary },
  actions: { gap: space.md, paddingTop: space.sm },
});
