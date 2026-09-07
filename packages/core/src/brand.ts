/**
 * The Tappet mark, as data — so the two clients cannot draw different plates.
 *
 * ⛔ **The artwork still draws the old name.** The 7 Sep rename moved every
 * string; the outlines in `./brand-geometry.ts` were deliberately left alone,
 * so the plate is cut with a **W** and the wordmark spells **WELL KEPT**. The
 * letter becomes a T and the wordmark one word when the package is regenerated
 * — David's design-critic round, after the rename. Read that file's header
 * before reasoning about anything below.
 *
 * ── The mark ────────────────────────────────────────────────────────────────
 *
 * A **data plate**: every car carries one stamped plate that *is* its record,
 * on the door jamb. This is that plate in the house chamfer geometry, with a
 * single **W cut clean through it**, so whatever sits behind the plate shows in
 * the letter.
 *
 * ⚠ **`MARK_PATH` must be drawn with `fill-rule="evenodd"`, and only that.**
 * The plate and the letter are one path; the fill rule is what turns the second
 * contour into a hole. Drop it — or split the path back into two elements — and
 * the W fills solid in the plate's own colour, which does not look like a bug.
 * It looks like a slightly heavier logo.
 *
 * A `<mask>` was the obvious way to write this and it is the wrong one: masks
 * need document-global ids that collide when two copies are inlined, and Satori
 * (which renders `app/opengraph-image.tsx`) supports `<path>` and little else —
 * failing, when it does not, with a 200 and a zero-byte body.
 *
 * That one rule does the work of five, and it is why this module is a third the
 * size of the one it replaced:
 *
 * - **Both polarities are one drawing.** Off-white plate on graphite, graphite
 *   plate on ivory. Nothing is redrawn, so nothing can drift out of step.
 * - **There is no reduction ladder.** The mark it replaced needed four drawings
 *   — full, single-W, flat, and an inverted 29 — and which one you got depended
 *   on the size floor it cleared. This is one drawing at every size, including
 *   a 16px favicon.
 * - **It survives a photograph.** On a launch card the wet asphalt shows
 *   through the W, so the mark sits *in* the image rather than covering it.
 *
 * The mark carries **no hue**. Cyan and sodium are light in this system, and
 * light belongs to photography and to UI state — `--ring` is cyan, and a logo
 * that owned cyan would be competing with the focus ring. A glowing badge
 * promises; a stamped plate reports, which is `advice-range.ts`'s argument
 * carried into the identity.
 *
 * Provenance: `docs/brand-package-v2/`, produced by the design-critic loop in
 * `design-loop/logo/` (gitignored). The frozen brief is that package's
 * `BRIEF.md`; the deviations Design has to absorb are `design-system-drift.md`
 * §12.
 *
 * ── Why the geometry lives in core ──────────────────────────────────────────
 *
 * One set of numbers, imported twice. A change to the plate is a change to both
 * clients by construction. `Icon.tsx` carries the rule *"do not redraw or
 * approximate"* because a hand-copied Lucide glyph drifts, and the old dial
 * mark's path lived in two `Logo.tsx` files that had to be kept in step by eye.
 *
 * ⚠ **The paths are generated, not transcribed.** They live in
 * `./brand-geometry.ts`, emitted by `docs/brand-package-v2/build.py` from the
 * variable font instanced at an exact axis position and shaped through
 * HarfBuzz. `lib/__tests__/brand.test.ts` reads the package's own SVGs and
 * fails on a disagreement in either direction.
 *
 * ── ⚠ There is no font dependency, and that is load-bearing ────────────────
 *
 * The wordmark and the W are **outlined paths**, not `<text>`. Three things
 * follow, and each of them was a live defect before:
 *
 * 1. A rasteriser without the webfont silently substitutes and the W changes
 *    shape. Design's first package shipped every SVG declaring
 *    `font-family="Newsreader, Georgia, serif"` and asked, in its README, for
 *    the type to be outlined at export. It never was, which is why
 *    `app/favicon.ico` and `app/apple-icon.png` sat on the *previous* logo for
 *    a fortnight — regenerating them needed a rasteriser with Newsreader.
 * 2. The lockup's font stack silently changed typeface. Each `<text>` read
 *    `var(--font-display), Newsreader, Georgia, serif`, which was correct until
 *    brief B2 moved the display slot to Archivo — from that moment the brand
 *    mark rendered in a face it was never drawn in, on every page.
 * 3. React Native cannot drive a `wdth` axis, so `design-system-drift.md` §6.1
 *    rules that the phone gets Archivo **Narrow** — a different family whose
 *    metrics will not match web's. An outlined path sidesteps that entirely:
 *    both clients draw the identical geometry with no font loaded at all.
 */

export {
  BRAND_COLOR,
  ICON,
  LOCKUP,
  MAKER_PATH,
  MARK_PATH,
  PLATE_CHAMFER,
  PLATE_GRID,
  PLATE_PATH,
  TYPE_SOURCE,
  WORDMARK_PATH,
  W_PATH,
} from './brand-geometry';

import { LOCKUP, TYPE_SOURCE } from './brand-geometry';

/** The word on the plate. Set in capitals — the wordmark has no lowercase. */
export const BRAND_NAME = 'Tappet';

/** The maker, and the only string in the lockup that is not the name. */
export const MAKER_NAME = 'Southmoor Digital';

/**
 * Clear space: **one mark height on all sides**, so 20 grid units.
 *
 * Stated against the mark rather than as a fixed number, because a fixed number
 * has to be re-derived every time the lockup's grid changes and this does not.
 * Nothing enters it, including the score dial.
 */
export const CLEAR_SPACE = LOCKUP.mark;

/**
 * ⚠ Below these widths a lockup stops being legible, and the fallback is not
 * "shrink it". Both numbers are derived, not chosen:
 *
 * - **`short` is 140** because that is the nav budget the brief sets, and at
 *   140px the wordmark's cap height is exactly the 20px floor it also sets.
 *   Narrower and the name goes under the floor, so the mark takes over alone.
 * - **`full` is 204** because that is where the maker line reaches this
 *   project's 12px text floor. The maker sets at `makerCap / capPerEm` =
 *   {@link LOCKUP.makerCap} / {@link TYPE_SOURCE.mono.capPerEm} = 8.22 grid
 *   units, which renders at `8.22 × W / LOCKUP.width` px; solving for 12 gives
 *   203.7. Below it the maker line is dropped, which is what `short` is for.
 *
 * `MAKER_FLOOR_PX` is exported so the test can re-derive the 204 rather than
 * restate it — a guard that repeats a number cannot catch the number being
 * wrong.
 */
export const MAKER_FLOOR_PX = 12;

export const MIN_WIDTH = {
  full: Math.ceil(
    (MAKER_FLOOR_PX * LOCKUP.width) / (LOCKUP.makerCap / TYPE_SOURCE.mono.capPerEm)
  ),
  short: 140,
} as const;

/**
 * Which drawing a given width can carry.
 *
 * Exported so a caller picks by the space it has rather than by guessing, and
 * so the rule is enforced in one place instead of remembered at each call site.
 */
export function lockupFor(width: number): 'full' | 'short' | 'icon' {
  if (width >= MIN_WIDTH.full) return 'full';
  if (width >= MIN_WIDTH.short) return 'short';
  return 'icon';
}
