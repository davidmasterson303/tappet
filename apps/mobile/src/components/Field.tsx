import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import CutSurface from './CutSurface';

import { FIELD_FONT_MIN, border, brand, cut, space, status, surface, text, type } from '../theme';

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
 *
 * ── ⚠ 12 Sep · focus is cyan, and so is the caret ───────────────────────────
 *
 * The brief's studio paragraph: *"Fields share the geometry, cyan hairline on
 * focus."* B7 gives cyan three jobs — *"focus, active rule and refresh ramp"*
 * — and ends *"no system blue"*. A field here had no focus state at all, and
 * the one thing that did change when it took focus was the caret, which iOS
 * draws in **system blue** unless told otherwise. So the only focus signal on
 * the phone was the one hue the brief bans, and the critique saw it on the
 * service history's search field (round 30).
 *
 * `selectionColor` is the caret *and* the selection on iOS (`cursorColor` is
 * Android's, and is set too so neither platform falls back to its own blue);
 * the stroke steps to `brand.accent` while the input has focus, and back to
 * the hairline on blur. A problem outranks focus: a field that is both wrong
 * and being edited keeps its sodium edge, because that is the signal the
 * sentence beneath it is about.
 */
export default function Field({
  label,
  hint,
  problem,
  style,
  onFocus,
  onBlur,
  ...input
}: {
  label: string;
  /** Quiet helper under the label — units, formats, where a value came from. */
  hint?: string;
  /** What is wrong, in words. Presence of this is what marks the field invalid. */
  problem?: string;
} & Omit<TextInputProps, 'style' | 'placeholderTextColor'> & { style?: TextInputProps['style'] }) {
  const invalid = Boolean(problem);
  const [focused, setFocused] = useState(false);

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
        stroke={invalid ? status.dangerBorder : focused ? brand.accent : border.field}
      >
      <TextInput
        {...input}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        selectionColor={brand.accent}
        cursorColor={brand.accent}
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
  /*
    ── ⚠ 6 Sep · B1: a field is an editable stat cell ────────────────────────

    The label was `type.uiStrong` — sentence-case bold sans — and the critique
    put it beside `StatStrip` on the specimen sheet: the same word, "Mileage",
    set two ways within 200pt of each other, one in the system's voice and one
    in stock-iOS-form voice. A field holds a *value*, so it takes the same mono
    caps eyebrow the strip's cells do.
  */
  label: { ...type.monoLabel, color: text.secondary, textTransform: 'uppercase' },
  /*
    ⚠ 6 Sep · B1: mono caps, like the label it shares a baseline with.

    The previous note here said the hint "stays quiet and uncapped — it qualifies
    the label, it is not one", written while the label was still sentence-case
    sans. Once the label became mono caps that left one row running two type
    systems: OPTIONAL's job is to qualify a value's name, and it sits on the same
    line as one.

    Quiet is still the point — it stays `text.muted` against the label's
    `secondary`, so the hierarchy is carried by ink rather than by face.
  */
  hint: { ...type.monoLabel, color: text.muted, textTransform: 'uppercase' },

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
    /*
      ⚠ Mono, to match the label above it and the strip it mirrors. B1 gives
      mono every value, and what a person types into a field is a value —
      a mileage in proportional sans beside `StatStrip`'s mono "66,000 mi" is
      the same number in two voices.

      ⚠ `fontFamily` only. The size is set by `fontFloor`, which pins 16px
      because iOS zooms a smaller field on focus and never zooms back — putting
      a `fontSize` here would let a caller's `style` land between the two and
      re-open that.
    */
    fontFamily: type.mono.fontFamily,
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
