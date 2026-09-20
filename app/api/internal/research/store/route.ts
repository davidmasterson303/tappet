import { NextRequest } from 'next/server';
import { requireInternalSecret } from '@/lib/internal-secret';
import { recordAiUsageInBackground } from '@/lib/ai-usage';
import { loadVehicleForResearch } from '@/lib/research-job';
import { storeResearchResponse } from '@/lib/vehicle-research';

export const dynamic = 'force-dynamic';

/**
 * The model's answer, checked and written — `storeResearchResponse`, the
 * same parse and the same write the web and the sweep use.
 *
 * The usage is recorded here rather than in the function, per attempt, with
 * the owner as the account charged: the function has the token counts and
 * this route has the metering. A retried research call is billed every time
 * it runs, so a per-dossier row would under-report exactly the calls that
 * cost the most.
 *
 * 200 written · 422 `retry: true`, the model's JSON did not parse or
 * validate and nothing was written — the function may spend again ·
 * 500 the write itself failed, which is not a reason to call the model again.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const refused = requireInternalSecret(request);
  if (refused) return refused;
  let body: { vehicleId?: unknown; text?: unknown; usageMetadata?: unknown; attempt?: unknown; model?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const vehicleId = String(body.vehicleId ?? '');
  const text = typeof body.text === 'string' ? body.text : '';
  if (!vehicleId) return Response.json({ success: false, error: 'Missing vehicleId' }, { status: 400 });

  const loaded = await loadVehicleForResearch(vehicleId);
  if (!loaded) return Response.json({ success: false, error: 'No such vehicle' }, { status: 404 });

  const model = typeof body.model === 'string' ? body.model : 'unknown';
  recordAiUsageInBackground(
    { purpose: 'vehicle_dossier', model, userId: loaded.userId, vehicleId },
    body.usageMetadata
  );

  const attempt = typeof body.attempt === 'number' ? body.attempt : undefined;
  const outcome = await storeResearchResponse(loaded.vehicle, text, { fetchRecalls: false, attempt });
  if (outcome.retry) {
    return Response.json({ success: false, retry: true, error: outcome.error ?? 'Could not read the answer' }, { status: 422 });
  }
  if (!outcome.success) {
    return Response.json({ success: false, error: outcome.error ?? 'Could not save the research' }, { status: 500 });
  }
  return Response.json({ success: true, unsupported: outcome.unsupported === true });
}
