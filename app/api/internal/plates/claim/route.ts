import { NextRequest } from 'next/server';
import { requireInternalSecret } from '@/lib/internal-secret';
import { claimPlate } from '@/lib/plates';

/**
 * `POST /api/internal/plates/claim` — the background function takes a row.
 *
 * Body `{ key }`. Answers `200 { prompt, model }` when the caller now holds
 * the row, `204` when there is nothing to do (ready, or freshly claimed by
 * another job), `429` when the day's cap is spent, `404` for a key nobody
 * asked for. Secret-guarded like every internal route; see
 * `lib/internal-secret.ts`. The logic is `claimPlate` in `lib/plates.ts`,
 * tested without this route in the loop.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const refused = requireInternalSecret(request);
  if (refused) return refused;
  let key = '';
  try {
    key = String(((await request.json()) as { key?: unknown }).key ?? '');
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!key) return Response.json({ success: false, error: 'Missing key' }, { status: 400 });

  const claim = await claimPlate(key);
  if (claim.claimed) {
    return Response.json({ success: true, prompt: claim.row.prompt, model: claim.row.model });
  }
  if (claim.reason === 'missing') return Response.json({ success: false, error: 'No such plate' }, { status: 404 });
  if (claim.reason === 'capped') return Response.json({ success: false, error: 'Daily cap reached' }, { status: 429 });
  return new Response(null, { status: 204 });
}
