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
} from '@tappet/core/brand';

/**
 * The Well Kept lockup — the data plate.
 *
 * ── One drawing, and the caller picks how much of it ────────────────────────
 *
 * A solid chamfered plate with the W cut through it, and the wordmark beside
 * it. `full` adds the maker line, `short` drops it, `icon` and `mono` are the
 * plate alone. Every one of them is the *same* geometry from
 * `@tappet/core/brand` — there is no reduction ladder and no second drawing,
 * which is the whole reason this file is a third of the length it was.
 *
 * `lockupFor` in core owns the width rule, so a caller passing 90px gets the
 * mark rather than a full lockup with 4px maker type. Both of its thresholds
 * are derived — see its docblock.
 *
 * ── ⚠ The W is a hole, not a letter ────────────────────────────────────────
 *
 * `MARK_PATH` is the plate and the letter in one path, and `fillRule="evenodd"`
 * is what makes the second contour a hole rather than a shape. That is what
 * lets one drawing serve every case: on ivory the same path takes the graphite
 * fill and the ivory shows in the letter, so there is no light-ground *variant*
 * to keep in step.
 *
 * ⚠ Removing the fill rule does not break anything visibly. It fills the W in
 * the plate's own colour, and the result reads as a slightly heavier logo —
 * exactly the class of defect `CLAUDE.md` §6 is about. `brand.test.ts` asserts
 * every drawing carries it.
 *
 * A filled letter would need a second colour, and a second colour is what made
 * the old `favicon-mono.svg` render a featureless blob on a light ground: its
 * plate took `currentColor` while its W was pinned to `#16140F`, so on anything
 * pale both were dark.
 *
 * ── ⚠ No `<text>`, so no font ──────────────────────────────────────────────
 *
 * The wordmark is an outlined path. See `core/brand.ts` for the three separate
 * defects that buys out; the short version is that a `<text>` element in a
 * brand asset has silently changed typeface once already in this repo.
 */

function PlateCut({ fill }: { fill: string }) {
  return <path d={MARK_PATH} fillRule="evenodd" fill={fill} />;
}

export function BrandLockup({
  width = 280,
  variant,
  ground = 'dark',
  className,
}: {
  /** The space available. The drawing is chosen from it unless `variant` says otherwise. */
  width?: number;
  /**
   * Force a drawing. Omit and the width decides — which is the safer default.
   *
   * `icon` is the mark in the ground's ink; `mono` is the same mark in
   * `currentColor`, for places where it is furniture rather than the subject
   * and the caller sets the colour with a text class.
   */
  variant?: 'full' | 'short' | 'icon' | 'mono';
  /**
   * The ground it sits on, which picks the plate's fill. There is no third
   * option: the mark has two non-colours and takes no hue, because cyan is the
   * focus ring and a logo that owned it would be competing with a state.
   */
  ground?: 'dark' | 'light';
  className?: string;
}) {
  const chosen = variant ?? lockupFor(width);
  const ink = ground === 'light' ? BRAND_COLOR.tile : BRAND_COLOR.ink;

  if (chosen === 'icon' || chosen === 'mono') {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${PLATE_GRID} ${PLATE_GRID}`}
        width={width}
        height={width}
        role="img"
        aria-label={BRAND_NAME}
        className={className}
      >
        <PlateCut fill={chosen === 'mono' ? 'currentColor' : ink} />
      </svg>
    );
  }

  const full = chosen === 'full';
  const boxHeight = full ? LOCKUP.heightFull : LOCKUP.heightShort;
  const height = Math.round((width * boxHeight) / LOCKUP.width);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${LOCKUP.width} ${boxHeight}`}
      width={width}
      height={height}
      role="img"
      aria-label={full ? `${BRAND_NAME} by ${MAKER_NAME}` : BRAND_NAME}
      className={className}
    >
      {/*
        The mark is centred on the wordmark's **cap band**, never on the block.
        Centring on the block moved the plate a quarter of a cap height whenever
        the maker line was present, so the same mark sat at two heights
        depending on which lockup you picked. Here the transform is identical in
        both, and the maker line hangs off the wordmark alone.
      */}
      <g transform={`scale(${LOCKUP.markScale})`}>
        <PlateCut fill={ink} />
      </g>
      <path d={WORDMARK_PATH} fill={ink} />
      {full && <path d={MAKER_PATH} fill={ink} opacity={0.6} />}
    </svg>
  );
}

/**
 * The nav treatment: the short lockup at nav scale.
 *
 * ⚠ This used to be a hand-assembled mark-plus-HTML-name, because the mark it
 * replaced was a wide plate with the name engraved *inside* it and shrinking
 * that to fit a 44px bar put the name at about 9px. That argument is spent: the
 * lockup is now a mark beside a free wordmark by construction, so the nav
 * treatment and the short lockup are the same drawing and there is no reason
 * for them to be two.
 *
 * It stays as a named export so four call sites do not each pick a width, and
 * so the nav keeps one obvious thing to import.
 *
 * `size` is the **mark's height** — the same meaning it had when it sized the
 * plate. The rest of the lockup follows from it, because the ratio between the
 * mark and the wordmark is fixed by the brief and is not a caller's to set.
 */
export function BrandWordmark({
  size = 20,
  ground = 'dark',
  className,
}: {
  size?: number;
  ground?: 'dark' | 'light';
  className?: string;
}) {
  return (
    <BrandLockup
      width={Math.round((size * LOCKUP.width) / LOCKUP.mark)}
      variant="short"
      ground={ground}
      className={className}
    />
  );
}

export default BrandLockup;
