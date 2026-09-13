import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CONTROL_HEIGHT, space, text, type } from '../theme';
import Button from './Button';

/**
 * The repeated row action — what a row's verb looks like on a list where
 * every row has one.
 *
 * ── The case the one-primary rule leaves open ───────────────────────────────
 *
 * `Button`'s rule is one filled primary per screen. A list of things each of
 * which can be taken — the catalogue's ADD on twenty rows, the Needs list's
 * DONE on every row, the Build ladder's ADD TO WISHLIST — is exactly the case
 * that rule does not answer, and by 13 Sep the phone had answered it three
 * ways on three screens: an outline box beside a ghost word, a ghost word
 * alone on the meta line, and a cyan-bordered box beside a sodium word. The
 * web answers it a fourth way, with a filled primary on every card
 * (`components/MaintenanceItemCard.tsx`), which the phone's rule forbids.
 *
 * David, from his phone, on the catalogue: *"I really don't like the add and
 * learn more CTA's … They're simply unclear, not obvious, not inviting."* The
 * critic, over the same rows, ranked the boxed ADD as on-system and the
 * Needs list's pair as the palette breach. What the two readings agree on is
 * that the row needs **one** control the eye can land on, drawn as a control.
 *
 * ── The pattern ─────────────────────────────────────────────────────────────
 *
 *   - **The act is the secondary, small.** `Button` `outline` at `small`:
 *     48pt, mono caps, off-white hairline, one 45° cut, no fill — the brief's
 *     second treatment (B4), which is what a repeated verb is: not the
 *     screen's primary, and not chrome. It sits at the trailing edge of the
 *     row's **last** line, so the row ends where its control does.
 *   - **One box per row.** A second verb — LEARN MORE, REMOVE — is the ghost
 *     word before it, in the chrome ink (`text.secondary`), so the box is
 *     where the eye lands and the word is the step beneath. Never two boxes,
 *     and never a sodium box on every row: the destructive treatment belongs
 *     to the confirm the word opens (B7 gives sodium one job).
 *   - **Done is a word, not a disabled verb.** Once the act has happened the
 *     box is replaced by a mono state word one step of ink quieter — ON THE
 *     LIST, ADDED — with no glyph (B1: a state is mono, and a check-circle beside
 *     it was the critic's "icon doing the job the system gives to a word").
 *     Nothing stays pressable that has nothing left to do; the word still
 *     carries a spoken sentence so a reader hears what happened.
 *   - **Leading content is the row's own** — the kind chip, a meta line — and
 *     shares the line, centred on the control's height.
 *
 * ⚠ The row itself is not the affordance, on either list. A tap that writes
 * to Needs with no visible verb is a write on a mis-scroll, and a tap that
 * opens the advisor spends a model call (`WishlistAddScreen`, R39). The verb
 * is visible, and it is a box because a bare word was what read as
 * "not obvious" from a phone.
 *
 * Recorded for Design in `docs/design-system-drift.md` §6.17.
 */
export default function RowActions({
  action,
  secondary,
  done,
  doneAccessibilityLabel,
  children,
}: {
  /** The act, drawn as the small secondary. Omitted once `done` names its state. */
  action: {
    label: string;
    /** The spoken name — "Add X to Needs". Eight ADDs are ambiguous to a reader. */
    accessibilityLabel: string;
    onPress: () => void;
    busy?: boolean;
  };
  /** The quieter second verb, as the ghost word before the box. */
  secondary?: {
    label: string;
    accessibilityLabel: string;
    onPress: () => void;
  };
  /**
   * The state word that replaces the act once it has happened — ADDED, the
   * app's one word for it. ⚠ A word the box's column can hold: a longer one
   * moves the verb before it (see `styles.done`).
   */
  done?: string | null;
  /** What a reader hears for the state word — "X is on Needs". */
  doneAccessibilityLabel?: string;
  /** The row's own leading content — its kind chip, a meta line. */
  children?: ReactNode;
}) {
  return (
    <View style={styles.line}>
      <View style={styles.leading}>{children}</View>

      {secondary ? (
        <Button
          label={secondary.label}
          variant="ghost"
          size="small"
          accessibilityLabel={secondary.accessibilityLabel}
          onPress={secondary.onPress}
        />
      ) : null}

      {done ? (
        <Text style={styles.done} accessibilityLabel={doneAccessibilityLabel ?? done}>
          {done}
        </Text>
      ) : (
        <Button
          label={action.label}
          variant="outline"
          size="small"
          busy={action.busy}
          /*
            The bare mark: the control is fitted to its word, and a status
            painted over "ADD" would clip. `Button` explains the busy form.
          */
          busyLabel=""
          accessibilityLabel={action.accessibilityLabel}
          onPress={action.onPress}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /*
    One line, the control's height, everything centred on it. The leading
    content takes what is left so the box always ends at the row's trailing
    edge — the rule the numerals follow one line up (B6).
  */
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: CONTROL_HEIGHT,
  },
  leading: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm },
  /*
    The state word: the ghost's voice in `text.muted` — the Due row's ADDED,
    one step under the ghost verb beside it, so a row that is done does not
    read as a row with two verbs. It is a state, not a control, and its ink
    says so.

    ⚠ 13 Sep · it holds the box's column. Round 39 measured what "On the
    list" did to the row it replaced ADD on: wider than the box, it pushed
    LEARN MORE 64pt left, and its own inset stopped it 12pt short of the
    rule — the column the values and the boxes hold broke on exactly the
    rows just touched. So the word is at least the box's width, flush right
    with no trailing inset, and the caller's word is one the column can
    hold: ADDED, five letters, the app's one word for that state.
  */
  done: {
    ...type.monoLabel,
    color: text.muted,
    minWidth: CONTROL_HEIGHT,
    textAlign: 'right',
    lineHeight: CONTROL_HEIGHT,
  },
});
