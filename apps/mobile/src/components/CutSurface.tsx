import { useState, type ReactNode } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

/**
 * The 45° panel cut, which is this system's corner.
 *
 * ── Why this is a component and not a style ─────────────────────────────────
 *
 * On web the cut is one line — `clip-path: polygon(...)` — and `globals.css`
 * carries five of them. **React Native has no `clip-path` and no `polygon()`.**
 * There are three ways to get a cut corner here and only one of them is honest:
 *
 *   - A rotated square in the page colour, laid over the corner. Cheap, and it
 *     lies the moment anything is behind the surface — a photograph, the bay
 *     gradient, a scroll. It paints a hole in the shape of the background it
 *     assumed.
 *   - `@react-native-masked-view`. Correct, and a **native module**, so it
 *     costs an EAS cloud build out of a budget of roughly fifteen a month
 *     (`CLAUDE.md` §9). Not worth it for a corner.
 *   - An SVG path sized to the box. `react-native-svg` is already a dependency,
 *     it composites over anything, and the same path carries the hairline.
 *
 * So: SVG. The shape is drawn *behind* the children rather than clipping them,
 * which is a real difference from web worth knowing — content that overflows
 * the cut corner will not be trimmed. Nothing in the brief puts content in a
 * corner, and the alternative was the build.
 *
 * ── ⚠ One frame of no background, and why that is the right trade ───────────
 *
 * The path needs the box's measured size, so it renders on the layout pass
 * after the first. For one frame a `CutSurface` is its children on whatever is
 * behind them.
 *
 * The alternative — a `backgroundColor` fallback under the SVG — is worse than
 * it sounds: it would show **square corners** for that frame, so every surface
 * in the app would pop from rounded-off to cut on mount. A single frame of
 * transparency reads as nothing; a frame of the wrong geometry reads as a bug,
 * and on a slow list it reads as the old design flashing through.
 *
 * ── The zero-radius rule this exists to serve ───────────────────────────────
 *
 * Locked brief B4: *"Every container corner is a 45° cut at zero radius —
 * buttons, fields, chips, bubbles, composer; no capsules or pills."* The
 * `radius` scale in `theme/index.ts` is what this replaces. A surface that
 * still reaches for `radius.card` is not a style preference any more, it is a
 * brief breach.
 */

export type CutCorner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

/**
 * Build the polygon, clockwise from the top-left.
 *
 * Exported because `cut-geometry.test.ts` asserts the shape rather than
 * asserting that a component rendered — a path string that silently came back
 * as a plain rectangle is exactly the vacuous green `CLAUDE.md` §5 collects.
 */
export function cutPath(width: number, height: number, size: number, corners: CutCorner[]): string {
  const c = Math.max(0, Math.min(size, Math.min(width, height) / 2));
  const has = (corner: CutCorner) => corners.includes(corner);
  const points: Array<[number, number]> = [];

  if (has('topLeft')) points.push([c, 0]);
  else points.push([0, 0]);

  if (has('topRight')) points.push([width - c, 0], [width, c]);
  else points.push([width, 0]);

  if (has('bottomRight')) points.push([width, height - c], [width - c, height]);
  else points.push([width, height]);

  if (has('bottomLeft')) points.push([c, height], [0, height - c]);
  else points.push([0, height]);

  if (has('topLeft')) points.push([0, c]);

  return `${points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x} ${y}`).join(' ')} Z`;
}

export default function CutSurface({
  cut = ['bottomRight'],
  size = 12,
  fill,
  stroke,
  strokeWidth = 1,
  style,
  children,
  ...rest
}: {
  /** Which corners carry the cut. One is the system default; two is a decision. */
  cut?: CutCorner[];
  /** The cut's leg, in points. 8 on the plate, 12 on a control. */
  size?: number;
  /** The surface colour. Omit for an outline-only shape. */
  fill?: string;
  /** The hairline. Omit for a fill-only shape. */
  stroke?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  /*
    ⚠ Everything else a `View` takes, forwarded — accessibility above all.

    Without this the props were swallowed: `DialChip` moved onto the cut and its
    `accessibilityRole` / `accessibilityLabel` simply stopped compiling, and the
    tempting fix is a wrapper `View` around every call site. That would work and
    it would also mean the *next* control to take the cut silently loses its
    label to the same gap, which is the failure mode this repo cares most about
    — a screen reader announcing nothing looks identical to one announcing
    correctly, from the outside.
  */
} & Omit<ViewProps, 'style' | 'children'>) {
  const [box, setBox] = useState<{ width: number; height: number } | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (box && box.width === width && box.height === height) return;
    setBox({ width, height });
  };

  return (
    <View
      {...rest}
      style={style}
      onLayout={onLayout}
      /*
        ⚠ **Declares this surface to the contrast audit.** `src/test-support/
        contrast.ts` finds the ground under a string by reading `backgroundColor`
        down the tree, and this component's ground is an SVG path — invisible to
        that walk. Without this prop every string on a cut surface would be
        measured against whatever sits *behind* the control, silently, and would
        pass at a ratio it does not achieve.

        It is inert at runtime: React Native ignores props it does not know on a
        `View`. Its only reader is the audit.
      */
      auditSurface={fill}
    >
      {box && box.width > 0 && box.height > 0 ? (
        <Svg
          width={box.width}
          height={box.height}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        >
          <Path
            d={cutPath(box.width, box.height, size, cut)}
            fill={fill ?? 'none'}
            stroke={stroke}
            strokeWidth={stroke ? strokeWidth : undefined}
          />
        </Svg>
      ) : null}
      {children}
    </View>
  );
}
