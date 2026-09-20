import { NextRequest } from 'next/server';
import { requireInternalSecret } from '@/lib/internal-secret';
import { claimResearch } from '@/lib/research-job';

export const dynamic = 'force-dynamic';

/**
 * The background function's first question: is there research to do for
 * this car, and what is the prompt.
 *
 * Secret-gated like the plate routes, and for the same reason: a public
 * route that hands out the most expensive prompt in the product would be the
 * unbounded-cost bug with a friendlier name. What decides — gate, ceiling,
 * already-done — is `prepareResearch`, the code the web and the sweep run.
 *
 * 200 with the prompt · 204 nothing to do (already researched) ·
 * 403 refused (gate or ceiling, with the sentence) · 404 no such car.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const refused = requireInternalSecret(request);
  if (refused) return refused;
  let vehicleId = '';
  try {
    vehicleId = String(((await request.json()) as { vehicleId?: unknown }).vehicleId ?? '');
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!vehicleId) return Response.json({ success: false, error: 'Missing vehicleId' }, { status: 400 });

  const claim = await claimResearch(vehicleId);
  if (claim.claimed) {
    return Response.json({
      success: true,
      prompt: claim.prompt,
      model: claim.model,
      generationConfig: claim.generationConfig,
    });
  }
  if (claim.reason === 'missing') return Response.json({ success: false, error: 'No such vehicle' }, { status: 404 });
  if (claim.reason === 'refused') return Response.json({ success: false, error: claim.error ?? 'Refused' }, { status: 403 });
  return new Response(null, { status: 204 });
}
