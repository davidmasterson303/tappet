import { type NextRequest } from 'next/server';
import type { ApiResponse } from '@tappet/core/types';
import { logger } from '@tappet/core/logger';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { startResearch } from '@/lib/research-job';

export const dynamic = 'force-dynamic';

/**
 * Start a car's research from the phone.
 *
 * ── The gap this is (20 Sep) ────────────────────────────────────────────────
 *
 * `POST /api/v1/vehicles` seeds `research_status: 'pending'` and, until
 * tonight, nothing a phone could reach ever moved it: `VehicleInsights` is a
 * web component on a cookie-authenticated action. So the first car ever
 * saved from the phone sat at "No score yet" while the form had promised "a
 * few seconds". This is the trigger; `lib/research-job.ts` carries the
 * shape (a background function, because the dossier is 23–60 s), and
 * `research-milestones.ts` is how the phone narrates what lands.
 *
 * ── What it answers ─────────────────────────────────────────────────────────
 *
 *   202 `state: 'researching'`   a job is running — started now, or already
 *   200 `state: 'completed'`     the dossier exists; nothing was spent
 *   200 `state: 'unsupported'`   researched, and not enough on record
 *   404                          no knowledge row — the car was never seeded
 *
 * Idempotent on purpose: the detail screen calls this whenever it opens a
 * pending car, and a remount within the in-flight window finds the job
 * already running rather than paying for it twice. `failed` starts again —
 * that is the retry, and the sweep never offers a failed car.
 *
 * ── What it does not do ─────────────────────────────────────────────────────
 *
 * It does not wait, and it does not score. The score is Flash and seconds,
 * so it stays interactive: the phone asks `/api/v1/health` once the dossier
 * has landed, exactly as the web does after research.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const rateLimit = await checkRateLimit(getClientIdentifier(request), 'default');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ success: false, error: 'Expected a JSON body' } as ApiResponse, { status: 400 });
  }

  const vehicleId = typeof body.vehicleId === 'string' ? body.vehicleId : null;
  const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
  if (!access.ok) return access.response;

  /*
    The per-vehicle AI limiter, as the web action applies it: the trigger is
    not itself a model call, but it starts one, and a client looping on it
    would be a client looping on the most expensive call in the product.
  */
  const ai = await checkRateLimit(`research:${vehicleId}`, 'ai');
  if (!ai.allowed) return rateLimitResponse(ai);

  const state = await startResearch(vehicleId as string);
  if (state === 'no-row') {
    return Response.json({ success: false, error: 'This car has no research record' } as ApiResponse, { status: 404 });
  }
  logger.info('API:RESEARCH', 'Research trigger', { vehicleId, state });
  return Response.json({ success: true, state } as ApiResponse, { status: state === 'researching' ? 202 : 200 });
}
