import { useQuery } from '@tanstack/react-query';
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

/**
 * The tire set on a car, over the same route the phone reads.
 *
 * `/api/v1/tires` resolves the cookie session as readily as a bearer token
 * (`authorizeVehicleAccess`), so the web reads and writes through it rather
 * than through the browser client — one route, one validator, both clients.
 * The rows come back narrowed through core, so what the page holds is what
 * the derivations expect.
 *
 * ── `tires-unavailable` is a state, not a failure ───────────────────────────
 *
 * Until the two migrations are applied the route answers 503 with that code.
 * The hook surfaces it as `unavailable: true` on a resolved query rather than
 * as an error, so the page can name the state instead of offering a retry
 * that cannot help — and so React Query does not retry a 503 three times on
 * every open.
 */
export interface TireRecords {
  set: TireSet | null;
  rotations: TireRotation[];
  unavailable: boolean;
}

export class TireRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null
  ) {
    super(message);
    this.name = 'TireRequestError';
  }
}

async function readBody(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function refuse(response: Response): Promise<never> {
  const body = await readBody(response);
  throw new TireRequestError(
    typeof body.error === 'string' ? body.error : `Request failed (${response.status})`,
    response.status,
    typeof body.code === 'string' ? body.code : null
  );
}

export async function fetchTireRecords(vehicleId: string): Promise<TireRecords> {
  const response = await fetch(`/api/v1/tires?vehicleId=${encodeURIComponent(vehicleId)}`);
  if (response.status === 503) {
    const body = await readBody(response);
    if (body.code === 'tires-unavailable') return { set: null, rotations: [], unavailable: true };
  }
  if (!response.ok) await refuse(response);
  const body = (await response.json()) as { set?: TireSetRow | null; rotations?: TireRotationRow[] };
  return {
    set: body.set ? tireSetFromRow(body.set) : null,
    rotations: Array.isArray(body.rotations) ? body.rotations.map(tireRotationFromRow) : [],
    unavailable: false,
  };
}

export function tireRecordsKey(vehicleId: string) {
  return ['tires', vehicleId] as const;
}

export function useTireRecords(vehicleId: string) {
  return useQuery({
    queryKey: tireRecordsKey(vehicleId),
    queryFn: () => fetchTireRecords(vehicleId),
    staleTime: 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: true,
    refetchOnReconnect: true,
    retry: false,
  });
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function createTireSet(vehicleId: string, payload: TireSetPayload): Promise<TireSet> {
  const response = await fetch('/api/v1/tires', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ vehicleId, ...payload }),
  });
  if (!response.ok) await refuse(response);
  const body = (await response.json()) as { set: TireSetRow };
  return tireSetFromRow(body.set);
}

export async function updateTireSet(setId: string, changes: Partial<TireSetPayload>): Promise<TireSet> {
  const response = await fetch(`/api/v1/tires?setId=${encodeURIComponent(setId)}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify(changes),
  });
  if (!response.ok) await refuse(response);
  const body = (await response.json()) as { set: TireSetRow };
  return tireSetFromRow(body.set);
}

export async function addTireRotation(setId: string, payload: RotationPayload): Promise<TireRotation> {
  const response = await fetch('/api/v1/tires/rotations', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ setId, ...payload }),
  });
  if (!response.ok) await refuse(response);
  const body = (await response.json()) as { rotation: TireRotationRow };
  return tireRotationFromRow(body.rotation);
}

export async function removeTireRotation(rotationId: string): Promise<void> {
  const response = await fetch(`/api/v1/tires/rotations?rotationId=${encodeURIComponent(rotationId)}`, {
    method: 'DELETE',
  });
  if (!response.ok) await refuse(response);
}
