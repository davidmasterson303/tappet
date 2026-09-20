import { NextRequest } from 'next/server';
import { requireInternalSecret } from '@/lib/internal-secret';
import { markResearchFailed } from '@/lib/vehicle-research';
import { logger } from '@tappet/core/logger';

export const dynamic = 'force-dynamic';

/**
 * The job could not finish: the row goes to 'failed'.
 *
 * That write is what the phone's log reads as "The research did not finish"
 * with a retry, and what stops the sweep offering the car every night —
 * `vehiclesToGenerate` selects 'pending' only. Leaving the row pending would
 * read as a job still running, forever; this is the one exit that says so.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const refused = requireInternalSecret(request);
  if (refused) return refused;
  let body: { vehicleId?: unknown; error?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const vehicleId = String(body.vehicleId ?? '');
  if (!vehicleId) return Response.json({ success: false, error: 'Missing vehicleId' }, { status: 400 });

  logger.error('RESEARCH_JOB:FAILED', new Error(String(body.error ?? 'unknown')), { vehicleId });
  await markResearchFailed(vehicleId);
  return Response.json({ success: true });
}
