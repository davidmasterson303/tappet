import {
  tireRotationFromRow,
  tireSetFromRow,
  type RotationPayload,
  type TireRotation,
  type TireRotationRow,
  type TireSet,
  type TireSetPayload,
  type TireSetRow,
} from '@tappet/core/tires';
import { apiRequest } from './client';

/**
 * The tire set on a car, over the API.
 *
 * Every call goes through `apiRequest` — the phone reads data through the API
 * and only through the API (`mobile-api-only.test.ts`), and the rows come back
 * narrowed through core's `tireSetFromRow` / `tireRotationFromRow` so what the
 * screens hold is the record the derivations expect, not whatever JSON said.
 *
 * ── `tires-unavailable` is a state, not an error ────────────────────────────
 *
 * Until the two migrations are applied the route answers 503 with that code.
 * `apiRequest` throws an `ApiRequestError` carrying it (`error.code`), and the
 * screen names the state rather than reporting a failure of its own — see
 * `TiresScreen`. Nothing here swallows it into an empty set: an empty set
 * invites an owner to enter one the database cannot store.
 */

export interface TireRecords {
  set: TireSet | null;
  rotations: TireRotation[];
}

export async function fetchTireRecords(vehicleId: string): Promise<TireRecords> {
  const body = await apiRequest<{ set?: TireSetRow | null; rotations?: TireRotationRow[] }>(
    `/tires?vehicleId=${encodeURIComponent(vehicleId)}`
  );
  return {
    set: body.set ? tireSetFromRow(body.set) : null,
    rotations: Array.isArray(body.rotations) ? body.rotations.map(tireRotationFromRow) : [],
  };
}

/** Put a set on the car. The route refuses a second current set with 409. */
export async function createTireSet(vehicleId: string, payload: TireSetPayload): Promise<TireSet> {
  const body = await apiRequest<{ set?: TireSetRow }>('/tires', {
    method: 'POST',
    body: { vehicleId, ...payload },
  });
  if (!body.set) throw new Error('That was not saved.');
  return tireSetFromRow(body.set);
}

/**
 * Change what was entered. A partial payload: only the keys sent change, and a
 * key sent as `null` clears — the route merges and re-judges the whole row.
 */
export async function updateTireSet(setId: string, changes: Partial<TireSetPayload>): Promise<TireSet> {
  const body = await apiRequest<{ set?: TireSetRow }>(`/tires?setId=${encodeURIComponent(setId)}`, {
    method: 'PATCH',
    body: changes,
  });
  if (!body.set) throw new Error('That was not saved.');
  return tireSetFromRow(body.set);
}

export async function addTireRotation(setId: string, payload: RotationPayload): Promise<TireRotation> {
  const body = await apiRequest<{ rotation?: TireRotationRow }>('/tires/rotations', {
    method: 'POST',
    body: { setId, ...payload },
  });
  if (!body.rotation) throw new Error('That was not saved.');
  return tireRotationFromRow(body.rotation);
}

export async function removeTireRotation(rotationId: string): Promise<void> {
  await apiRequest<{ success?: boolean }>(`/tires/rotations?rotationId=${encodeURIComponent(rotationId)}`, {
    method: 'DELETE',
  });
}
