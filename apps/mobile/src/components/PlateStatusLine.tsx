import { StyleSheet, Text, View } from 'react-native';
import { plateStatusLine, type PlateStatus } from '@tappet/core/plates';

import { register, space, text, type } from '../theme';
import { WorkingMark } from './Working';

/**
 * What the empty plate says while the car's generation plate is being drawn.
 *
 * ── 12 Sep · the phone can finally say it ───────────────────────────────────
 *
 * Both mobile routes carry `plate_status` beside `photo_url` since c134bb6 —
 * `pending` | `generating` | `ready` | `failed` | `null`, where `null` means
 * there is nothing to say (a photograph is showing, or no plate was asked
 * for). Until then the loop's parking lot (drift §6.13) recorded the line the
 * phone *could* print if a route carried the status; it does now, on the
 * garage list and the detail read, so the night a car stands on can say why
 * it is empty rather than looking like a car nobody photographed.
 *
 * ── Two states, two faces — brief B8 ────────────────────────────────────────
 *
 * `pending` and `generating` are a wait, and a wait carries the arc: the mono
 * line in the state voice with the compact instrument's bare mark beside it.
 * The mark rather than the compact face, because the plate already carries
 * the identity block and a 20pt dial with terminals beside the model name
 * would be a second instrument on the bay. `failed` is not a wait, it is an
 * absence, and an absence carries no arc: a quiet mono line and nothing that
 * moves. Both spellings are `plateStatusLine` in `@tappet/core/plates`,
 * imported rather than retyped, so the two clients cannot drift on the one
 * sentence they both print.
 *
 * ⚠ Only ever rendered where there is no photograph. The routes already null
 * the status under a photo, and the callers guard it again: a "drawing"
 * line over an owner's photograph would be the two-voices defect
 * `lib/vehicle-photo.ts` warns about.
 */
export default function PlateStatusLine({
  status,
  frozen = false,
}: {
  status: PlateStatus | null | undefined;
  /** Hold the mark still — the specimen sheet only. */
  frozen?: boolean;
}) {
  const line = plateStatusLine(status);
  if (!line) return null;

  const drawing = status === 'pending' || status === 'generating';

  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole={drawing ? 'progressbar' : 'text'}
      accessibilityLabel={line}
    >
      {drawing ? <WorkingMark ink={register.accent} frozen={frozen} /> : null}
      <Text style={[styles.line, !drawing && styles.absent]} numberOfLines={1}>
        {line}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  /* The state voice: mono caps, off-white — the same line the web's compact face sets. */
  line: { ...type.monoLabel, color: text.primary, flexShrink: 1 },
  /* An absence, quietly. */
  absent: { color: text.muted },
});
