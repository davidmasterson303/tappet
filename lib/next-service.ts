import { getServiceRoleClient } from '@/lib/supabase';
import { logger } from '@tappet/core/logger';
import { evaluateSchedule, nextService } from '@tappet/core/service-due';
import { historyLookups } from '@tappet/core/service-history';

/**
 * The garage row's next service, projected from the schedule and the odometer
 * — written when the research lands, not only at 3 am.
 *
 * ── Why this exists (20 Sep) ────────────────────────────────────────────────
 *
 * `next_service_label` and `next_service_at_miles` were written by the
 * nightly sweep alone. The web's NEXT SERVICE cell and the phone's both read
 * them, so every car — added on the web or the phone — said "No schedule
 * yet" until 17:00 UTC the next day, while its knowledge base already held a
 * nine-line schedule. The research log made that visible: its schedule line
 * could only say "9 services on the schedule; nothing projected yet", which
 * is true and useless. This is the same projection the sweep makes, run
 * once when the dossier is written, so the line reads "Next up: …" and the
 * cell fills in with the rest of the car.
 *
 * ── The same maths as the sweep, on purpose ─────────────────────────────────
 *
 * `evaluateSchedule` and `nextService` are core's; `historyLookups` reads
 * the filed invoices the same way. The sweep keeps its own copy of this
 * block because it needs the evaluated services for the raise gate as well,
 * and the guards read that loop as text; `next-service-projection.test.ts`
 * holds the two write sites to the same three columns so they cannot drift.
 *
 * Best-effort, like the sweep's write: a failure here is logged and stepped
 * over. The research succeeded; the column keeps whatever it had, and the
 * sweep will project again tonight.
 */
export interface ProjectedService {
  service: string | null;
  dueAtMiles: number | null;
}

export async function projectNextService(vehicleId: string): Promise<ProjectedService | null> {
  const client = getServiceRoleClient();
  try {
    const [{ data: vehicle }, { data: knowledge }, { data: history }] = await Promise.all([
      client.from('vehicles').select('current_mileage').eq('id', vehicleId).maybeSingle(),
      client.from('vehicle_knowledge_base').select('maintenance_schedule').eq('vehicle_id', vehicleId).maybeSingle(),
      client
        .from('maintenance_line_items')
        .select('item_description, service_date, mileage_at_service, source')
        .eq('vehicle_id', vehicleId),
    ]);

    const mileage = typeof vehicle?.current_mileage === 'number' ? vehicle.current_mileage : 0;
    const schedule = knowledge?.maintenance_schedule;
    // No odometer or no schedule is nothing to project — not a zero.
    if (mileage <= 0 || !Array.isArray(schedule) || schedule.length === 0) return null;

    const services = evaluateSchedule({
      schedule,
      currentMileage: mileage,
      today: new Date().toISOString().slice(0, 10),
      ...historyLookups(history ?? []),
    });
    const upcoming = nextService(services);

    const { error } = await client
      .from('vehicles')
      .update({
        next_service_label: upcoming?.service ?? null,
        // Null when the service is date-driven. Not zero — see the migration.
        next_service_at_miles: upcoming?.dueAtMiles ?? null,
        next_service_updated_at: new Date().toISOString(),
      })
      .eq('id', vehicleId);
    if (error) {
      logger.warn('NEXT_SERVICE:WRITE_FAILED', 'Could not store the next service', { vehicleId, error: error.message });
      return null;
    }
    return { service: upcoming?.service ?? null, dueAtMiles: upcoming?.dueAtMiles ?? null };
  } catch (error) {
    logger.warn('NEXT_SERVICE:PROJECTION_FAILED', 'Could not project the next service', {
      vehicleId,
      error: (error as Error).message,
    });
    return null;
  }
}
