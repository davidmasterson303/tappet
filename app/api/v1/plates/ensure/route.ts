import { NextRequest } from 'next/server';
import { logger } from '@tappet/core/logger';
import type { ApiResponse } from '@tappet/core/types';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { requireCaller } from '@/lib/api-auth';
import { ensurePlate } from '@/lib/plates';

/**
 * `POST /api/v1/plates/ensure` — start a car's generation plate at VIN decode.
 *
 * Body `{ year, make, model, trim? }`; answers `{ key, status }`. The form
 * calls this the moment a VIN decodes, before the owner has filled anything
 * in, so the plate draws behind the form and the research call rather than
 * after them — the first owner of a generation should not wait for it
 * (David, 11 Sep). Signed-in callers only: a plate is a paid image call and
 * this is its front door. Rate-limited like every route here.
 *
 * ⚠ Never slow and never fatal to the caller: `ensurePlate` makes one short
 * text call and one upsert, and returns `{ key: null }` for anything it
 * cannot do. The form does not wait on this request at all.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(identifier, 'default');
  if (!rateLimit.allowed) {
    logger.warn('API:PLATES_ENSURE', 'Rate limit exceeded', { identifier });
    return rateLimitResponse(rateLimit);
  }
  const caller = await requireCaller();
  if (!caller.ok) return caller.response;

  let body: { year?: unknown; make?: unknown; model?: unknown; trim?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' } as ApiResponse, { status: 400 });
  }
  const year = Number(body.year);
  const make = typeof body.make === 'string' ? body.make.trim() : '';
  const model = typeof body.model === 'string' ? body.model.trim() : '';
  if (!Number.isInteger(year) || !make || !model) {
    return Response.json({ success: false, error: 'Need a year, make and model' } as ApiResponse, { status: 400 });
  }
  const result = await ensurePlate({
    year,
    make,
    model,
    trim: typeof body.trim === 'string' ? body.trim : null,
  });
  return Response.json({ success: true, data: result });
}
