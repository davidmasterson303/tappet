import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Text from '../components/Text';

import Button from '../components/Button';
import CutSurface from '../components/CutSurface';
import Field from '../components/Field';
import { apiRequest, ApiRequestError } from '../api/client';
import { carTitle, type CarIdentity } from '../onboarding/car-identity';
import { validateMileageUpdate } from '@tappet/core/mileage-tracking';
import { BASELINE_AGE_OPTIONS, type BaselineAge } from '@tappet/core/onboarding-baseline';
import { PAGE_BODY, TARGET_MIN, border, cut, space, status, surface, text, type } from '../theme';

/**
 * Add a car — screen two of two: what only the owner knows.
 *
 * ── Three questions no decode can answer ────────────────────────────────────
 *
 * The car arrives identified (`CarIdentity`, from a door or the described
 * car) and this screen asks for the rest: the odometer, whether
 * modifications are wanted, and when the oil was last changed. Then it
 * writes the row — the one `POST /api/v1/vehicles` in the flow, so what is
 * sent is tested in one place (`AddVehicleScreen.test.tsx`).
 *
 * **The odometer is the only keyboard in the flow.** The modifications
 * question and the baseline are chip rows, because a keyboard on a screen
 * that just watched the car identify itself would be the form taking back
 * what the sticker gave.
 *
 * ── The modifications question stays, and it is a fork ─────────────────────
 *
 * David, 20 Sep: *"we have intended to hide mods if user doesn't want them,
 * and even have a more aggressive garage for cars pursuing mods, so i think
 * it's important to ask here."* `showsModifications` reads the answer and
 * decides whether a whole surface exists for this car; the dossier carries a
 * "turn them on" control for anyone who says no, which is what lets this be
 * a single yes/no rather than something that has to be got right first time.
 *
 * ── The oil-change baseline: one chip row, no keyboard ──────────────────────
 *
 * The old form asked a mileage and an age. The mileage field is gone with
 * its keyboard; the age is five chips (`BASELINE_AGE_OPTIONS` — JUST DONE was
 * added for this row and 6–12 MO kept, `onboarding-baseline.ts` says why).
 * JUST DONE also sends the odometer reading as the service mileage: an oil
 * change "just done" happened at, near enough, the reading the owner has
 * just typed, and without it every mileage-based count starts from the next
 * round boundary above the odometer — which for a just-serviced car can be
 * one mile away. The error that leaves is bounded by what "just" means, and
 * it is the one place this screen infers a number; it is said here so it is
 * a decision rather than a surprise.
 *
 * Nothing gates on the baseline, which is why there is no skip button —
 * `onboarding-baseline.ts` carries the argument and it still holds. The
 * design critic may cut the row (the brief's third tier); if it goes, the
 * question moves to the first `unknown` in the service plan, where it has a
 * visible reason attached.
 *
 * ── What a failure says ─────────────────────────────────────────────────────
 *
 * The route's own sentence, always: a 409 is "A car with that VIN is already
 * in a garage." — another account's car, or this owner's added twice — and
 * it is shown here rather than bounced, which is the 22 Aug dead end the
 * route's docblock closes (`vin-belongs-to-somebody.test.ts`). A device-side
 * 401 signs out; any other failure keeps the answers on screen with the
 * reason beneath them.
 */
export function OwnerAnswersScreen({
  identity,
  onAdded,
  onSignOut,
}: {
  identity: CarIdentity;
  onAdded: (vehicleId: string, title: string) => void;
  onSignOut: () => void;
}) {
  const [mileage, setMileage] = useState('');
  const [wantsMods, setWantsMods] = useState(true);
  const [serviceAge, setServiceAge] = useState<BaselineAge | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reading = Number(mileage.replace(/[^0-9]/g, '') || '0');
  const canSubmit = mileage.trim().length > 0 && !busy;

  async function submit() {
    if (!canSubmit) return;

    /*
      Checked here as well as on the route: the rule lives in core precisely
      so the phone can refuse a bad reading without spending a round trip,
      and the server can refuse it regardless because a client is not a
      guarantee. `null`, not 0, for the baseline: a first reading has no
      baseline, and 0 made every car past 100,000 miles a "jump" (19 Sep).
    */
    const decision = validateMileageUpdate({ current: null, next: reading });
    if (!decision.ok) {
      setError(decision.message ?? 'Check that reading.');
      return;
    }

    setBusy(true);
    setError(null);

    try {
      const body = await apiRequest<{ vehicle?: { id: string } }>('/vehicles', {
        method: 'POST',
        /*
          23 Sep: the route classifies the car's generation with a model call
          before it answers, so a cold function plus a slow model could pass
          the client's 20 s — after the row existed. The phone then said
          "did not answer", and a second tap made a second car.
        */
        timeoutMs: 45_000,
        body: {
          vin: identity.vin,
          year: identity.year,
          make: identity.make,
          model: identity.model,
          trim: identity.trim,
          currentMileage: reading,
          wantsModifications: wantsMods,
          /*
            `null` rather than 0 for an unanswered baseline: 0 is a legitimate
            reading and the route must be able to tell them apart. JUST DONE
            carries the odometer as the service mileage — see the docblock.
          */
          lastServiceMileage: serviceAge === 'just-done' ? reading : null,
          lastServiceAge: serviceAge,
        },
      });

      if (!body.vehicle?.id) {
        setError('The car was not saved. Try again.');
        setBusy(false);
        return;
      }

      onAdded(body.vehicle.id, carTitle(identity));
    } catch (err) {
      const apiError = err as ApiRequestError;
      /*
        ⚠ MOB-08. `isLocallySignedOut`, not any 401. A `device` 401 is
        genuinely signed out; a `server` 401 may be a token the server would
        accept a second later, and destroying a working session over one
        response is how a spurious failure becomes a forced re-login.
      */
      if (apiError.isLocallySignedOut) {
        onSignOut();
        return;
      }
      setError(apiError.message ?? 'Could not save the car.');
      setBusy(false);
    }
  }

  const build = [identity.trim, identity.engine].filter(Boolean).join(' · ');

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/*
          The car, named the way the garage will name it — condensed caps, the
          build and the number in mono beneath (B1). What was read is shown
          before what is asked, so the owner is answering about a car and not
          about a form.
        */}
        <View style={styles.car} accessible accessibilityRole="header">
          <Text style={styles.carName}>{carTitle(identity)}</Text>
          {build ? <Text style={styles.carBuild}>{build}</Text> : null}
          {identity.vin ? <Text style={styles.carVin}>{identity.vin}</Text> : null}
        </View>

        <Field
          label="Odometer"
          hint="miles"
          value={mileage}
          onChangeText={setMileage}
          keyboardType="number-pad"
          editable={!busy}
        />

        <View style={styles.question}>
          <Text style={styles.ask}>Interested in modifications?</Text>
          <Text style={styles.why}>
            A running list of what this car could have done next. You can change this later.
          </Text>
          <View style={styles.chips}>
            {[
              { value: true, label: 'Yes' },
              { value: false, label: 'Not for me' },
            ].map(({ value, label }) => (
              <Choice
                key={label}
                label={label}
                selected={wantsMods === value}
                onPress={() => setWantsMods(value)}
                disabled={busy}
              />
            ))}
          </View>
        </View>

        <View style={styles.question}>
          <Text style={styles.ask}>When was its last oil change?</Text>
          <Text style={styles.why}>
            Roughly is fine — it lets the schedule count from the work rather than guess from the
            odometer.
          </Text>
          <View style={styles.chips}>
            {BASELINE_AGE_OPTIONS.map((option) => (
              <Choice
                key={option.value}
                label={option.short}
                accessibilityLabel={option.label}
                selected={serviceAge === option.value}
                onPress={() =>
                  setServiceAge((held) => (held === option.value ? null : option.value))
                }
                disabled={busy}
              />
            ))}
          </View>
        </View>

        {error ? (
          <Text style={styles.error} accessibilityLiveRegion="polite">
            {error}
          </Text>
        ) : null}

        <Button
          label="Add to my garage"
          variant="primary"
          onPress={() => void submit()}
          disabled={!canSubmit}
          busy={busy}
          busyLabel="Saving your car"
        />

        {/*
          Said plainly rather than left as a surprise. The route deliberately
          does not wait for the research, so the car appears at once and its
          page narrates the rest — no duration promised (`no-duration-promises`).
        */}
        <Text style={styles.footnote}>
          Your car appears straight away. Its research runs behind it, and its page shows each
          step as it lands.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/**
 * A choice chip — one answer of a few, in the system's grammar: mono caps,
 * the control's cut (B4), a hairline that brightens with the ink when
 * chosen. No hue fill (B7) and never colour alone: the ink and the stroke
 * both move, and `accessibilityState.selected` says it to a screen reader.
 */
function Choice({
  label,
  accessibilityLabel,
  selected,
  onPress,
  disabled,
}: {
  label: string;
  accessibilityLabel?: string;
  selected: boolean;
  onPress: () => void;
  disabled: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected, disabled }}
    >
      {({ pressed }) => (
        <CutSurface
          style={styles.chip}
          cut={['bottomRight']}
          size={cut.control}
          fill={pressed ? surface.raised : undefined}
          stroke={selected ? text.primary : border.field}
        >
          <Text style={[styles.chipLabel, selected && styles.chipLabelOn]}>{label}</Text>
        </CutSurface>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  body: { ...PAGE_BODY, gap: space.xxl },

  car: { gap: space.xs },
  carName: { ...type.display, color: text.primary },
  carBuild: { ...type.mono, fontSize: 15, lineHeight: 22, color: text.secondary },
  carVin: { ...type.mono, color: text.muted },

  question: { gap: space.sm },
  ask: { ...type.displaySection, color: text.primary },
  why: { ...type.value, color: text.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingTop: space.xs },
  chip: {
    minHeight: TARGET_MIN,
    paddingHorizontal: space.lg,
    justifyContent: 'center',
  },
  chipLabel: { ...type.monoLabel, color: text.muted },
  chipLabelOn: { color: text.primary },

  error: { ...type.value, color: status.dangerText },
  footnote: { ...type.value, color: text.muted },
});
