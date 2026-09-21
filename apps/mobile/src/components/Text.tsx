import { forwardRef } from 'react';
import {
  PixelRatio,
  Text as RNText,
  TextInput as RNTextInput,
  StyleSheet,
  type TextInputProps,
  type TextProps,
  type TextStyle,
} from 'react-native';

/**
 * The app's text, and the one place the person's text size is applied.
 *
 * ── The finding (21 Sep, on the device) ─────────────────────────────────────
 *
 * David set Larger Text one notch up, then one down, and both times "the app
 * looked totally broken". Reproduced on the simulator at xxx-Large: "Maple
 * Street Auto" cut off at the top of its row, "$345" clipped to "$34", the
 * button reading "OPEN THE ORIGINAL I", the tab labels "GARAG / SERVI / PLA".
 * Every row here has a designed height — the spec row, the binnacle cell,
 * the 44pt control, the tab bar — and React Native's default (`allowFontScaling`)
 * grows the glyphs by the system multiplier while the rows stay put. At
 * accessibility sizes that multiplier is 1.6–3.1×; nothing survives it.
 *
 * ── What this does, and the cap it admits to ────────────────────────────────
 *
 * `Text` and `TextInput` from here scale their own `fontSize` and `lineHeight`
 * by the system multiplier, **clamped to [1, 1.35]** — the largest non-
 * accessibility setting (xxx-Large) — with the platform's own scaling turned
 * off. So Larger Text is honoured through the whole standard range, where the
 * designed rows have room (they were drawn with ~1/3 slack); a smaller setting
 * keeps the design size rather than shrinking 12pt mono to 10; and the
 * accessibility sizes are held at 1.35 rather than breaking every screen. That
 * last is a deliberate cap and a real limitation: the honest version of AX
 * support is a layout that reflows — rows that stack, cells that wrap — and
 * that is a design decision the system does not have yet. Until it does, a
 * page that stays legible at ×1.35 beats one that is illegible at ×2.
 *
 * ⚠ Scaled here, not per style: `lineHeight` must grow with `fontSize` or the
 * glyphs clip at the row, which is exactly the shipped defect. A style with
 * no `fontSize` (the platform default) is left to the platform.
 *
 * `typeScale()` is exported for the few places that size a box to its text
 * (the binnacle's cells, the dial's figure) so they can grow with it.
 */

export const TYPE_SCALE_MAX = 1.35;

/** The multiplier applied to every size in the app: the system's, clamped. */
export function typeScale(): number {
  const system = PixelRatio.getFontScale();
  if (!Number.isFinite(system) || system <= 1) return 1;
  return Math.min(TYPE_SCALE_MAX, system);
}

function scaled(style: TextProps['style'], scale: number): TextProps['style'] {
  if (scale === 1) return style;
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const grown: TextStyle = {};
  if (typeof flat.fontSize === 'number') grown.fontSize = Math.round(flat.fontSize * scale * 2) / 2;
  if (typeof flat.lineHeight === 'number') grown.lineHeight = Math.round(flat.lineHeight * scale * 2) / 2;
  return [style, grown];
}

const Text = forwardRef<RNText, TextProps>(function Text({ style, ...rest }, ref) {
  return <RNText ref={ref} {...rest} allowFontScaling={false} style={scaled(style, typeScale())} />;
});

export default Text;

export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput({ style, ...rest }, ref) {
  return <RNTextInput ref={ref} {...rest} allowFontScaling={false} style={scaled(style, typeScale())} />;
});
