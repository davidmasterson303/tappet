import { View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';

import {
  BRAND_COLOR,
  BRAND_NAME,
  LOCKUP,
  MAKER_NAME,
  MAKER_PATH,
  MARK_PATH,
  PLATE_GRID,
  WORDMARK_PATH,
  lockupFor,
} from '@wellkept/core/brand';

/**
 * The Well Kept lockup, native cut.
 *
 * ── The same numbers as the web, imported rather than copied ────────────────
 *
 * Every value comes from `@wellkept/core/brand`, which `brand.test.ts` pins
 * against the brand package's own SVGs. The mark this app draws and the mark
 * the web draws cannot differ, which is the failure the old dial had — its path
 * data lived in two `Logo.tsx` files kept in step by eye.
 *
 * ── ⚠ This component no longer loads a font, and that closes a real gap ────
 *
 * The wordmark and the W are **outlined paths**. `design-system-drift.md` §6.1
 * rules that the phone's condensed slot is Archivo **Narrow**, because React
 * Native cannot drive a `wdth` axis — a different family whose metrics are its
 * own and will not match web glyph for glyph. That constraint applied to every
 * `<SvgText>` this file used to draw, and it is why the previous version of
 * this component had a long docblock about which Newsreader cut to name.
 *
 * An outline is geometry, not text. Both platforms now render the identical
 * drawing with no font loaded at all, even while body and display type
 * legitimately diverge.
 *
 * Two consequences worth stating, because both were previously logged as drift:
 *
 * - The `font-variant: small-caps` departure is gone. There is no small-caps to
 *   fake, because there is no lowercase and no text.
 * - `Newsreader_500Medium` was bundled *for this component* and is no longer
 *   reachable from it. It has been dropped from `theme/fonts.ts`.
 *
 * ⚠ The general rule still holds everywhere else in this app: `fontFamily` is
 * the **face name**, never a weight prop. `fontWeight: '600'` without a family
 * renders San Francisco, and half-applied it reads as a design decision.
 */

/**
 * The plate and the letter in one path, the letter knocked out by fill rule.
 *
 * ⚠ `fillRule` is load-bearing and its absence is silent: without it the W
 * fills in the plate's colour and the mark just looks heavier. It is also why
 * this is a path rather than a `<Mask>` — one element, drawn identically here
 * and on the web, with no id to collide.
 */
function PlateCut({ fill }: { fill: string }) {
  return <Path d={MARK_PATH} fillRule="evenodd" fill={fill} />;
}

export default function BrandLockup({
  width = 200,
  variant,
  ground = 'dark',
}: {
  width?: number;
  /** Omit and the width picks the drawing, which is the safer default. */
  variant?: 'full' | 'short' | 'icon';
  ground?: 'dark' | 'light';
}) {
  const chosen = variant ?? lockupFor(width);
  const ink = ground === 'light' ? BRAND_COLOR.tile : BRAND_COLOR.ink;

  if (chosen === 'icon') {
    return (
      <View accessibilityRole="image" accessibilityLabel={BRAND_NAME}>
        <Svg width={width} height={width} viewBox={`0 0 ${PLATE_GRID} ${PLATE_GRID}`}>
          <PlateCut fill={ink} />
        </Svg>
      </View>
    );
  }

  const full = chosen === 'full';
  const boxHeight = full ? LOCKUP.heightFull : LOCKUP.heightShort;
  const height = Math.round((width * boxHeight) / LOCKUP.width);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={full ? `${BRAND_NAME} by ${MAKER_NAME}` : BRAND_NAME}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${LOCKUP.width} ${boxHeight}`}>
        {/*
          The mark is centred on the wordmark's cap band in both lockups — one
          rule, so the plate does not move when the maker line appears.
        */}
        <G transform={`scale(${LOCKUP.markScale})`}>
          <PlateCut fill={ink} />
        </G>
        <Path d={WORDMARK_PATH} fill={ink} />
        {full && <Path d={MAKER_PATH} fill={ink} opacity={0.6} />}
      </Svg>
    </View>
  );
}
