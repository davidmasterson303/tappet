import { getServiceRoleClient } from '@/lib/supabase';
import { logger } from '@tappet/core/logger';
import {
  fetchNHTSARecalls,
  prepareResearch,
  researchVehicleDossier,
  SWEEP_RESEARCH_TIMEOUT_MS,
  type VehicleForResearch,
} from '@/lib/vehicle-research';

/**
 * Research a car from the phone — the job, its trigger, and its claim.
 *
 * ── The gap this closes (20 Sep) ────────────────────────────────────────────
 *
 * `POST /api/v1/vehicles` seeds `research_status: 'pending'` and its docblock
 * said `VehicleInsights` picks that up. `VehicleInsights` is a **web**
 * component calling a cookie-authenticated server action; the phone can never
 * reach it, and no `/api/v1` route started the research. So the first car
 * ever saved from the phone (19 Sep) sat at "No score yet / No schedule yet /
 * no recall count" until its `/vehicle-info` page was opened on the web — and
 * a phone-only owner's car would have waited for the nightly sweep (dossier
 * and recalls the next night, ten cars a night; the score never, since only
 * web components ever wrote one). The add form promised "a few seconds".
 *
 * ── The shape: the plate library's, exactly ─────────────────────────────────
 *
 * The dossier is 23–60 s of a Pro model. The create route cannot hold it and
 * a sync route is not where it belongs: this site's Next routes have been
 * observed running past thirty seconds, but 22 Aug also observed the
 * *response* cut at about thirty while the work carried on — undocumented
 * behaviour, and §8 is about not designing on that. A `*-background`
 * function answers 202 at once and may run fifteen minutes, so the model
 * call lives there (`netlify/functions/research-background.mts`) and,
 * because that file may import nothing with a repo alias, every decision is
 * reached through secret-guarded routes that call this module:
 *
 *   /api/internal/research/claim     the gate, the ceiling, the prompt
 *   /api/internal/research/recalls   NHTSA — first, so the log has lines early
 *   /api/internal/research/store     parse, write, stats
 *   /api/internal/research/fail      the row goes to 'failed'
 *
 * `triggerResearchJob` is what the phone-facing route calls. In development,
 * with no `URL`/`CRON_SECRET`, it runs the same work in-process — the plate
 * library's local fallback, for the same reason: a job that only exists in
 * production is a job nobody has watched run.
 *
 * ── The in-flight rule, without a new column ────────────────────────────────
 *
 * `research_status` is a Postgres enum with no "running" value, and adding
 * one is a migration — David's trip — for a fact the row can already carry.
 * `last_research_date` defaults to the row's `created_at`; the trigger sets
 * it to now when it starts a job. So `pending` with a `last_research_date`
 * that has moved off `created_at` and is younger than `IN_FLIGHT_MS` means a
 * job is running. Older than that, it is a job that died — the phone's own
 * deadline is shorter, and the sweep picks the car up regardless. Two
 * triggers inside the window are one job; the phone screen remounting does
 * not spend twice.
 */

/** How long a started job is believed to be running before a retrigger is allowed. */
export const IN_FLIGHT_MS = 4 * 60_000;

export interface KnowledgeMarker {
  research_status: string | null;
  last_research_date: string | null;
  created_at: string | null;
}

export function researchInFlight(row: KnowledgeMarker | null | undefined, now: Date = new Date()): boolean {
  if (!row || row.research_status !== 'pending') return false;
  if (!row.last_research_date || !row.created_at) return false;
  const started = Date.parse(row.last_research_date);
  const created = Date.parse(row.created_at);
  if (Number.isNaN(started) || Number.isNaN(created)) return false;
  // The default value is the creation instant; a job moves it forward.
  if (started - created < 1_000) return false;
  return now.getTime() - started < IN_FLIGHT_MS;
}

export type TriggerOutcome = 'completed' | 'unsupported' | 'researching' | 'no-row';

/**
 * Start research for a car unless it already has its dossier or a job is
 * running. Returns what the caller should tell the phone.
 */
export async function startResearch(vehicleId: string): Promise<TriggerOutcome> {
  const client = getServiceRoleClient();
  const { data: row } = await client
    .from('vehicle_knowledge_base')
    .select('research_status, last_research_date, created_at')
    .eq('vehicle_id', vehicleId)
    .maybeSingle();

  if (!row) return 'no-row';
  if (row.research_status === 'completed') return 'completed';
  if (row.research_status === 'unsupported') return 'unsupported';
  if (researchInFlight(row as KnowledgeMarker)) return 'researching';

  /*
    A 'failed' row is allowed through: this is the retry the web's button
    performs, and the sweep will never offer a failed car again. The marker
    below is what the in-flight rule reads; it is written before the trigger
    so a second tap while the function is spinning up finds it.
  */
  await client
    .from('vehicle_knowledge_base')
    .update({ research_status: 'pending', last_research_date: new Date().toISOString() })
    .eq('vehicle_id', vehicleId);

  await triggerResearchJob(vehicleId);
  return 'researching';
}

/** Hand the job to the background function, or run it here in development. */
export async function triggerResearchJob(vehicleId: string): Promise<void> {
  const site = process.env.URL;
  const secret = process.env.CRON_SECRET;
  if (site && secret) {
    try {
      const res = await fetch(`${site}/.netlify/functions/research-background`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-cron-secret': secret },
        body: JSON.stringify({ vehicleId }),
      });
      if (res.status !== 202 && !res.ok) {
        logger.warn('RESEARCH_JOB:TRIGGER_REFUSED', 'Background function did not accept the job', {
          vehicleId,
          status: res.status,
        });
      }
    } catch (error) {
      logger.warn('RESEARCH_JOB:TRIGGER_FAILED', 'Could not reach the background function', {
        vehicleId,
        error: (error as Error).message,
      });
    }
    return;
  }
  if (process.env.NODE_ENV !== 'production') {
    void runResearchJobLocally(vehicleId).catch((error) => {
      logger.warn('RESEARCH_JOB:LOCAL_JOB_FAILED', 'Local research job failed', {
        vehicleId,
        error: (error as Error).message,
      });
    });
    return;
  }
  logger.warn('RESEARCH_JOB:NO_TRIGGER', 'No URL/CRON_SECRET; the research stays pending', { vehicleId });
}

/** The car as the research wants it, with its owner for the spend. */
export async function loadVehicleForResearch(
  vehicleId: string
): Promise<{ vehicle: VehicleForResearch; userId: string | null } | null> {
  const { data } = await getServiceRoleClient()
    .from('vehicles')
    .select('id, year, make, model, user_id')
    .eq('id', vehicleId)
    .maybeSingle();
  if (!data) return null;
  return {
    vehicle: { id: data.id, year: data.year, make: data.make, model: data.model },
    userId: (data.user_id as string | null) ?? null,
  };
}

export type ClaimOutcome =
  | { claimed: true; vehicle: VehicleForResearch; userId: string | null; prompt: string; model: string; generationConfig: Record<string, unknown> }
  | { claimed: false; reason: 'missing' | 'done' | 'refused'; error?: string };

/**
 * What the background function asks first: is there work, and what is the
 * prompt. Everything that decides — the gate, the ceiling, the already-done
 * check — is `prepareResearch`, the same code the web and the sweep run.
 */
export async function claimResearch(vehicleId: string): Promise<ClaimOutcome> {
  const loaded = await loadVehicleForResearch(vehicleId);
  if (!loaded) return { claimed: false, reason: 'missing' };
  const prepared = await prepareResearch(loaded.vehicle, loaded.userId);
  if (!prepared.ok) {
    if (prepared.outcome.alreadyResearched) return { claimed: false, reason: 'done' };
    return { claimed: false, reason: 'refused', error: prepared.outcome.error };
  }
  return {
    claimed: true,
    vehicle: loaded.vehicle,
    userId: loaded.userId,
    prompt: prepared.prompt,
    model: prepared.model,
    generationConfig: prepared.generationConfig as unknown as Record<string, unknown>,
  };
}

/**
 * The whole job in-process, for development only. NHTSA first, as the
 * background function does, then the dossier with the sweep's patience —
 * nobody is blocked on it, the log is what they are watching.
 */
export async function runResearchJobLocally(vehicleId: string): Promise<void> {
  const loaded = await loadVehicleForResearch(vehicleId);
  if (!loaded) return;
  const { vehicle, userId } = loaded;
  await fetchNHTSARecalls(vehicle.id, vehicle.year, vehicle.make, vehicle.model);
  await researchVehicleDossier(vehicle, userId, { timeoutMs: SWEEP_RESEARCH_TIMEOUT_MS });
}
