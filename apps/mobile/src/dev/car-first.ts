/**
 * The car-first structure — four tabs, and the set as a control on the car.
 *
 * ── What this gate holds back, and why it is still here ─────────────────────
 *
 * David, 22 Sep, on the Garage and Car tabs: *"how can we make Garage and Car
 * tabs feel less redundant?"* The evaluation found the answer was structural
 * rather than cosmetic — **a garage bay is a strict subset of the car hub**,
 * so the garage was the hub with things removed, one tap from the hub — and
 * he ruled: *"a and c are ruled out for the subpar solution to single car
 * owner, which is not an edge case at all … let's try b."* Three switcher
 * concepts were built as real screens, a design critic picked one blind (the
 * shipped structure ranked last), and the loop ran it to **9/10,
 * `Continue: no`**, which was the bar he set.
 *
 * Set `EXPO_PUBLIC_CAR_FIRST=1` and the app is four tabs — CAR · ADVISOR ·
 * SERVICE · PLAN — with the car's name as the switcher. Unset, it is the
 * five-tab app that ships.
 *
 * ⚠ **It is a gate rather than a deletion because removing the garage tab is
 * David's call, not the loop's.** He ordered those five tabs on 21 Sep, in
 * that order, for stated reasons; a design loop reaching 9 says the
 * replacement is good, not that the trade is his to have made for him. The
 * flag is one line from being the app, and `docs/design-system-drift.md`
 * §6.23 carries what he would be trading.
 *
 * ⚠ **And it is temporary either way.** A flag that outlives its decision is
 * a second codebase nobody reads. When David answers, this file goes — the
 * structure becomes the app, or the switcher comes out with it.
 */

/**
 * Whether this build draws the car-first structure.
 *
 * Read at call time rather than at import: Metro inlines `process.env` at
 * bundle time either way, but a function keeps the gate readable at the one
 * place it matters and keeps a stale module constant from surviving a fast
 * refresh mid-capture.
 */
export function carFirstStructure(): boolean {
  if (!__DEV__) return false;
  return (process.env.EXPO_PUBLIC_CAR_FIRST ?? '').trim() === '1';
}
