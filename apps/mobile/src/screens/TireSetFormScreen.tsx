import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  draftFromTireSet,
  emptyTireSetDraft,
  tireSetPayload,
  tireSetProblems,
  type TireSet,
  type TireSetDraft,
  type TireSetField,
} from '@tappet/core/tires';
import { localToday } from '@tappet/core/garage-next-service';

import { ApiRequestError } from '../api/client';
import { createTireSet, updateTireSet } from '../api/tires';
import AlertBanner from '../components/AlertBanner';
import Button from '../components/Button';
import Field from '../components/Field';
import { PAGE_BODY, space, surface, text, type } from '../theme';

/**
 * Putting a tire set on the car, or changing what was entered about it.
 *
 * ── What is required, and why so little ─────────────────────────────────────
 *
 * Brand, the tire's name and a front size — what a person can read off the
 * sidewall in the driveway. Everything else is genuinely often unknown at
 * entry, and each field says what leaving it blank costs rather than making
 * someone type a number they are guessing at: no install odometer, no axis;
 * no interval, no obligation. `tireSetProblems` in core is the judge, here and
 * again at the route, so the two cannot drift.
 *
 * ── The interval is asked, never assumed ────────────────────────────────────
 *
 * The field's hint says where the figure comes from — the warranty card — and
 * nothing prefills it. `service-due.ts` deleted a table of typical intervals
 * because a figure Tappet cannot source is a bad basis for an unprompted
 * notification, and the push this feature sends is exactly that. Whatever is
 * typed here is stored as the owner's, which is the only source that licenses
 * the push's sentence.
 *
 * ── Problems are shown after a save is attempted ────────────────────────────
 *
 * Computed continuously and shown only after the first SAVE. A form that turns
 * red while the first field is still being typed is telling someone off for
 * not having finished — `MarkDoneSheet` makes the same choice for the same
 * reason.
 *
 * ── A blank rear size is the front's ────────────────────────────────────────
 *
 * The common case is four of one size, so the rear field is optional and says
 * so. The payload writes both axles regardless — per axle from the start —
 * and the two sizes differing is what makes a set staggered, with the two
 * consequence rows on the tire screen.
 */
export function TireSetFormScreen({
  vehicleId,
  set,
  onSaved,
  onSignOut,
}: {
  vehicleId: string;
  /** Present when editing; the draft opens on what was stored. */
  set?: TireSet | null;
  onSaved: () => void;
  onSignOut: () => void;
}) {
  const [draft, setDraft] = useState<TireSetDraft>(() => (set ? draftFromTireSet(set) : emptyTireSetDraft()));
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const today = localToday();

  const problems = useMemo(() => tireSetProblems(draft, today), [draft, today]);
  const problemFor = (field: TireSetField) =>
    showProblems ? problems.find((p) => p.field === field)?.message : undefined;

  function patch(change: Partial<TireSetDraft>) {
    setDraft((current) => ({ ...current, ...change }));
  }

  async function save() {
    setShowProblems(true);
    if (problems.length > 0) return;

    setSaving(true);
    setRefused(null);
    try {
      const payload = tireSetPayload(draft);
      if (set) await updateTireSet(set.id, payload);
      else await createTireSet(vehicleId, payload);
      onSaved();
    } catch (error) {
      if (error instanceof ApiRequestError && error.isLocallySignedOut) {
        onSignOut();
        return;
      }
      /*
        The route's refusal is the sentence the field would have shown, or a
        named state (409: a set is already on the car; 503: the tables are not
        applied). Shown as it arrived, in the banner rather than an alert, so
        the form is still there to correct.
      */
      setRefused(error instanceof Error ? error.message : 'That was not saved.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.lede}>
          {set
            ? 'Change what you entered about this set. Tappet derives everything else from it.'
            : 'What is on the sidewall and the receipt. Leave blank what you do not know — Tappet will not fill it in.'}
        </Text>

        <View style={styles.group}>
          <Field
            label="Brand"
            value={draft.brand}
            onChangeText={(brand) => patch({ brand })}
            placeholder="Michelin"
            autoCapitalize="words"
            autoCorrect={false}
            problem={problemFor('brand')}
          />
          <Field
            label="Tire"
            hint="the name on the sidewall"
            value={draft.line}
            onChangeText={(line) => patch({ line })}
            placeholder="Pilot Sport 4S"
            autoCapitalize="words"
            autoCorrect={false}
            problem={problemFor('line')}
          />
          <Field
            label="Size, front"
            value={draft.sizeFront}
            onChangeText={(sizeFront) => patch({ sizeFront })}
            placeholder="245/35R19"
            autoCapitalize="characters"
            autoCorrect={false}
            problem={problemFor('sizeFront')}
          />
          <Field
            label="Size, rear"
            hint="blank if the same"
            value={draft.sizeRear}
            onChangeText={(sizeRear) => patch({ sizeRear })}
            placeholder={draft.sizeFront.trim() || '245/35R19'}
            autoCapitalize="characters"
            autoCorrect={false}
            problem={problemFor('sizeRear')}
          />
        </View>

        <View style={styles.group}>
          <Field
            label="Installed on"
            hint="optional · YYYY-MM-DD"
            value={draft.installedOn}
            onChangeText={(installedOn) => patch({ installedOn })}
            placeholder={today}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="numbers-and-punctuation"
            problem={problemFor('installedOn')}
          />
          <Field
            label="Odometer at install"
            hint="optional · without it, no axis"
            value={draft.installOdometer}
            onChangeText={(installOdometer) => patch({ installOdometer })}
            keyboardType="number-pad"
            problem={problemFor('installOdometer')}
          />
          <Field
            label="Bought at"
            hint="optional"
            value={draft.purchasePlace}
            onChangeText={(purchasePlace) => patch({ purchasePlace })}
            placeholder="Discount Tire"
            autoCapitalize="words"
            problem={problemFor('purchasePlace')}
          />
        </View>

        <View style={styles.group}>
          <Field
            label="Rotation interval, miles"
            hint="from your warranty card"
            value={draft.rotationIntervalMiles}
            onChangeText={(rotationIntervalMiles) => patch({ rotationIntervalMiles })}
            keyboardType="number-pad"
            problem={problemFor('rotationIntervalMiles')}
          />
          <Text style={styles.note}>
            The interval is yours to state. Without it this set has no obligation, and Tappet will not guess one.
          </Text>
          <Field
            label="Treadwear mileage, miles"
            hint="optional · as printed"
            value={draft.treadwearMilesEntered}
            onChangeText={(treadwearMilesEntered) => patch({ treadwearMilesEntered })}
            keyboardType="number-pad"
            problem={problemFor('treadwearMilesEntered')}
          />
        </View>

        {refused ? <AlertBanner tone="critical" headline="Not saved" body={refused} /> : null}

        <Button
          label={set ? 'Save the changes' : 'Save the set'}
          busy={saving}
          busyLabel="Saving"
          onPress={() => void save()}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  body: { ...PAGE_BODY, gap: space.xxl },
  lede: { ...type.body, color: text.secondary },
  group: { gap: space.lg },
  note: { ...type.value, color: text.muted },
});
