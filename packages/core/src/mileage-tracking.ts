/**
 * Whether a proposed odometer reading may be stored.
 *
 * ── Why this is a rule and not an `if` in the route ─────────────────────────
 *
 * Because two clients ask the question. The phone should tell someone their
 * reading looks wrong *before* spending a round trip on it; the route has to
 * refuse it regardless, because a client is not a guarantee. A second copy of
 * the thresholds drifts, and the direction matters: a phone stricter than the
 * server refuses valid readings, and one looser sends requests that always
 * fail. Same argument `push-tokens.ts` makes about the token format.
 *
 * ── The odometer goes up, except when the owner mistyped ────────────────────
 *
 * A pure monotonic rule is the obvious design and it is a trap. Enter 160000
 * for 16000 once and every future reading is below the stored value, so the
 * car is locked at a wrong number **forever** — and the only escape is a
 * support channel this product does not have. The wrong reading then feeds
 * every service-due calculation after it.
 *
 * So a decrease is refused by default and permitted as an explicit
 * `isCorrection`. That is what separates the two journeys: confirming a
 * reading from a notification must never move the number down, and fixing a
 * typo must be possible. The flag makes the caller say which one it is
 * instead of the rule guessing.
 */
export type MileageRejection =
  | 'not-a-number'
  | 'out-of-range'
  | 'went-backwards'
  | 'implausible-jump';

export interface MileageDecision {
  ok: boolean;
  reason?: MileageRejection;
  /** Owner-facing, because every one of these is a thing a person did. */
  message?: string;
}

/**
 * No production vehicle reaches this. It exists to catch a paste or a stray
 * digit, not to have an opinion about high-mileage cars.
 */
const MAX_PLAUSIBLE_MILEAGE = 2_000_000;

/**
 * A single update adding more than this is a typo far more often than it is a
 * year of driving — and unlike the decrease case, it is silently plausible.
 * Also gated behind `isCorrection`, so a genuine one is still possible.
 */
const MAX_SINGLE_JUMP = 100_000;

export function validateMileageUpdate(params: {
  current: number;
  next: unknown;
  isCorrection?: boolean;
}): MileageDecision {
  const { current, next, isCorrection = false } = params;

  if (typeof next !== 'number' || !Number.isFinite(next) || !Number.isInteger(next)) {
    return { ok: false, reason: 'not-a-number', message: 'Enter the reading as a whole number.' };
  }

  if (next < 0 || next > MAX_PLAUSIBLE_MILEAGE) {
    return {
      ok: false,
      reason: 'out-of-range',
      message: 'That reading looks out of range — check the digits.',
    };
  }

  if (next < current && !isCorrection) {
    return {
      ok: false,
      reason: 'went-backwards',
      message: `That is below the ${current.toLocaleString('en-US')} miles already recorded. Correcting an earlier mistake?`,
    };
  }

  if (next - current > MAX_SINGLE_JUMP && !isCorrection) {
    return {
      ok: false,
      reason: 'implausible-jump',
      message: `That adds over ${MAX_SINGLE_JUMP.toLocaleString('en-US')} miles since the last reading — check the digits.`,
    };
  }

  return { ok: true };
}

export interface MileageUpdateStatus {
  isDue: boolean;
  estimatedMilesDriven: number;
  monthsSinceLast: number;
  estimatedMilesForMonth: number;
}

export function calculateMileageUpdateStatus(
  vehicle: {
    current_mileage: number;
    avg_miles_per_month: number | null;
    last_mileage_update_date: string | null;
  }
): MileageUpdateStatus {
  const now = new Date();
  const lastUpdate = vehicle.last_mileage_update_date
    ? new Date(vehicle.last_mileage_update_date)
    : new Date(vehicle.last_mileage_update_date || Date.now());

  const diffMs = now.getTime() - lastUpdate.getTime();
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30.44);

  const avgMilesPerMonth = vehicle.avg_miles_per_month || 0;
  const estimatedMilesDriven = Math.round(diffMonths * avgMilesPerMonth);

  return {
    isDue: estimatedMilesDriven >= avgMilesPerMonth && avgMilesPerMonth > 0,
    estimatedMilesDriven,
    monthsSinceLast: Math.floor(diffMonths),
    estimatedMilesForMonth: avgMilesPerMonth,
  };
}

export function formatMileagePromptMessage(status: MileageUpdateStatus): string {
  if (status.estimatedMilesDriven < 50) {
    return `You've driven an estimated ${status.estimatedMilesDriven} miles since your last update`;
  }

  const months = Math.max(1, status.monthsSinceLast);
  return `Time to update! You've driven an estimated ${status.estimatedMilesDriven} miles in the last ${months} month${months > 1 ? 's' : ''}`;
}

/**
 * Whether to ask for the odometer now, and what to put in the field.
 *
 * ── 13 Sep · not more than monthly, and with a number worked out ────────────
 *
 * The phone's Service tab opened on "Still around 66,000 miles?" every time it
 * was opened. David: *"we don't need to ask to confirm mileage every login.
 * not more than monthly. but we should calculate assumed new mileage each
 * month we ask."* Both halves live here so the phone and the web ask the same
 * question at the same interval from the same facts:
 *
 *   `ask`      — no reading has ever been confirmed (`last_mileage_update_date`
 *                null), or at least one month has passed since the last one.
 *                Time, not miles: a stored car is still asked monthly, and
 *                answered "unchanged" in one tap.
 *   `assumed`  — the reading to offer: the last one plus the owner's own
 *                miles-a-month times the months since, when both are known
 *                and at least a month has passed; otherwise the last reading.
 *
 * ⚠ The assumed figure is an estimate and is rounded to the nearest hundred
 * so it reads as one (CLAUDE.md §10) — a field prefilled with 66,713 claims a
 * precision nobody measured. The owner confirms or corrects it; only what
 * they confirm is stored, and `validateMileageUpdate` still judges it.
 *
 * `months` is elapsed calendar time in average months (30.44 days), the same
 * arithmetic `calculateMileageUpdateStatus` uses, so the two agree on when a
 * month has passed.
 */
export interface MileageCheckIn {
  /** Ask now — never confirmed, or a month or more since. */
  ask: boolean;
  /** The reading to offer in the field. */
  assumed: number;
  /** Whether `assumed` is a projection rather than the stored reading. */
  projected: boolean;
  /** Whole months since the last confirmation; `null` when never confirmed. */
  monthsSince: number | null;
}

const DAYS_PER_MONTH = 30.44;

export function mileageCheckIn(
  vehicle: {
    current_mileage: number | null | undefined;
    avg_miles_per_month?: number | null;
    last_mileage_update_date?: string | null;
  },
  now: Date = new Date()
): MileageCheckIn {
  const current = typeof vehicle.current_mileage === 'number' ? vehicle.current_mileage : 0;
  const last = vehicle.last_mileage_update_date ? new Date(vehicle.last_mileage_update_date) : null;
  if (!last || Number.isNaN(last.getTime())) {
    return { ask: true, assumed: current, projected: false, monthsSince: null };
  }

  const elapsedMonths = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24 * DAYS_PER_MONTH);
  const monthsSince = Math.max(0, Math.floor(elapsedMonths));
  const ask = elapsedMonths >= 1;

  const perMonth = vehicle.avg_miles_per_month;
  const projects = ask && typeof perMonth === 'number' && perMonth > 0;
  /*
    Rounded to the nearest hundred, then floored at the stored reading: a
    small month rounded down would otherwise offer a figure *below* the last
    one, which `validateMileageUpdate` refuses as going backwards.
  */
  const assumed = projects
    ? Math.max(current, Math.round((current + perMonth * elapsedMonths) / 100) * 100)
    : current;

  return { ask, assumed, projected: assumed !== current, monthsSince };
}
