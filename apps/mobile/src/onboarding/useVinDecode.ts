import { useCallback, useEffect, useRef, useState } from 'react';
import {
  VIN_LENGTH,
  describeDecodedVin,
  normaliseVin,
  vinCheckDigitMatches,
  vinProblem,
} from '@tappet/core/vehicle-catalog';

import { decodeVin } from '../api/vpic';
import type { DecodeObservation, DecodeSource } from '../components/working-stages';
import { identityFromDecode, type CarIdentity } from './car-identity';

/**
 * What was read when the number did not identify a car outright — carried to
 * the escape hatch so the owner is not asked to retype what NHTSA already
 * said. Every field optional: a partial decode is partial.
 */
export type Prefill = { year?: number; make?: string; model?: string; trim?: string };

export type VinDecode = {
  /** What the log draws. `null` until a number has been handed in. */
  observation: DecodeObservation | null;
  /** The car, once NHTSA named one the second screen can take. */
  identity: CarIdentity | null;
  /** What was read when identification failed short — for the escape hatch. */
  prefill: Prefill | null;
  /** Hand in seventeen characters. Anything else fails the log rather than the caller. */
  start: (vin: string) => void;
  /** Back to the door's rest state, abandoning any answer in flight. */
  reset: () => void;
};

/**
 * The decode, as the two doors share it.
 *
 * ── One hook, two doors ─────────────────────────────────────────────────────
 *
 * The sticker door hands in a number the barcode reader found; the typed door
 * hands in the seventeen characters in its field. From there the work is the
 * same — the check digit, the one call to NHTSA, the sentence or the stated
 * reason there is none — and so is the log that narrates it. This owns that
 * state so `ScanVinScreen` and `TypeVinScreen` own only their doors.
 *
 * ── Every path ends in a result or a stated failure ─────────────────────────
 *
 * `decodeVin` never throws and its timeout is its own (`api/vpic.ts`), so the
 * `asking` row cannot be left active by a request that went nowhere. The
 * three ways it can end are three sentences, each naming the next move,
 * because the log is the only thing on screen at that moment and a failure
 * that does not say what to do is the dead end the rebuild exists to remove.
 *
 * ⚠ A decode that names the make and not the year is a failure *here* even
 * though `parseVpicDecode` kept it: there are no fields under this log for
 * the owner to finish, so a car that cannot be saved as read goes to the
 * escape hatch with what was read (`prefill`) rather than being half-saved.
 */
export function useVinDecode(source: DecodeSource): VinDecode {
  const [observation, setObservation] = useState<DecodeObservation | null>(null);
  const [identity, setIdentity] = useState<CarIdentity | null>(null);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setObservation(null);
    setIdentity(null);
    setPrefill(null);
  }, []);

  // A screen that unmounts mid-decode must not set state on the way out.
  useEffect(() => () => inFlight.current?.abort(), []);

  const start = useCallback(
    (raw: string) => {
      inFlight.current?.abort();
      const vin = normaliseVin(raw);
      const problem = vinProblem(vin);
      const checkDigit = vin.length === VIN_LENGTH ? vinCheckDigitMatches(vin) : null;

      setIdentity(null);
      setPrefill(null);

      /*
        Cannot be sent. The typed door disables its control until the field
        holds seventeen valid characters and the sticker door only hands in
        what `vinFromBarcode` accepted, so this is a guard rather than a
        path — but a guard that says why, in the field's own words.
      */
      if (problem || vin.length !== VIN_LENGTH) {
        setObservation({
          source,
          vin,
          checkDigit,
          outcome: { status: 'failed', reason: problem ?? `A VIN is ${VIN_LENGTH} characters.` },
        });
        return;
      }

      const controller = new AbortController();
      inFlight.current = controller;
      setObservation({ source, vin, checkDigit, outcome: { status: 'asking' } });

      void decodeVin(vin, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        inFlight.current = null;

        if (result.status === 'unreachable') {
          setObservation({
            source,
            vin,
            checkDigit,
            outcome: {
              status: 'failed',
              reason:
                'NHTSA did not answer. Check the connection and try again, or describe the car instead.',
            },
          });
          return;
        }

        if (result.status === 'unplaced') {
          setObservation({
            source,
            vin,
            checkDigit,
            outcome: {
              status: 'failed',
              reason: 'NHTSA has nothing for that number. Read it over, or describe the car instead.',
            },
          });
          return;
        }

        const named = identityFromDecode(vin, result.car, source);
        if (!named) {
          const { year, make, model, trim } = result.car;
          setPrefill({
            ...(year ? { year } : {}),
            ...(make ? { make } : {}),
            ...(model ? { model } : {}),
            ...(trim ? { trim } : {}),
          });
          const read = [year, make, model].filter(Boolean).join(' ');
          setObservation({
            source,
            vin,
            checkDigit,
            outcome: {
              status: 'failed',
              reason: read
                ? `NHTSA could only place it as "${read}". Describe the car instead — that much is filled in.`
                : 'NHTSA could not place that number. Describe the car instead.',
            },
          });
          return;
        }

        setObservation({
          source,
          vin,
          checkDigit,
          outcome: { status: 'named', sentence: describeDecodedVin(result.car) },
        });
        setIdentity(named);
      });
    },
    [source]
  );

  return { observation, identity, prefill, start, reset };
}
