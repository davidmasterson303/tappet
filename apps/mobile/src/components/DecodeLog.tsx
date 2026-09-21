import { useEffect, useRef } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';

import Button from './Button';
import Seat from './Seat';
import Working from './Working';
import { decodeLine, decodeStages } from './working-stages';
import type { VinDecode } from '../onboarding/useVinDecode';
import type { CarIdentity } from '../onboarding/car-identity';
import { space } from '../theme';

/**
 * The decode, narrated — the wait instrument between "which car" and "what
 * only the owner knows".
 *
 * ── Every line is a step that completed ─────────────────────────────────────
 *
 * `decodeStages` assembles two rows from what the door and NHTSA actually
 * said (`working-stages.ts` carries the model and the coupling: a row with
 * an answer is done or failed; a running one has none). There is no timer
 * here, no percentage and no spinner — the pip swings while NHTSA is asked
 * and holds still the moment it has answered, which is `frozen` on the
 * outcome rather than on a clock.
 *
 * ── The answer is read before it is acted on ────────────────────────────────
 *
 * The screen does not move on the instant NHTSA names the car. The named
 * line is the payoff of the whole first run — the moment the car identifies
 * itself — and it is also the one place a mistyped number that decodes to
 * a *different real car* can be caught, before that VIN becomes the row's
 * unique key. So the log lands, and one control confirms it: THAT'S MY CAR.
 * NOT MY CAR returns to the door. One tap, and it is the honest checkpoint
 * rather than a speed bump; if it proves to be the latter on the phone, it
 * is one line to remove.
 *
 * ── A stated failure has two ways on ────────────────────────────────────────
 *
 * The failed row carries its reason in the warning ink, and beneath it the
 * two moves the reason named: the door again, and the escape hatch — the
 * described car, with whatever NHTSA did read already filled in. A decode
 * that fails into a permanent animation, or into a sentence with nothing
 * under it, is the dead end this component exists to close.
 *
 * ── Screen readers ──────────────────────────────────────────────────────────
 *
 * `Working` announces its line politely; the named answer is announced once
 * as it lands, because a VoiceOver user cannot watch the row change and the
 * confirm control beneath asks about a sentence they have to have heard.
 */
export default function DecodeLog({
  decode,
  retryLabel,
  onRetry,
  onConfirm,
  onDescribe,
}: {
  decode: VinDecode;
  /** The door's own verb — "Scan again", "Edit the number". */
  retryLabel: string;
  onRetry: () => void;
  onConfirm: (identity: CarIdentity) => void;
  onDescribe: () => void;
}) {
  const { observation, identity } = decode;
  const announced = useRef<string | null>(null);

  useEffect(() => {
    if (!observation || observation.outcome.status === 'asking') return;
    const line =
      observation.outcome.status === 'named' ? observation.outcome.sentence : observation.outcome.reason;
    if (announced.current === line) return;
    announced.current = line;
    AccessibilityInfo.announceForAccessibility(line);
  }, [observation]);

  if (!observation) return null;

  const settled = observation.outcome.status !== 'asking';

  return (
    <View style={styles.block} testID="decode-log">
      <Working
        line={decodeLine(observation)}
        stages={decodeStages(observation)}
        frozen={settled}
        rule={false}
      />
      {observation.outcome.status === 'named' && identity ? (
        <Seat style={styles.ways}>
          <Button label="That's my car" variant="primary" onPress={() => onConfirm(identity)} />
          <Button label="Not my car" variant="ghost" size="small" onPress={onRetry} style={styles.onMargin} />
        </Seat>
      ) : null}
      {observation.outcome.status === 'failed' ? (
        <Seat style={styles.ways}>
          <Button label="Describe the car instead" variant="primary" onPress={onDescribe} />
          <Button label={retryLabel} variant="outline" onPress={onRetry} />
        </Seat>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: space.lg },
  ways: { gap: space.md },
  /* The quiet way back sits on the page's margin, as the scan's "Change that" does. */
  onMargin: { alignSelf: 'flex-start', marginLeft: -space.md },
});
