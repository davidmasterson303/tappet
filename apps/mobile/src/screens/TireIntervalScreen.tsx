import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet } from 'react-native';
import Text from '../components/Text';

import {
  draftFromTireSet,
  parseWholeMiles,
  tireSetProblems,
  type TireSet,
} from '@tappet/core/tires';
import { localToday } from '@tappet/core/garage-next-service';

import { ApiRequestError } from '../api/client';
import { updateTireSet } from '../api/tires';
import AlertBanner from '../components/AlertBanner';
import Button from '../components/Button';
import Field from '../components/Field';
import { OPTICAL_CENTRE, PAGE_BODY, space, surface, text, type } from '../theme';

/**
 * ENTER THE INTERVAL — one question, one screen.
 *
 * The answer to the tire screen's `ROTATION INTERVAL · NOT ENTERED · TAPPET
 * WILL NOT GUESS THIS` row: the control under that row opens this, and this
 * asks for the one figure that gives the set an obligation. It is its own
 * screen rather than a field on the set form because it is the moment the
 * feature turns on — before it, nothing is due and nothing is pushed; after
 * it, both — and a person should be able to see that they are doing that.
 *
 * ── Where the number comes from is said, and nothing offers one ─────────────
 *
 * The hint names the warranty card. There is no chip, no default and no
 * "typical" figure: the notification this licenses says "outside your
 * warranty's terms", and only the card can source a claim about the warranty.
 * An interval Tappet offered and the owner accepted would be Tappet's, and the
 * sentence would be false of it.
 *
 * ── Judged by the set's rules ───────────────────────────────────────────────
 *
 * The typed figure is dropped into the set's draft and `tireSetProblems`
 * judges it, so the bounds and the words are the ones the set form and the
 * route apply — one rule, three places. Blank is refused here, unlike on the
 * set form, because entering the interval is this screen's whole job.
 */
export function TireIntervalScreen({
  set,
  onSaved,
  onSignOut,
}: {
  set: TireSet;
  onSaved: () => void;
  onSignOut: () => void;
}) {
  const [value, setValue] = useState(set.rotationIntervalMiles === null ? '' : String(set.rotationIntervalMiles));
  const [showProblems, setShowProblems] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const today = localToday();

  const problem = useMemo(() => {
    if (value.trim().length === 0) return 'Enter the interval from your warranty card.';
    const draft = { ...draftFromTireSet(set), rotationIntervalMiles: value };
    return tireSetProblems(draft, today).find((p) => p.field === 'rotationIntervalMiles')?.message;
  }, [value, set, today]);

  async function save() {
    setShowProblems(true);
    if (problem) return;

    setSaving(true);
    setRefused(null);
    try {
      await updateTireSet(set.id, { rotationIntervalMiles: parseWholeMiles(value) ?? null });
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
          The rotation interval on your warranty card. Tappet holds this set to it and tells you when you are past
          it. Until you enter one, the set has no obligation and nothing is due.
        </Text>

        <Field
          label="Rotation interval, miles"
          hint="from your warranty card"
          value={value}
          onChangeText={setValue}
          keyboardType="number-pad"
          autoFocus
          problem={showProblems ? problem : undefined}
        />
        {refused ? <AlertBanner tone="critical" headline="Not saved" body={refused} /> : null}

        <Button label="Save the interval" busy={saving} busyLabel="Saving" onPress={() => void save()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: surface.page },
  body: { ...PAGE_BODY, ...OPTICAL_CENTRE, gap: space.xl },
  lede: { ...type.body, color: text.secondary },
});
