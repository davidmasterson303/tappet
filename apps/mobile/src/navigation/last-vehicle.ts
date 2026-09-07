/**
 * The most recently opened car, for the Advisor tab — R13.
 *
 * ⚠ **Module state, deliberately, and it does not persist.** The advisor needs
 * a `vehicleId`; the tab bar has none, and threading one through the navigation
 * tree would make every screen carry a value only the bar reads.
 *
 * A cold start has no last car and falls back to the garage, which is correct
 * rather than a limitation: choosing a car is a real step and guessing at one —
 * the first in the list, the last one persisted, whatever — would open the
 * advisor about somebody else's vehicle in a two-car garage. §10.
 */
let lastOpenedVehicle: { vehicleId: string; title?: string } | null = null;

/**
 * The garage's only car, when it has exactly one.
 *
 * ── ⚠ 7 Sep · why this is not the guessing the note above forbids ───────────
 *
 * That note is right that picking "the first in the list, the last one
 * persisted, whatever" would open the advisor about somebody else's vehicle.
 * Its case is a **two-car garage**, where choosing is a real step.
 *
 * With exactly one car there is nothing to choose and no one else's vehicle to
 * open, and the cost of pretending otherwise was reported from a real phone:
 * *"I can only access first tab."* On a cold start `lastOpenedVehicle` is null,
 * so History and Advisor both reset to the garage — two of four tabs silently
 * bouncing, which reads as a broken tab bar rather than as a considered
 * fallback. Nothing tells the person why, because nothing happened.
 *
 * ⚠ Set to `null` the moment the garage holds anything other than one car, so a
 * second vehicle restores the original behaviour without anyone remembering to.
 */
let soleVehicle: { vehicleId: string; title?: string } | null = null;

export function rememberVehicle(vehicleId: string, title?: string) {
  lastOpenedVehicle = { vehicleId, title };
}

/** Called by the garage each time it loads: the whole list, not a pick from it. */
export function rememberGarageSize(
  vehicles: { id: string; title?: string }[]
) {
  soleVehicle =
    vehicles.length === 1 ? { vehicleId: vehicles[0].id, title: vehicles[0].title } : null;
}

/**
 * Whichever car the bar should act on, or `null` when that is genuinely a
 * question for the person rather than for this function.
 */
function lastVehicle() {
  return lastOpenedVehicle ?? soleVehicle;
}

export { lastVehicle };
