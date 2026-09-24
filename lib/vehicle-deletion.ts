import { getServiceRoleClient } from '@/lib/supabase';
import { listObjectsRecursive, purgeVehicleStorage } from '@/lib/storage-purge';
import { logger } from '@tappet/core/logger';
import { normaliseRecalls } from '@tappet/core/recalls';
import { vehicleStoragePrefixes } from '@tappet/core/storage-paths';

/**
 * Removing a vehicle — what goes, and the one path that removes it.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ THIS MODULE AUTHORIZES NOTHING. EVERY CALLER MUST AUTHORIZE FIRST.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Same split as `vehicle-research.ts`, for the same reason: the web action
 * and the phone route authorize differently, and the thing they share must
 * not be a `'use server'` export. Both callers run `authorizeVehicleAccess`
 * with a write intent before reaching here, which also refuses the demo.
 *
 * ── Why this exists (20 Sep) ────────────────────────────────────────────────
 *
 * The phone could not remove a car at all — no route — and the web's
 * `deleteVehicle` removed the row and trusted the cascade. The cascade is
 * real (proven per table, 20 Sep) and it does not reach the bucket: the
 * receipt photograph outlived its row every time. That matters beyond CRUD
 * because of the sentence David chose for the privacy policy the same day:
 * *"We keep the photograph of a receipt for as long as you keep the vehicle
 * it belongs to. Delete the vehicle and its receipts go with it."* A
 * phone-only owner could not delete a vehicle, and a web owner who did left
 * the receipts behind. The sentence stays unpublished until both halves are
 * proven on the host; this module is the second half.
 *
 * ── The order, and it is load-bearing ───────────────────────────────────────
 *
 *   1. Purge the storage objects. They have no foreign key; once the row is
 *      gone their paths are unrecoverable and they are orphaned forever.
 *   2. Delete the row. Every child table cascades (proven 20 Sep:
 *      vehicle_documents, vehicle_knowledge_base, nhtsa_data,
 *      vehicle_health_summary, vehicle_health_history,
 *      maintenance_line_items, recall_actions, recall_notifications,
 *      service_notifications, wishlist_items, consultant_conversations).
 *      `ai_usage_events.vehicle_id` is `ON DELETE SET NULL`: the spend
 *      survives, the identity does not — decided in that migration and left
 *      as it is.
 *
 * ⚠ Unlike account deletion, a purge that fails **refuses the removal**.
 * Account deletion proceeds on a partial purge because Guideline 5.1.1(v)
 * requires deletion to work; no guideline forces a vehicle removal, and the
 * promise is the thing being fixed. A car that is still in the garage with
 * "could not remove 2 photographs — try again" is honest; a car that is
 * gone with its photographs still in the bucket is the defect.
 *
 * ── The inventory ───────────────────────────────────────────────────────────
 *
 * The confirmation the phone shows is built from rows, the way the research
 * log is: "24 open recalls", "6 service records", "3 receipt photographs".
 * A count that cannot be read is `null` and the line is not drawn — nothing
 * on screen that no row supports. "Are you sure?" tells the owner nothing;
 * this tells them exactly what is about to go.
 */

export interface VehicleRemovalInventory {
  vehicle: { id: string; year: number | null; make: string | null; model: string | null };
  /** Campaigns on file minus those marked repaired. */
  openRecalls: number | null;
  markedRepaired: number | null;
  /** Filed line items — invoices and manual records alike. */
  serviceRecords: number | null;
  /** Objects in the bucket under the vehicle's prefixes. */
  receiptPhotographs: number | null;
  hasHealthScore: boolean | null;
  hasSchedule: boolean | null;
  advisorThreads: number | null;
  needs: number | null;
}

type Client = ReturnType<typeof getServiceRoleClient>;

async function count(client: Client, table: string, vehicleId: string): Promise<number | null> {
  const { count: n, error } = await client
    .from(table)
    .select('*', { count: 'exact', head: true })
    .eq('vehicle_id', vehicleId);
  if (error) {
    logger.warn('VEHICLE_REMOVAL:COUNT_FAILED', 'Could not count a table for the confirmation', {
      vehicleId,
      table,
      error: error.message,
    });
    return null;
  }
  return n ?? 0;
}

/** What removing this vehicle would take with it, from the rows. */
export async function inventoryVehicleRemoval(vehicleId: string): Promise<VehicleRemovalInventory | null> {
  const client = getServiceRoleClient();
  const { data: vehicle } = await client
    .from('vehicles')
    .select('id, year, make, model')
    .eq('id', vehicleId)
    .maybeSingle();
  if (!vehicle) return null;

  const [nhtsa, actions, records, health, knowledge, threads, needs] = await Promise.all([
    client.from('nhtsa_data').select('recalls').eq('vehicle_id', vehicleId).maybeSingle(),
    count(client, 'recall_actions', vehicleId),
    count(client, 'maintenance_line_items', vehicleId),
    client.from('vehicle_health_summary').select('health_score').eq('vehicle_id', vehicleId).maybeSingle(),
    client.from('vehicle_knowledge_base').select('maintenance_schedule').eq('vehicle_id', vehicleId).maybeSingle(),
    count(client, 'consultant_conversations', vehicleId),
    count(client, 'wishlist_items', vehicleId),
  ]);

  let receiptPhotographs: number | null = 0;
  for (const prefix of vehicleStoragePrefixes(vehicleId)) {
    const { paths, failures } = await listObjectsRecursive(client, prefix);
    if (failures.length > 0) {
      receiptPhotographs = null;
      break;
    }
    receiptPhotographs += paths.length;
  }

  const campaigns = nhtsa.error ? null : normaliseRecalls(nhtsa.data?.recalls).length;
  const repaired = actions;
  return {
    vehicle: {
      id: vehicle.id,
      year: (vehicle.year as number | null) ?? null,
      make: (vehicle.make as string | null) ?? null,
      model: (vehicle.model as string | null) ?? null,
    },
    openRecalls: campaigns === null || repaired === null ? null : Math.max(0, campaigns - repaired),
    markedRepaired: repaired,
    serviceRecords: records,
    receiptPhotographs,
    hasHealthScore: health.error ? null : Boolean(health.data),
    hasSchedule: knowledge.error
      ? null
      : Array.isArray(knowledge.data?.maintenance_schedule) && knowledge.data!.maintenance_schedule.length > 0,
    advisorThreads: threads,
    needs,
  };
}

export type RemoveVehicleOutcome =
  | { ok: true; removed: { storageObjects: number } }
  | { ok: false; reason: 'missing' | 'storage' | 'row'; error: string; leftBehind?: number };

/** Remove the vehicle: its objects first, then the row and everything that cascades. */
export async function removeVehicle(vehicleId: string): Promise<RemoveVehicleOutcome> {
  const client = getServiceRoleClient();
  const { data: vehicle } = await client.from('vehicles').select('id').eq('id', vehicleId).maybeSingle();
  if (!vehicle) return { ok: false, reason: 'missing', error: 'Vehicle not found or already removed' };

  const purge = await purgeVehicleStorage(client, [vehicleId]);
  if (purge.failures.length > 0) {
    logger.error('VEHICLE_REMOVAL:STORAGE', new Error(purge.failures.join('; ')), { vehicleId });
    return {
      ok: false,
      reason: 'storage',
      error: 'Could not remove every receipt photograph, so nothing was removed. Try again.',
      leftBehind: purge.failures.length,
    };
  }

  const { data, error } = await client.from('vehicles').delete().eq('id', vehicleId).select('id');
  if (error) {
    logger.error('VEHICLE_REMOVAL:ROW', new Error(error.message), { vehicleId });
    return { ok: false, reason: 'row', error: 'Could not remove the vehicle. Try again.' };
  }
  if (!data || data.length === 0) {
    return { ok: false, reason: 'missing', error: 'Vehicle not found or already removed' };
  }
  logger.info('VEHICLE_REMOVAL:DONE', 'Vehicle removed', { vehicleId, storageObjects: purge.removed });
  return { ok: true, removed: { storageObjects: purge.removed } };
}
