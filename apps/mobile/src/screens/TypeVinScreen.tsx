import { useRef, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import Button from '../components/Button';
import CutSurface from '../components/CutSurface';
import DecodeLog from '../components/DecodeLog';
import { useVinDecode, type Prefill } from '../onboarding/useVinDecode';
import type { CarIdentity } from '../onboarding/car-identity';
import { VIN_LENGTH, normaliseVin, vinProblem } from '@tappet/core/vehicle-catalog';
import { PAGE_BODY, border, brand, cut, space, status, surface, text, type } from '../theme';
import { monoFace } from '../theme/fonts';

/**
 * Door three: the number, typed — the web's hero treatment on the phone.
 *
 * ── The field is the largest thing on the screen (web B8) ───────────────────
 *
 * `app/onboard/OnboardVinForm.tsx` made the VIN the hero on 11 Sep: the
 * field at the `lg` step, 64px tall in 24px mono, a cyan hairline beneath it
 * advancing one seventeenth per character. The "0/17" counter went — the ramp
 * *is* the count — and the ramp is a real `progressbar`, so a screen reader
 * gets the same fact the eye does. This is that field, in the phone's own
 * primitives: `CutSurface` for the well and the 45° corner (B4), the mono
 * face for the value (B1), the focus stroke in the accent (B7's "cyan only
 * as focus"). Seventeen characters at 24pt mono are ~260pt, which fits
 * every phone this app targets with the page gutter to spare.
 *
 * ⚠ The count-down sentence `vinProblem` prints for a short number ("5 to
 * go") is *not* shown here. The ramp carries that fact and the progressbar
 * speaks it; a sentence beneath would say it a third time. What is shown is
 * the one mistake a typed VIN can contain — an I, O or Q — because that is
 * a misreading rather than an unfinished number, and it is said the moment
 * the character lands.
 *
 * ── The decode narrates under the field ─────────────────────────────────────
 *
 * READ THE CAR OFF IT dismisses the keyboard and starts the log (`DecodeLog`)
 * beneath the field, which stays on screen so the number and its answer can
 * be read together. EDIT THE NUMBER on a failed decode, and NOT MY CAR on a
 * named one, both return here with the field editable.
 *
 * ── "I don't have the VIN" lives here, not on the doors ─────────────────────
 *
 * The escape hatch — the described car — is reachable from this screen and
 * from a failed decode, and from nowhere earlier: the doors screen carries no
 * manual-entry link in any state (`AddVehicleScreen`). Someone who opens the
 * typed door and finds they are on the sofa rather than in the driveway is
 * one quiet line from the old form; someone who has not opened it is offered
 * the number first. That ordering is the redesign.
 */
export function TypeVinScreen({
  onIdentified,
  onDescribe,
}: {
  onIdentified: (identity: CarIdentity) => void;
  onDescribe: (carry: { vin?: string; prefill?: Prefill }) => void;
}) {
  const [vin, setVin] = useState('');
  const [focused, setFocused] = useState(false);
  const input = useRef<TextInput>(null);
  const decode = useVinDecode('typed');

  /*
    The only mistake a normalised VIN can hold. `normaliseVin` has already
    dropped anything that is not a letter or a digit, so `vinProblem`'s other
    sentences are the count-down the ramp carries — see the docblock.
  */
  const mistake = /[IOQ]/.test(vin) ? vinProblem(vin) : null;
  const complete = vin.length === VIN_LENGTH && !mistake;
  const reading = decode.observation !== null;

  const read = () => {
    if (!complete || reading) return;
    Keyboard.dismiss();
    decode.start(vin);
  };

  const edit = () => {
    decode.reset();
    input.current?.focus();
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <Text style={styles.label}>VIN</Text>
          <CutSurface
            cut={['bottomRight']}
            size={cut.control}
            fill={surface.well}
            stroke={mistake ? status.dangerBorder : focused ? brand.accent : border.field}
          >
            <TextInput
              ref={input}
              value={vin}
              /*
                Normalised on the way in, so a VIN read aloud in groups — or
                pasted out of an insurance email with a stray space — becomes
                the thing NHTSA can be asked about. Lower case is upper cased
                for the same reason.
              */
              onChangeText={(next) => setVin(normaliseVin(next).slice(0, VIN_LENGTH))}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onSubmitEditing={read}
              editable={!reading}
              accessibilityLabel="VIN"
              aria-invalid={Boolean(mistake)}
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              keyboardType="ascii-capable"
              returnKeyType="done"
              maxLength={VIN_LENGTH}
              selectionColor={brand.accent}
              cursorColor={brand.accent}
              style={styles.input}
              testID="vin-input"
            />
          </CutSurface>
          {/*
            The ramp: a hairline advancing one seventeenth per character. Cyan
            is information and focus, and this is both. A real `progressbar`
            rather than decoration, so the count survives for anyone not
            looking at it.
          */}
          <View
            style={styles.track}
            accessibilityRole="progressbar"
            accessibilityLabel="VIN length"
            accessibilityValue={{ min: 0, max: VIN_LENGTH, now: vin.length }}
            testID="vin-ramp"
          >
            <View style={[styles.ramp, { width: `${(vin.length / VIN_LENGTH) * 100}%` }]} />
          </View>
          {mistake ? (
            <Text style={styles.mistake} accessibilityLiveRegion="polite">
              {mistake}
            </Text>
          ) : (
            <Text style={styles.where}>
              On the driver's door jamb, at the base of the windscreen, or on your insurance card.
            </Text>
          )}
        </View>

        {reading ? (
          <DecodeLog
            decode={decode}
            retryLabel="Edit the number"
            onRetry={edit}
            onConfirm={onIdentified}
            onDescribe={() => onDescribe({ vin, prefill: decode.prefill ?? undefined })}
          />
        ) : (
          <View style={styles.ways}>
            <Button label="Read the car off it" variant="primary" onPress={read} disabled={!complete} />
            <Button
              label="I don't have the VIN"
              variant="ghost"
              size="small"
              onPress={() => onDescribe({})}
              style={styles.onMargin}
            />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** The hero step: web's `lg` field, 64px in 24px mono. */
const HERO_HEIGHT = 64;
const HERO_FONT = 24;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  body: { ...PAGE_BODY, gap: space.xxl },
  hero: { gap: space.sm },
  label: { ...type.monoLabel, color: text.secondary },
  input: {
    backgroundColor: 'transparent',
    minHeight: HERO_HEIGHT,
    paddingHorizontal: space.lg,
    color: text.primary,
    fontFamily: monoFace('400'), fontWeight: '400',
    fontSize: HERO_FONT,
    letterSpacing: 1,
  },
  track: { height: 1, backgroundColor: border.panel },
  ramp: { height: 1, backgroundColor: brand.accent },
  where: { ...type.value, color: text.muted },
  mistake: { ...type.value, color: status.dangerText },
  ways: { gap: space.md },
  onMargin: { alignSelf: 'flex-start', marginLeft: -space.md },
});
