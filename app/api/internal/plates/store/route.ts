import { NextRequest } from 'next/server';
import { requireInternalSecret } from '@/lib/internal-secret';
import { storePlate } from '@/lib/plates';

/**
 * `POST /api/internal/plates/store` — the background function hands back the
 * two derivatives. Body `{ key, hero, card, model? }` with the JPEGs base64;
 * ~300 KB together, well inside a function's request limit. The upload and
 * the row update are `storePlate`, tested without this route.
 */
export const dynamic = 'force-dynamic';

const MAX_B64 = 4 * 1024 * 1024;

export async function POST(request: NextRequest): Promise<Response> {
  const refused = requireInternalSecret(request);
  if (refused) return refused;
  let body: { key?: unknown; hero?: unknown; card?: unknown; model?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ success: false, error: 'Invalid JSON body' }, { status: 400 });
  }
  const key = typeof body.key === 'string' ? body.key : '';
  const hero = typeof body.hero === 'string' ? body.hero : '';
  const card = typeof body.card === 'string' ? body.card : '';
  if (!key || !hero || !card) {
    return Response.json({ success: false, error: 'Missing key, hero or card' }, { status: 400 });
  }
  if (hero.length > MAX_B64 || card.length > MAX_B64) {
    return Response.json({ success: false, error: 'Derivative too large' }, { status: 413 });
  }
  try {
    await storePlate({
      key,
      hero: Buffer.from(hero, 'base64'),
      card: Buffer.from(card, 'base64'),
      model: typeof body.model === 'string' ? body.model : null,
    });
    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
