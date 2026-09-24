import { type NextRequest } from 'next/server';
import type { ApiResponse } from '@tappet/core/types';
import { logger } from '@tappet/core/logger';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

/**
 * A screen on the phone threw — write it down where it will be read.
 *
 * ── Why a route and not an SDK (QE 1.4, 20 Sep) ─────────────────────────────
 *
 * The app had no error boundary and no crash reporting: a render exception
 * was the app closing to the home screen, invisible to the owner's account
 * and to us. Crash-reporting SDKs are native modules — a build, and a
 * decision (CLAUDE.md §9). Until one is chosen, the phone's `CrashBoundary`
 * posts here and this logs at error level, which the function logs surface
 * the same way `RESEARCH_JOB:FAILED` and the rest are surfaced.
 *
 * ── Public, bounded, and it stores nothing ──────────────────────────────────
 *
 * Anonymous, because a crash on the sign-in screen is still a crash. The
 * cost of an anonymous endpoint is what an abuser can do with it, and here
 * that is: write lines into our log, rate-limited per client like every
 * other route, with each field cut to a few kilobytes. No table, no model,
 * no read path. If this ever needs to be more than a log line it needs a
 * table and a retention rule — a different route, argued for.
 */
const MAX_FIELD = 4_000;

function bounded(value: unknown, limit = MAX_FIELD): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, limit) : null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const rateLimit = await checkRateLimit(getClientIdentifier(request), 'default');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ success: false, error: 'Expected a JSON body' } as ApiResponse, { status: 400 });
  }

  const message = bounded(body.message, 500);
  if (!message) {
    return Response.json({ success: false, error: 'A message is required' } as ApiResponse, { status: 400 });
  }

  logger.error('CLIENT_CRASH', new Error(message), {
    where: bounded(body.where, 120) ?? 'unknown',
    version: bounded(body.version, 40),
    stack: bounded(body.stack),
    componentStack: bounded(body.componentStack),
  });

  return Response.json({ success: true } as ApiResponse, { status: 202 });
}
