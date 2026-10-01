import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@tappet/core/logger';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { recomputePerformanceStats } from '@/lib/performance-stats';

export const dynamic = 'force-dynamic';

/**
 * HTTP wrapper. The work is in `lib/performance-stats.ts` so that in-process
 * callers — `app/api/wishlist/complete/route.ts` — can reach it without an
 * internal HTTP request that had to carry a forwarded session cookie.
 */
export async function POST(request: NextRequest) {
  try {
    const { vehicleId, forceRefresh, aiConsent } = await request.json();

    // Authorize before spending anything: this route invokes Gemini, so an
    // unauthenticated caller must not get as far as the model.
    const access = await authorizeVehicleAccess(vehicleId, { intent: 'read' });
    if (!access.ok) {
      return access.response;
    }

    // Meter AI spend per user rather than per IP — IP is the wrong unit for a
    // cost control, since one user can hold many and many users share one.
    const identifier = access.userId ?? getClientIdentifier(request, 'ai');
    const rateLimit = await checkRateLimit(identifier, 'ai');
    if (!rateLimit.allowed) {
      logger.warn('PERF_STATS:RATE_LIMIT', 'Rate limit exceeded', { identifier });
      return rateLimitResponse(rateLimit) as NextResponse;
    }

    const result = await recomputePerformanceStats({
      vehicleId,
      client: access.client,
      userId: access.userId,
      isDemo: access.isDemo,
      /*
        LEGAL-11: the browser's answer, sent by the caller. Absent is no —
        the row's figures are served and nothing goes to Google. Only the
        website calls this route; no phone build does.
      */
      consented: aiConsent === 'granted',
      forceRefresh,
    });

    if (!result.ok) {
      // A gate refusal carries its code and feature beside the sentence —
      // E6's wire — so a client opens the paywall on the code, never on 402.
      return NextResponse.json(
        { error: result.error, ...(result.code ? { code: result.code, feature: result.feature } : {}) },
        { status: result.status }
      );
    }

    return NextResponse.json({
      success: true,
      cached: result.cached,
      stats: result.stats,
      ...(result.consentNeeded ? { consentNeeded: true } : {}),
    });
  } catch (error) {
    logger.error('PERF_STATS:EXCEPTION', error as Error);
    return NextResponse.json({ error: 'Tappet could not work out those figures just now. Try again in a moment.' }, { status: 500 });
  }
}
