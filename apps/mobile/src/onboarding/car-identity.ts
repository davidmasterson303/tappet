import {
  VIN_LENGTH,
  describeDecodedVin,
  normaliseVin,
  type DecodedVin,
} from '@tappet/core/vehicle-catalog';

/**
 * What the first screen of adding a car hands the second.
 *
 * ── The seam between "which car" and "what only the owner knows" ────────────
 *
 * The rebuilt first run (20 Sep) is two screens: identify the car — by its
 * sticker, a document or the number typed — and then ask the three things no
 * decode can answer (odometer, whether modifications are wanted, when the oil
 * was last changed). This is the object that crosses that seam, and it is a
 * plain, serialisable record on purpose: it travels as a route param, so a
 * screen can be opened with one from a test or a deep link without the door
 * that produced it.
 *
 * `source` is kept for the second screen's heading and for the log. It is not
 * sent anywhere — `POST /api/v1/vehicles` does not care how the number was
 * read, only that `vin` is seventeen valid characters or `null`.
 */
export type CarIdentity = {
  /** Seventeen normalised characters, or `null` when the owner described the car instead. */
  vin: string | null;
  year: number;
  make: string;
  model: string;
  /** `''` rather than `null` — the route's own shape. */
  trim: string;
  /**
   * The engine as NHTSA stated it, for the second screen's caption. Never
   * stored: `vehicles` has no column for it, and it is said rather than kept.
   */
  engine: string | null;
  /** Which door produced this. `described` is the escape hatch. */
  source: 'sticker' | 'document' | 'typed' | 'described';
};

/**
 * A decode, as the second screen wants it.
 *
 * ⚠ **Refuses a decode with no year.** `parseVpicDecode` keeps a row with a
 * make or a model, because for the *old* form a partial decode filled
 * partial fields and the owner typed the rest. Here there are no fields to
 * fill: the identity is what gets saved, and the route refuses a car without
 * a plausible year. So a decode that names the make and not the year is a
 * failed identification, and the caller sends it to the escape hatch with
 * what was read — `null` here, and the log says why.
 */
export function identityFromDecode(
  vin: string,
  decoded: DecodedVin,
  source: CarIdentity['source']
): CarIdentity | null {
  const number = normaliseVin(vin);
  if (number.length !== VIN_LENGTH) return null;
  if (decoded.year === null || !decoded.make || !decoded.model) return null;
  return {
    vin: number,
    year: decoded.year,
    make: decoded.make,
    model: decoded.model,
    trim: decoded.trim ?? '',
    engine: decoded.engine,
    source,
  };
}

/** The garage's own title for the car — year, make, model. */
export function carTitle(identity: Pick<CarIdentity, 'year' | 'make' | 'model'>): string {
  return [identity.year, identity.make, identity.model].filter(Boolean).join(' ');
}

/**
 * The identity as one sentence, the log's answer line and the second
 * screen's caption. Routed through `describeDecodedVin` so the two clients'
 * sentence is one function.
 */
export function describeIdentity(identity: CarIdentity): string {
  return describeDecodedVin({
    year: identity.year,
    make: identity.make,
    model: identity.model,
    trim: identity.trim || null,
    engine: identity.engine,
    confidence: 'clean',
  });
}
