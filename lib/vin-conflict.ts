import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@tappet/core/logger';
import { CONTACT_EMAIL } from '@/lib/legal';

/**
 * What to say when saving a car fails on the VIN's uniqueness (`23505`).
 *
 * ── Audit 360, SEC-1 (1 Oct) · a VIN was a key anyone could take ────────────
 *
 * `vehicles.vin` has been `UNIQUE` across the whole table since the first
 * schema (`vehicles_vin_key`, confirmed on production 1 Oct by a dry insert
 * of a demo VIN: `23505 … "vehicles_vin_key"`). A VIN is on every windscreen
 * and in every listing, so that made it a shared resource one account could
 * use against another:
 *
 *   - **an oracle** — the web's VIN step answered "This VIN is already
 *     registered to another Tappet account" before anything was saved, and
 *     the phone's route answered 409 vs 201;
 *   - **a squat** — whoever saved a VIN first owned it, and its real owner
 *     could never add their car;
 *   - **with no attacker at all** — the previous owner of a used car still
 *     has it in their garage, so the buyer is refused.
 *
 * `20261001120000_a_vin_is_unique_within_a_garage.sql` makes the key
 * `(user_id, vin)`: one owner cannot hold the same car twice, and two owners
 * may each hold it. **It is David's to apply**, and this module is written to
 * be right on either side of it:
 *
 *   - **after** — a `23505` can only be the caller's own car, so the answer
 *     is "already in your garage" with the id to go to. The other branch is
 *     unreachable.
 *   - **before** — a `23505` may be a stranger's. Nothing can save the row,
 *     so the honest answer is the transfer sentence the web has always given,
 *     and a warning in the log that names the pending migration — a line
 *     that keeps appearing after the apply would mean it did not take.
 *
 * ⚠ Ownership is asked of the **caller's** rows (`user_id` filter on the
 * service-role client) — never "does anybody have this VIN", which is the
 * question that produced the 22 Aug dead end (`vin-belongs-to-somebody.test.ts`).
 */
export const VIN_ALREADY_YOURS = 'That car is already in your garage.';

export const VIN_HELD_ELSEWHERE = `This VIN is already registered to another Tappet account. If you have just bought this vehicle, contact ${CONTACT_EMAIL} and we will transfer it.`;

export interface VinConflict {
  error: string;
  /** The caller's own car with this VIN, to go to. Never another account's. */
  vehicleId?: string;
}

export async function explainVinConflict(
  client: SupabaseClient,
  userId: string,
  vin: string
): Promise<VinConflict> {
  const { data: owned } = await client
    .from('vehicles')
    .select('id')
    .eq('vin', vin)
    .eq('user_id', userId)
    .maybeSingle();

  if (owned?.id) return { error: VIN_ALREADY_YOURS, vehicleId: owned.id as string };

  logger.warn(
    'VIN:GLOBAL_KEY_STILL_APPLIED',
    'A VIN held by another account refused this save — 20261001120000 is not applied',
    { vinLength: vin.length }
  );
  return { error: VIN_HELD_ELSEWHERE };
}
