import { NextRequest } from 'next/server';
import { requireInternalSecret } from '@/lib/internal-secret';
import { failPlate } from '@/lib/plates';

/**
 * `POST /api/internal/plates/fail` — the background function records why it
 * could not finish. Body `{ key, error }`. The row goes `failed` and the next
 * request for the same generation retries it.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const refused = requireInternalSecret(request);
  if (refused) return refused;
  let body: { key?: unknown; error?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const key = typeof body.key === 'string' ? body.key : '';
  if (!key) return Response.json({ success: false, error: 'Missing key' }, { status: 400 });
  await failPlate(key, typeof body.error === 'string' && body.error ? body.error : 'unknown failure');
  return Response.json({ success: true });
}
