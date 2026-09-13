import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, type StyleProp, type ViewStyle } from 'react-native';

import { FIELD_FONT_MIN, TARGET_MIN, border, brand, cut, space, surface, text } from '../theme';
import { interFace } from '../theme/fonts';
import CutSurface from './CutSurface';
import Icon from './Icon';

/**
 * A list's search box.
 *
 * ── Why this is a primitive, which is a correction ──────────────────────────
 *
 * The History screen hand-rolled its search box on 6 Sep and, over the next
 * week, gave it what the brief asks of a field one finding at a time: the
 * 45° cut (B4, after the critique kept finding "the search field is square"
 * once `Field` had been fixed and this had not), the cyan hairline on focus
 * and the cyan caret (B7, after the critique saw iOS's own blue in the
 * search frame). The catalogue hand-rolled its own and got none of it — a
 * square `View` with a `borderWidth`, grey under focus, blue-careted — and
 * round 38 found the same three defects on the second screen, fixed on the
 * first. That is the private-copy failure the primitive set exists to end;
 * `Button`'s docblock says why in the same words. One component, both lists.
 *
 * ── What it is ──────────────────────────────────────────────────────────────
 *
 * A `Field` without a label: the well fill, `border.field` at rest, the
 * accent while focused, the caret and selection in the accent so the one
 * thing that changes on focus is never the hue the brief bans, the search
 * glyph leading, and a clear control once there is something to clear. The
 * type sits at `FIELD_FONT_MIN` — under 16px iOS zooms on focus and never
 * back.
 *
 * ⚠ Not `Field` itself: a search is not a labelled reading, and giving it a
 * label slot it leaves empty would put the field's grammar (label above,
 * value below) on a control that has neither.
 */
export default function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  clearAccessibilityLabel = 'Clear the search',
  style,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** The spoken name — what is being searched: "Search this service history". */
  accessibilityLabel: string;
  clearAccessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <CutSurface
      style={[styles.field, style]}
      cut={['bottomRight']}
      size={cut.control}
      fill={surface.well}
      stroke={focused ? brand.accent : border.field}
    >
      <Icon name="search" size={17} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        selectionColor={brand.accent}
        cursorColor={brand.accent}
        placeholder={placeholder}
        placeholderTextColor={text.muted}
        accessibilityLabel={accessibilityLabel}
        autoCorrect={false}
        returnKeyType="search"
      />
      {value.length > 0 ? (
        <Pressable
          onPress={() => onChangeText('')}
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel}
          style={styles.clear}
        >
          <Icon name="x" size={16} />
        </Pressable>
      ) : null}
    </CutSurface>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: TARGET_MIN,
    paddingHorizontal: space.md,
    /* ⚠ Ground and border are `CutSurface`'s; a fill or a `borderWidth` here squares the cut. */
  },
  /** Pinned at the field floor: under 16px iOS zooms on focus and never back. */
  input: {
    flex: 1,
    color: text.primary,
    fontFamily: interFace('400'),
    fontSize: FIELD_FONT_MIN,
    paddingVertical: space.sm,
  },
  clear: { minHeight: TARGET_MIN, justifyContent: 'center', paddingLeft: space.xs },
});
