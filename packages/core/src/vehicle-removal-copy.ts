/**
 * What removing a vehicle takes with it — the confirmation's lines, from
 * the inventory the API read.
 *
 * ── The same problem as the waiting states, the same answer ────────────────
 *
 * "Are you sure?" tells an owner nothing. The research log quotes rows
 * rather than asserting progress; this quotes rows rather than asserting
 * danger: "24 open recalls and what you have marked repaired", "6 service
 * records", "3 receipt photographs". Each line exists only when the count
 * behind it does. A count the API could not read arrives as `null` and
 * produces no line — nothing on screen that no row supports — and a car
 * with nothing on file says so in one sentence rather than listing zeros.
 *
 * ── Why "receipt photographs" is named at all ───────────────────────────────
 *
 * The privacy policy's sentence (David, 20 Sep): *"We keep the photograph of
 * a receipt for as long as you keep the vehicle it belongs to. Delete the
 * vehicle and its receipts go with it."* The confirmation is where that
 * promise is made in the owner's own moment, and the count is what proves
 * the app knows what it is about to remove.
 */

export interface VehicleRemovalInventoryLike {
  vehicle: { year: number | null; make: string | null; model: string | null };
  openRecalls: number | null;
  markedRepaired: number | null;
  serviceRecords: number | null;
  receiptPhotographs: number | null;
  hasHealthScore: boolean | null;
  hasSchedule: boolean | null;
  advisorThreads: number | null;
  needs: number | null;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "Remove the 2003 Honda Accord?" — from the row, never a guess at the name. */
export function removalTitle(vehicle: VehicleRemovalInventoryLike['vehicle']): string {
  const name = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ');
  return name ? `Remove the ${name}?` : 'Remove this car?';
}

/**
 * The lines under "This also removes". Empty when nothing on file is known
 * to go — the caller then says so in its own sentence.
 */
export function removalLines(inventory: VehicleRemovalInventoryLike): string[] {
  const lines: string[] = [];

  const open = inventory.openRecalls;
  const repaired = inventory.markedRepaired;
  if (open !== null && open > 0) {
    lines.push(
      repaired !== null && repaired > 0
        ? `${plural(open, 'open recall', 'open recalls')} and what you have marked repaired`
        : plural(open, 'open recall', 'open recalls')
    );
  } else if (repaired !== null && repaired > 0) {
    lines.push(`what you have marked repaired on ${plural(repaired, 'recall', 'recalls')}`);
  }

  if (inventory.serviceRecords !== null && inventory.serviceRecords > 0) {
    lines.push(plural(inventory.serviceRecords, 'service record', 'service records'));
  }
  if (inventory.receiptPhotographs !== null && inventory.receiptPhotographs > 0) {
    lines.push(plural(inventory.receiptPhotographs, 'receipt photograph', 'receipt photographs'));
  }

  const score = inventory.hasHealthScore === true;
  const schedule = inventory.hasSchedule === true;
  if (score && schedule) lines.push('its health score and maintenance schedule');
  else if (score) lines.push('its health score');
  else if (schedule) lines.push('its maintenance schedule');

  if (inventory.advisorThreads !== null && inventory.advisorThreads > 0) {
    lines.push(plural(inventory.advisorThreads, 'advisor thread', 'advisor threads'));
  }
  if (inventory.needs !== null && inventory.needs > 0) {
    lines.push(plural(inventory.needs, 'item on its plan', 'items on its plan'));
  }
  return lines;
}

/** True when at least one count could not be read — the caller says the list may be incomplete. */
export function removalInventoryIncomplete(inventory: VehicleRemovalInventoryLike): boolean {
  return (
    inventory.openRecalls === null ||
    inventory.markedRepaired === null ||
    inventory.serviceRecords === null ||
    inventory.receiptPhotographs === null ||
    inventory.hasHealthScore === null ||
    inventory.hasSchedule === null ||
    inventory.advisorThreads === null ||
    inventory.needs === null
  );
}

export const REMOVAL_IRREVERSIBLE = 'This cannot be undone.';
export const REMOVAL_NOTHING_ELSE = 'Nothing else is on file for it.';
export const REMOVAL_INCOMPLETE = 'Some of what is on file could not be counted just now; it goes too.';
