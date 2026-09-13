/**
 * The vehicle hero's geometry, mirrored from `tokens/hero.css`.
 *
 * ── Why these are named exports and not literals at the call site ───────────
 *
 * The handoff is explicit: *"All constants live in `tokens/hero.css`; mirror
 * them into `apps/mobile/src/theme/` … as named exports so both sides read one
 * set of numbers. Do not inline literals at the call site."*
 *
 * The web implementation of the same geometry is in that CSS file. Two clients
 * describing one motion with two sets of numbers is the drift the token layer
 * exists to close, and it is worse here than usual because the numbers are
 * **related to each other** — the title's fade span is chosen against the nav's
 * fade start, and the dial's rate is chosen against the sheet's overlap. Change
 * one in isolation and the design stops holding without anything failing.
 *
 * ── ⚠ The dial is gone, and so is the rule that governed it ────────────────
 *
 * This module opened with a long argument about the health dial's flight: it
 * belonged to neither plane, climbed at 1.6× so it docked before the sheet edge
 * arrived, and crossfaded into a nav chip. That was the hardest part of the
 * design and it worked.
 *
 * It was removed on 23 Aug on David's call: *"the animation is fun but info is
 * redundant and it might cover an important part of the car image people care
 * about."* The photograph is the only place an owner sees their own car, and a
 * 160pt plinth sat over the roofline of most 3:4 phone snapshots.
 *
 * So `HERO_DIAL_RATE`, `dialFlight`, `dialClearsSheet` and the layering
 * invariant are all deleted rather than left dormant. **There is no travelling
 * instrument left to collide with the sheet**, so a guard about that collision
 * would be a test with nothing to fail on — the kind that stays green forever
 * and gets mistaken for coverage. The score lives in the nav chip, which does
 * not move.
 *
 * What remains is the pullback itself: a pinned hero whose contents drift at a
 * third of scroll speed under a sheet that rises over them.
 */

/* ── Rates and spans ──────────────────────────────────────────────────────── */

/** The hero's contents drift at a third of scroll speed. */
export const HERO_PARALLAX_RATE = 0.35;
/** How much the photograph pulls back over the dim's full span. */
export const HERO_SCALE_GAIN = 0.14;
/**
 * The photograph is over-rendered by this much at top and bottom.
 *
 * ⚠ Not optional. RN scales about the centre, so at `HERO_SCALE_GAIN` the image
 * grows ~7% each way — 37pt at the tallest supported hero. Without the bleed
 * the photograph's top edge walks into frame at the end of the drift.
 */
export const HERO_IMAGE_BLEED = 60;
/** How far the sheet rests **onto** the hero at zero scroll. */
export const HERO_SHEET_OVERLAP = 48;

export const HERO_DIM_REST = 0.06;
export const HERO_DIM_MAX = 0.78;
export const HERO_DIM_SPAN = 340;

/**
 * The hero title fades over this, and the nav title arrives at
 * `HERO_NAV_FADE_START`.
 *
 * ⚠ These two are a pair. The hero name must be gone **before** the nav name
 * appears — two legible copies of the same string on one screen is what the
 * stagger avoids. Change one and change the other; `heroTitleClearsNavTitle`
 * exists so a test can hold the relationship rather than the numbers.
 */
export const HERO_TITLE_FADE_SPAN = 210;
export const HERO_NAV_FADE_START = 300;
export const HERO_NAV_FADE_SPAN = 120;

/* ── The frame ────────────────────────────────────────────────────────────── */

/** Below this hero height the plinth and the title stop fitting. See `heroBands`. */
export const HERO_COMPACT_BELOW = 500;

/**
 * Height of the pinned hero. Mirrors `--hero-h: clamp(400, 62svh, 560)`.
 *
 * ⚠ Same shape as `bayHeroHeight` in `BayRoom.tsx` and deliberately different
 * numbers, because the two heroes are different objects: **that one is a room
 * behind a dial and this one is the subject.** The garage bay clamps 168–240
 * because a 164pt instrument has to clear it; this clamps 400–560 because the
 * photograph *is* the screen and the content sheet covers it on demand.
 */
export function detailHeroHeight(windowHeight: number): number {
  return Math.round(Math.min(560, Math.max(400, windowHeight * 0.62)));
}

export interface HeroBands {
  /** `true` on a display too short for the full-size plinth and title. */
  compact: boolean;
  titleSize: number;
  /** Distance from the hero's bottom edge to the identity block's baseline box. */
  titleAnchor: number;
}

/**
 * Which of the two layouts this hero height gets.
 *
 * ── ⚠ A threshold, not a continuous scale ──────────────────────────────────
 *
 * The handoff's reasoning, and it is the part worth keeping: *"a continuously
 * shrinking instrument becomes unreadable somewhere in the middle of its range
 * and nobody notices which display that was. Two sizes can both be checked."*
 *
 * Below `HERO_COMPACT_BELOW` the bands genuinely do not fit — a 4.7″ display
 * gives a 414pt hero, where a 160pt plinth ends at 318 and a two-line 36pt
 * title anchored 86 off the bottom starts at 224. They overlap by 94pt and no
 * nudging fixes it, because the content is taller than the frame.
 *
 * ⚠ In practice only the 4.7″ display takes the compact branch. The mini
 * (812pt → 503) clears the threshold by 3pt, which is worth knowing before
 * anyone edits the clamp in `detailHeroHeight`.
 */
export function heroBands(heroHeight: number): HeroBands {
  const compact = heroHeight < HERO_COMPACT_BELOW;

  return compact
    ? {
        compact,
        titleSize: 28,
        titleAnchor: 66,
      }
    : {
        compact,
        titleSize: 36,
        titleAnchor: 86,
      };
}

/**
 * Where the nav title starts to arrive, for this hero and this identity block.
 *
 * ── 13 Sep · derived from the sheet covering the name, floored at the constant ─
 *
 * `HERO_NAV_FADE_START` is a scroll offset chosen for a tall hero and a long
 * sheet: by 300pt the sheet has slid under the nav and the car's name, gone
 * from the hero since 210, comes back in mono. The binnacle's sheet is
 * short, and every point of travel it does not need is a point of empty
 * sheet the scroll has to be padded with (`sheetMinHeight`). So the title is
 * allowed to arrive **as soon as the sheet has covered the identity block**
 * — the moment there is no name left on the hero to argue with — which is
 * earlier than 300 for any block under ~200pt tall, on every phone.
 *
 * The block sits `titleAnchor` above the hero's foot and drifts up at
 * `HERO_PARALLAX_RATE` while the sheet, starting `HERO_SHEET_OVERLAP` onto
 * the hero, rises at full rate; they meet at the block's top when
 * `s(1 − rate) = titleAnchor + identityHeight − overlap`. Never earlier than
 * `HERO_TITLE_FADE_SPAN`, so the stagger `heroTitleClearsNavTitle` names
 * holds whatever the block measures; never later than the constant, so a
 * tall hero keeps the arrival it always had.
 */
export function navFadeStartFor({
  titleAnchor,
  identityHeight,
}: {
  titleAnchor: number;
  /** The identity block's measured height — status line, name and strip. */
  identityHeight: number;
}): number {
  const covered = (titleAnchor + identityHeight - HERO_SHEET_OVERLAP) / (1 - HERO_PARALLAX_RATE);
  return Math.round(Math.max(HERO_TITLE_FADE_SPAN, Math.min(HERO_NAV_FADE_START, covered)));
}

/**
 * The least the sheet may measure, so the pullback can complete.
 *
 * ── 13 Sep · the binnacle is short, and the motion was designed for a ledger ─
 *
 * Every span above is a scroll offset, and the scroll can only travel as far
 * as the content allows: `(heroHeight − HERO_SHEET_OVERLAP) + sheet − viewport`.
 * The hub's sheet used to be a ledger longer than any display, so the nav
 * title's arrival was always reachable. The binnacle fits in half a display,
 * and with it the scroll stopped at ~160pt — the hero name faded to nothing
 * (`HERO_TITLE_FADE_SPAN` is 210) and the nav name never came, so at the end
 * of the scroll the car had no name at all; the critic read the frame as
 * *"the collapsed header shows only GARAGE"*.
 *
 * This is the sheet height at which, when the scroll ends, the nav title has
 * fully arrived **and** the sheet has passed under the nav plate — whichever
 * of the two asks for more. The second matters once the title arrives early
 * (`navFadeStartFor`): a title fully in while the sheet's edge still hangs
 * 28pt below the plate leaves a band of dimmed hero between the two, and
 * the floor arriving is the state the pullback exists to reach. The viewport
 * is the scroll view's own measured height (the window stood in for it
 * once, and the tab bar's 83pt went into the tail twice). A layout value
 * derived from the motion constants and the nav's height, so none of them
 * can drift apart: change a span and the floor moves with it. ⚠ It is a
 * `minHeight` — a layout key — and must never be driven by `scrollY`;
 * `mobile-native-driver.test.ts` holds that line.
 */
export function sheetMinHeight(
  viewportHeight: number,
  heroHeight: number,
  {
    navFadeStart = HERO_NAV_FADE_START,
    navHeight,
  }: {
    /** Where the nav title starts to arrive — `navFadeStartFor`'s, or the constant. */
    navFadeStart?: number;
    /** The nav plate's height (the top inset and the row), for the sheet to pass under. */
    navHeight?: number;
  } = {},
): number {
  const spacer = heroHeight - HERO_SHEET_OVERLAP;
  const titleArrived = navFadeStart + HERO_NAV_FADE_SPAN;
  // Without the nav's height there is nothing to pass under; the title alone sets the floor.
  const underTheNav = navHeight === undefined ? 0 : spacer - navHeight;
  return Math.round(viewportHeight - spacer + Math.max(titleArrived, underTheNav));
}

/**
 * True when the hero's own title is gone before the nav's arrives.
 *
 * The pair `HERO_TITLE_FADE_SPAN` / `HERO_NAV_FADE_START` states the intent;
 * this states the *relationship*, so a test can hold it while either number
 * moves. Two legible copies of one car's name on one screen is the failure.
 */
export function heroTitleClearsNavTitle(): boolean {
  return HERO_TITLE_FADE_SPAN < HERO_NAV_FADE_START;
}
