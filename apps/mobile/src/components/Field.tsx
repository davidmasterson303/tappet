import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import CutSurface from './CutSurface';

import { FIELD_FONT_MIN, border, cut, space, status, surface, text, type } from '../theme';

/**
 * A labelled text input.
 *
 * ── 16px is not a preference ────────────────────────────────────────────────
 *
 * `fontSize` is pinned at the system's field floor and is **not** overridable
 * through `style`. Under 16px iOS zooms the page on focus and does not zoom
 * back, which strands someone mid-form at 1.3× with no way out but a reload —
 * on a form that may be writing permanent service history.
 *
 * It is a floor rather than a fixed size in principle, but there is no case yet
 * for a larger field, so the prop does not exist until there is one.
 *
 * ── A placeholder is not a label ────────────────────────────────────────────
 *
 * VoiceOver reads a placeholder as the field's *value* when the field is empty,
 * and once someone types it is gone entirely — so a screen-reader user
 * re-reading the form finds unlabelled boxes containing their own data. The
 * visible `label` is therefore also the accessible name, and a placeholder is
 * optional flavour on top.
 *
 * ⚠ Placeholder ink is `text.muted` and cannot go quieter. Nine placeholders in
 * this app shipped between 25% and 35% white — all below the 50% floor, all
 * invisible to every guard, because a JSX prop is not a StyleSheet entry.
 *
 * ── `problem` is described, not just coloured ───────────────────────────────
 *
 * The red edge is the second signal, never the only one. A colour-blind user
 * gets the sentence; everyone gets `accessibilityInvalid`.
 */
export default function Field({
  label,
  hint,
  problem,
  style,
  ...input
}: {
  label: string;
  /** Quiet helper under the label — units, formats, where a value came from. */
  hint?: string;
  /** What is wrong, in words. Presence of this is what marks the field invalid. */
  problem?: string;
} & Omit<TextInputProps, 'style' | 'placeholderTextColor'> & { style?: TextInputProps['style'] }) {
  const invalid = Boolean(problem);

  return (
    <View style={styles.wrap}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>

      {/*
        ── ⚠ 6 Sep · B4: a field carries the same cut as a button ──────────────

        B4 names fields explicitly — *"buttons, fields, chips, bubbles,
        composer"* — and the critique found the search field, the composer and
        the delete-confirmation field square in three consecutive rounds.

        `CutSurface` paints the ground and the 45° corner behind the input; the
        `TextInput` above it goes transparent so the SVG shows through. That is
        the same arrangement `Button` uses, and it has the same consequence for
        the contrast audit: `CutSurface` declares its own ground with
        `auditSurface`, without which every field's typed ink would be measured
        against the page rather than against the well it actually sits on.
      */}
      <CutSurface
        cut={['bottomRight']}
        size={cut.control}
        fill={surface.well}
        stroke={invalid ? status.dangerBorder : border.field}
      >
      <TextInput
        {...input}
        /*
          The hint is part of the name, not decoration beside it.

          ⚠ It was visible and **unspoken** until 16 Aug. A field labelled
          "Mileage at last oil change" with "optional" sitting next to it told a
          sighted reader it could be skipped and told a screen-reader user
          nothing — so the one group most likely to abandon a long form got the
          version with no way out. Both now hear "Mileage at last oil change,
          optional".

          A comma rather than a space: it is how the platform reads a pause, and
          "Trim optional" is a different phrase from "Trim, optional".
        */
        accessibilityLabel={hint ? `${label}, ${hint}` : label}
        aria-invalid={invalid}
        placeholderTextColor={text.muted}
        /*
          `fontFloor` comes **after** the caller's style, and that order is the
          whole guarantee. The first version of this put `style` last and the
          docblock above claimed the opposite — a caller passing
          `{ fontSize: 11 }` won, which is precisely the zoom trap this is
          supposed to make unreachable. `primitives.test.tsx` probes it.
        */
        style={[styles.input, invalid && styles.inputBad, style, styles.fontFloor]}
      />
      </CutSurface>

      {problem ? (
        <Text style={styles.problem} accessibilityLiveRegion="polite">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  label: { ...type.uiStrong, color: text.secondary },
  hint: { ...type.label, letterSpacing: 0, color: text.muted },

  input: {
    /*
      ── ⚠ 6 Sep · B4: a field shares the control geometry ────────────────────

      B4 names fields explicitly: *"Every container corner is a 45° cut at zero
      radius — buttons, fields, chips, bubbles, composer."* The radius scale is
      already zeroed, so this was a square box; the cut itself is drawn by
      `CutSurface` in the component below.

      ⚠ **The fill stays a `backgroundColor` here, unlike `Button`.** A field
      contains a `TextInput` whose ink the contrast audit measures against this
      surface, and the audit walks `backgroundColor` down the ancestor chain.
      `CutSurface` declares its ground with `auditSurface` for exactly that
      reason — but a field is the one control where the *typed text* is the
      thing that must stay legible, so it keeps the property the audit reads
      natively and the cut is drawn over it. Belt and braces, deliberately.
    */
    /*
      ⚠ Transparent: `CutSurface` paints the well and the cut behind this input.
      A `backgroundColor` here would square off the corner the SVG just cut.
    */
    backgroundColor: 'transparent',
    paddingHorizontal: space.md,
    minHeight: 48,
    color: text.primary,
  },
  /** Applied last in the array, so no caller style can lower it. */
  fontFloor: { fontSize: FIELD_FONT_MIN },
  /*
    ⚠ The invalid state moved to `CutSurface`'s `stroke`; the border it used to
    override no longer exists. Kept as a no-op rather than deleted so the call
    sites keep compiling — and so this note is here when someone wonders why
    an invalid field still turns sodium with nothing in this style saying so.
  */
  inputBad: {},

  problem: { ...type.value, color: status.dangerText },
});
