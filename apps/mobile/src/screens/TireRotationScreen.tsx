import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import Text from '../components/Text';

import {
  emptyRotationDraft,
  formatMiles,
  rotationPayload,
  rotationProblems,
  type RotationDraft,
  type TireRotation,
  type TireSet,
} from '@tappet/core/tires';
import { localToday } from '@tappet/core/garage-next-service';

import { ApiRequestError } from '../api/client';
import { addTireRotation } from '../api/tires';
import AlertBanner from '../components/AlertBanner';
import Button from '../components/Button';
import Field from '../components/Field';
import { OPTICAL_CENTRE, PAGE_BODY, space, surface, text, type } from '../theme';

/**
 * ADD A ROTATION — a date and a reading.
 *
 * The primary act on a records screen is logging the thing the screen records
 * (the export was cut from v1.1 and this took its slot, as an improvement
 * rather than a consolation). Two facts, both required: when, and the
 * odometer. `rotationProblems` in core judges them — not in the future, not
 * before the install, not below a reading already on the set's record — and
 * the route judges them again with the same function.
 *
 * ── The reading opens on the car's ─────────────────────────────────────────
 *
 * Most people log a rotation the day it was done, so the field opens on the
 * car's current odometer and today's date, and both are editable for the one
 * being copied off a receipt from March. A reading above the car's becomes
 * the car's reading (the route does it, through the mileage rule) — the
 * odometer only goes up, and a rotation is as good a reading as any.
 *
 * ── No date picker, deliberately ────────────────────────────────────────────
 *
 * `MarkDoneSheet` carries the argument: a native picker costs one of fifteen
 * monthly cloud builds, and the dates that matter are today and a receipt's.
 * A typed `YYYY-MM-DD` covers both.
 *
 * ── Every row it writes is the owner's ──────────────────────────────────────
 *
 * The record row this produces carries the hairline mark — typed by you. A
 * rotation read off a scanned invoice arrives by the vision path with the
 * filled mark and the document behind it; this screen never claims that.
 */
export function TireRotationScreen({
  set,
  rotations,
  currentMileage,
  onSaved,
  onSignOut,
}: {
  set: TireSet;
  rotations: TireRotation[];
  currentMileage: number | null;
  onSaved: () => void;
  onSignOut: () => void;
}) {
  const today = localToday();
  const [draft, setDraft] = useState<RotationDraft>(() => emptyRotationDraft(today, currentMileage));
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const problems = useMemo(
    () => rotationProblems(draft, { today, set, rotations }),
    [draft, today, set, rotations]
  );
  const problemFor = (field: keyof RotationDraft) =>
    showProblems ? problems.find((p) => p.field === field)?.message : undefined;

  const floor = Math.max(set.installOdometer ?? 0, ...rotations.map((r) => r.odometer));

  async function save() {
    setShowProblems(true);
    if (problems.length > 0) return;

    setSaving(true);
    setRefused(null);
    try {
      await addTireRotation(set.id, rotationPayload(draft));
      onSaved();
    } catch (error) {
      if (error instanceof ApiRequestError && error.isLocallySignedOut) {
        onSignOut();
        return;
      }
      setRefused(error instanceof Error ? error.message : 'That was not saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lede}>
          {set.brand} {set.line}. When were the tires rotated, and what did the odometer read?
        </Text>

        <Field
          label="Rotated on"
          hint="YYYY-MM-DD"
          value={draft.rotatedOn}
          onChangeText={(rotatedOn) => setDraft((current) => ({ ...current, rotatedOn }))}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="numbers-and-punctuation"
          problem={problemFor('rotatedOn')}
        />
        <Field
          label="Odometer, miles"
          hint={floor > 0 ? `at least ${formatMiles(floor).toLowerCase()}` : undefined}
          value={draft.odometer}
          onChangeText={(odometer) => setDraft((current) => ({ ...current, odometer }))}
          keyboardType="number-pad"
          problem={problemFor('odometer')}
        />

        {refused ? <AlertBanner tone="critical" headline="Not saved" body={refused} /> : null}

        <Button label="Log the rotation" busy={saving} busyLabel="Saving" onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  body: { ...PAGE_BODY, ...OPTICAL_CENTRE, gap: space.xl },
  lede: { ...type.body, color: text.secondary },
});
