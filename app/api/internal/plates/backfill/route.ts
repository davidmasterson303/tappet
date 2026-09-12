import { NextRequest } from 'next/server';
import { requireInternalSecret } from '@/lib/internal-secret';
import { backfillPlates } from '@/lib/plates';

/**
 * `POST /api/internal/plates/backfill` — give the cars that predate the
 * plates a plate, and re-trigger any library row still waiting.
 *
 * Body `{ limit? }` (default 20, max 100). Answers the counts. Secret-gated
 * like every internal route. Run it after the plates migration is live, and
 * again until `scanned` reads 0:
 *
 *     curl -X POST -H "x-cron-secret: $CRON_SECRET" \
 *       https://tappet.southmoordigital.com/api/internal/plates/backfill
 *
 * The logic is `backfillPlates` in `lib/plates.ts`, tested without this route.
 */
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  const refused = requireInternalSecret(request);
  if (refused) return refused;
  let limit: number | undefined;
  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
    limit = typeof body.limit === 'number' ? body.limit : undefined;
  } catch {
    limit = undefined;
  }
  try {
    const result = await backfillPlates({ limit });
    return Response.json({ success: true, data: result });
  } catch (error) {
    return Response.json({ success: false, error: (error as Error).message }, { status: 500 });
  }
}
