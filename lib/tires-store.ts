import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@tappet/core/logger';
import type { TireRotationRow, TireSetRow } from '@tappet/core/tires';

/**
 * Reading a vehicle's tire set and its rotations — the one query both the
 * v1 route and the nightly sweep make.
 *
 * ── Why the read is shared and the writes are not ───────────────────────────
 *
 * Two callers read the same two tables the same way: the phone's route (one
 * car, the owner is looking) and the sweep (every car, nobody is looking). A
 * second copy of "the current set, then its rotations, oldest first" would
 * drift the way this codebase's second copies do — one caller would add
 * `retired_at IS NULL` and the other would keep reading a set the owner
 * replaced. The writes have one caller each and stay in their routes.
 *
 * ── ⚠ The tables may not exist yet ──────────────────────────────────────────
 *
 * The two migrations (`20260920200000`, `20260920200100`) are David's to apply
 * in the SQL editor, and until they are, PostgREST answers `PGRST205` — "could
 * not find the table in the schema cache". That must be a **named** state, not
 * a 500 and not an empty result: a route answering `{ set: null }` would show
 * every owner a screen inviting them to add a set the database cannot store,
 * and the sweep logging one error per car would drown the log in the same
 * sentence. `TIRES_UNAVAILABLE` is what callers branch on; the sweep checks it
 * once per run.
 */

export const TIRES_UNAVAILABLE = 'tires-unavailable';

/** `PGRST205` is PostgREST's schema-cache miss; `42P01` is Postgres's own "relation does not exist". */
export function tireTablesMissing(error: { code?: string | null; message?: string | null } | null | undefined): boolean {
  if (!error) return false;
  if (error.code === 'PGRST205' || error.code === '42P01') return true;
  return /Could not find the table 'public\.tire_/.test(error.message ?? '');
}

export type TireRecords =
  | { ok: true; set: TireSetRow | null; rotations: TireRotationRow[] }
  | { ok: false; reason: typeof TIRES_UNAVAILABLE | 'read-failed'; message: string };

/**
 * The vehicle's current set and its rotations, oldest first.
 *
 * "Current" is `retired_at IS NULL`, which the partial unique index makes a
 * single row. Rotations are read only when there is a set, because they hang
 * off it — a vehicle with no current set has no rotations to show even if a
 * retired set had some.
 */
export async function readTireRecords(client: SupabaseClient, vehicleId: string): Promise<TireRecords> {
  const { data: set, error: setError } = await client
    .from('tire_sets')
    .select(
      'id, vehicle_id, brand, line, size_front, size_rear, installed_on, install_odometer, purchase_place, rotation_interval_miles, interval_source, treadwear_miles_entered, provenance, rotation_notified_at, retired_at'
    )
    .eq('vehicle_id', vehicleId)
    .is('retired_at', null)
    .maybeSingle();

  if (setError) {
    if (tireTablesMissing(setError)) {
      return { ok: false, reason: TIRES_UNAVAILABLE, message: 'Tire records are not switched on yet.' };
    }
    logger.error('TIRES:READ_SET', new Error(setError.message), { vehicleId });
    return { ok: false, reason: 'read-failed', message: 'Could not read the tire set' };
  }

  if (!set) return { ok: true, set: null, rotations: [] };

  const { data: rotations, error: rotationsError } = await client
    .from('tire_rotations')
    .select('id, set_id, rotated_on, odometer, provenance, line_item_id')
    .eq('set_id', set.id)
    .order('odometer', { ascending: true })
    .order('rotated_on', { ascending: true });

  if (rotationsError) {
    if (tireTablesMissing(rotationsError)) {
      return { ok: false, reason: TIRES_UNAVAILABLE, message: 'Tire records are not switched on yet.' };
    }
    logger.error('TIRES:READ_ROTATIONS', new Error(rotationsError.message), { vehicleId, setId: set.id });
    return { ok: false, reason: 'read-failed', message: 'Could not read the rotations' };
  }

  return { ok: true, set: set as TireSetRow, rotations: (rotations ?? []) as TireRotationRow[] };
}
