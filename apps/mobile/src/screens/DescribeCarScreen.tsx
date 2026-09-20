import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';

import Button from '../components/Button';
import Field from '../components/Field';
import Suggest from '../components/Suggest';
import { fetchModels } from '../api/vpic';
import type { CarIdentity } from '../onboarding/car-identity';
import type { Prefill } from '../onboarding/useVinDecode';
import {
  COMMON_MAKES,
  VIN_LENGTH,
  canonicalName,
  isPlausibleModelYear,
  modelYears,
  normaliseVin,
  suggestNames,
  vinProblem,
} from '@tappet/core/vehicle-catalog';
import { PAGE_BODY, space, status, surface, text, type } from '../theme';

/**
 * The escape hatch: the car, described.
 *
 * ── The old form's fields, kept whole, moved behind the doors ───────────────
 *
 * Until 20 Sep these four fields and their suggestion panels *were* the add
 * screen, with the VIN offered above them. They are unchanged here — the
 * catalogue's argument (`@tappet/core/vehicle-catalog`), the debounced model
 * lookup, the spelling applied on submit rather than under the finger — and
 * what changed is when they are shown: **only after a decode failed, or after
 * the owner said they do not have the number.** Never as a door. A described
 * car is a car the joins may not find — "bmw" and "BMW" are two makes to a
 * recall match — and the doors exist so that most cars are never described.
 *
 * ── What is carried in ──────────────────────────────────────────────────────
 *
 * A failed decode arrives with the number that failed and whatever NHTSA did
 * read (`Prefill`). The fields open filled with that much, and the VIN is
 * shown in its own field rather than dropped: a number NHTSA could not place
 * is more likely mistyped than genuine, and the owner should see what will
 * be saved against their car and be able to correct or clear it. It is sent
 * as typed — `vinProblem`'s words refuse a half-typed one, as the route
 * does — or `null` when the field is empty. "I don't have the VIN" arrives
 * with nothing, and the VIN field is not drawn at all: asking for it again
 * on the screen reached by declining it would be the form arguing.
 *
 * ── Continue, not save ──────────────────────────────────────────────────────
 *
 * This screen identifies the car and hands it on, like the doors do. The
 * odometer, the modifications question and the oil-change baseline are asked
 * once, on `OwnerAnswersScreen`, whichever way the car was identified — one
 * place the row is written from, and one set of tests for what it sends.
 */

/** Which suggestion panel is showing. See `Suggest` for why the form owns it. */
type OpenField = 'year' | 'make' | 'model' | null;

/**
 * How long a settled make and year have to sit still before vPIC is asked.
 *
 * The make field is free text, so every keystroke of "Subaru" is a candidate
 * make and six requests for a word nobody has finished typing is six requests
 * wasted on somebody else's API. Long enough to skip the intermediate states,
 * short enough that a chosen suggestion feels immediate.
 */
const MODEL_LOOKUP_DEBOUNCE_MS = 350;

export function DescribeCarScreen({
  vin: carriedVin,
  prefill,
  onIdentified,
}: {
  /** The number that failed to decode, when there is one. Absent from "I don't have the VIN". */
  vin?: string;
  prefill?: Prefill;
  onIdentified: (identity: CarIdentity) => void;
}) {
  const [year, setYear] = useState(prefill?.year ? String(prefill.year) : '');
  const [make, setMake] = useState(prefill?.make ?? '');
  const [model, setModel] = useState(prefill?.model ?? '');
  const [trim, setTrim] = useState(prefill?.trim ?? '');
  const [vin, setVin] = useState(carriedVin ? normaliseVin(carriedVin) : '');
  const [error, setError] = useState<string | null>(null);

  const [openField, setOpenField] = useState<OpenField>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);

  /*
    Built once. `modelYears` walks from next year back to 1981 — 47 strings,
    rebuilt on every keystroke of every field if this were inline. The clock
    is read here rather than inside `modelYears`, which takes a `Date` for the
    reason everything in this codebase does: a function with its own clock
    cannot be tested on 1 January, and this list changes on 1 January.
  */
  const years = useMemo(() => modelYears(new Date()).map(String), []);

  const yearNumber = Number(year.trim());
  const yearReady = isPlausibleModelYear(yearNumber, new Date());
  const makeReady = make.trim().length > 0;

  /*
    Models, when there is a make and a year to ask about. Aborted **and**
    flagged: `cancelled` guards the state write and the `AbortController`
    stops the three requests in flight; dropping either one produces the
    classic typeahead bug where an early, slow response lands after a later,
    fast one and the list snaps back to the wrong make.
  */
  useEffect(() => {
    if (!yearReady || !makeReady) {
      setModels([]);
      setModelsLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setModelsLoading(true);

    const timer = setTimeout(() => {
      void fetchModels(make.trim(), yearNumber, controller.signal).then((found) => {
        if (cancelled) return;
        setModels(found);
        setModelsLoading(false);
      });
    }, MODEL_LOOKUP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [make, yearNumber, yearReady, makeReady]);

  const canContinue = yearReady && makeReady && model.trim().length > 0;

  function submit() {
    if (!canContinue) return;

    /*
      The catalogue's spelling wins, applied **here** rather than as the owner
      types. "bmw" typed into a free-text cell is a different make from "BMW"
      to every downstream join; on submit, not on keystroke, because a field
      that rewrites itself under the finger feels like the form arguing.
      `canonicalName` returns an unlisted make untouched, which is what keeps
      this a catalogue and not a gate.
    */
    const chosenMake = canonicalName(make, COMMON_MAKES);
    const chosenModel = models.length > 0 ? canonicalName(model, models) : model.trim();

    const typedVin = normaliseVin(vin);
    const vinTrouble = vinProblem(typedVin);
    if (vinTrouble) {
      setError(vinTrouble);
      return;
    }

    setError(null);
    onIdentified({
      vin: typedVin || null,
      year: yearNumber,
      make: chosenMake,
      model: chosenModel,
      trim: trim.trim(),
      engine: null,
      source: 'described',
    });
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/*
          ⚠ Recalls are matched on year, make and model, not VIN (CLAUDE.md
          §10) — the lede says what a described car gets and claims nothing
          a VIN would have added. `no-vin-recall-claims.test.ts` reads this
          file.
        */}
        <Text style={styles.lede}>
          Year, make and model are enough to research the car and match its recalls. The exact
          build — engine, trim, factory options — needs the number, and you can add it later.
        </Text>

        {carriedVin !== undefined ? (
          <Field
            label="VIN"
            hint="as read"
            value={vin}
            onChangeText={(next) => setVin(normaliseVin(next))}
            problem={vinProblem(vin) ?? undefined}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={VIN_LENGTH}
          />
        ) : null}

        <Suggest
          label="Model year"
          value={year}
          onChangeText={setYear}
          onPick={(picked) => {
            setYear(picked);
            setOpenField(null);
          }}
          suggestions={suggestNames(year, years, 6)}
          open={openField === 'year'}
          onOpen={() => setOpenField('year')}
          problem={
            /*
              Only once four characters are in. Complaining at "20" would be
              the form telling somebody they are wrong while they are still
              typing, which is the fastest way to teach people to ignore it.
            */
            year.trim().length >= 4 && !yearReady
              ? `Model years run from ${years[years.length - 1]} to ${years[0]}.`
              : undefined
          }
          keyboardType="number-pad"
          maxLength={4}
        />

        <Suggest
          label="Make"
          value={make}
          onChangeText={setMake}
          onPick={(picked) => {
            setMake(picked);
            /*
              The model is cleared, not kept. A model belongs to a make, and an
              Accord left sitting under Subaru is the one state this form must
              never submit — it typechecks, it looks filled in, and it creates a
              car that does not exist.
            */
            setModel('');
            setOpenField(null);
          }}
          suggestions={suggestNames(make, COMMON_MAKES)}
          open={openField === 'make'}
          onOpen={() => setOpenField('make')}
          autoCapitalize="words"
        />

        <Suggest
          label="Model"
          value={model}
          onChangeText={setModel}
          onPick={(picked) => {
            setModel(picked);
            setOpenField(null);
          }}
          suggestions={suggestNames(model, models)}
          loading={modelsLoading}
          /*
            The panel says what it is waiting for rather than sitting empty.
            The third sentence claims nothing about the car: NHTSA not listing
            a model is a fact about NHTSA, not "your car does not exist".
          */
          quiet={
            !yearReady || !makeReady
              ? 'Pick a model year and a make and we will list what was built.'
              : `We have no models listed for a ${yearNumber} ${make.trim()}. Type it in — it will still work.`
          }
          open={openField === 'model'}
          onOpen={() => setOpenField('model')}
          autoCapitalize="words"
        />

        <Field label="Trim" hint="optional" value={trim} onChangeText={setTrim} autoCapitalize="words" />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <View style={styles.ways}>
          <Button label="Continue" variant="primary" onPress={submit} disabled={!canContinue} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  body: { ...PAGE_BODY },
  lede: { ...type.body, color: text.secondary },
  error: { ...type.value, color: status.dangerText },
  ways: { paddingTop: space.sm },
});
