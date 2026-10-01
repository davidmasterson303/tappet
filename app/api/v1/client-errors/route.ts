import { type NextRequest } from 'next/server';
import type { ApiResponse } from '@tappet/core/types';
import { logger } from '@tappet/core/logger';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { requireCaller } from '@/lib/api-auth';

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

/**
 * ── Audit 360, SEC-7 (1 Oct) · attributable, and anonymous costs more ───────
 *
 * Every report was anonymous at 60/min per address with 4 KB stacks, so a
 * script could bury the one signal this route exists to carry under forged
 * `CLIENT_CRASH` lines during launch week. Three changes:
 *
 *   - **Attributed.** The phone sends its bearer when it has one; a report
 *     that verifies is logged with the account, one that does not says
 *     `anonymous`. A crash on the sign-in screen still arrives.
 *   - **Anonymous is tighter.** A second bucket on the `upload` tier (5/min),
 *     and stacks cut to 1 KB. A signed-in owner keeps the full 4 KB.
 *   - **One line is one line.** The message, `where` and `version` are
 *     printed raw by the logger; a newline in them could start a line that
 *     imitates any other log key. Control characters become spaces.
 */
const ANONYMOUS_STACK = 1_000;

function oneLine(value: string | null): string | null {
  // eslint-disable-next-line no-control-regex
  return value === null ? null : value.replace(/[\u0000-\u001f\u007f]+/g, ' ');
}

function bounded(value: unknown, limit = MAX_FIELD): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, limit) : null;
}

export async function POST(request: NextRequest): Promise<Response> {
  const rateLimit = await checkRateLimit(getClientIdentifier(request), 'default');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const caller = await requireCaller();
  const reporter = caller.ok ? caller.userId : 'anonymous';
  if (!caller.ok) {
    const anonymousLimit = await checkRateLimit(
      `client-errors:anonymous:${getClientIdentifier(request, 'upload')}`,
      'upload'
    );
    if (!anonymousLimit.allowed) return rateLimitResponse(anonymousLimit);
  }
  const stackLimit = caller.ok ? MAX_FIELD : ANONYMOUS_STACK;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ success: false, error: 'Expected a JSON body' } as ApiResponse, { status: 400 });
  }

  const message = oneLine(bounded(body.message, 500));
  if (!message) {
    return Response.json({ success: false, error: 'A message is required' } as ApiResponse, { status: 400 });
  }

  logger.error('CLIENT_CRASH', new Error(message), {
    reporter,
    where: oneLine(bounded(body.where, 120)) ?? 'unknown',
    version: oneLine(bounded(body.version, 40)),
    stack: bounded(body.stack, stackLimit),
    componentStack: bounded(body.componentStack, stackLimit),
  });

  return Response.json({ success: true } as ApiResponse, { status: 202 });
}
