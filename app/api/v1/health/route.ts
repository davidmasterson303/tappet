import { type NextRequest } from 'next/server';
import type { ApiResponse } from '@tappet/core/types';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { generateVehicleHealthSummary } from '@/app/actions';

export const dynamic = 'force-dynamic';

/**
 * Score a car from the phone.
 *
 * `generateVehicleHealthSummary` is the free tier's one model call — Flash,
 * LOW thinking, seconds — and until 20 Sep only web components ever made it,
 * so no phone-only car has ever had a score. It authorizes for itself
 * (`authorizeVehicleAccess`, which reads the bearer token here as it reads
 * the cookie on the web), rate-limits per car, respects the monthly ceiling
 * and serves a summary younger than a day from cache unless `refresh` is
 * true — which the phone sends once, when it has just watched the research
 * land, the way the web's `VehicleInsights` forces a refresh after research.
 *
 * The action's failures are sentences, not codes; they are answered as 502
 * with the sentence, which the research log prints on the score's line.
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

  const result = await generateVehicleHealthSummary(vehicleId as string, body.refresh === true);
  if (!result.success) {
    return Response.json({ success: false, error: result.error ?? 'Could not score this car' } as ApiResponse, {
      status: 502,
    });
  }
  return Response.json({ success: true, health: result.data, cached: 'cached' in result && result.cached === true } as ApiResponse);
}
