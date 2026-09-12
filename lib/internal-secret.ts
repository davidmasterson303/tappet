/**
 * The shared secret every internal route checks.
 *
 * Lifted from `app/api/internal/notify-sweep/route.ts` for the plate routes,
 * unchanged in behaviour: `CRON_SECRET`, sent as `x-cron-secret`, compared in
 * constant time, and **failing closed** — an unset secret is a misconfigured
 * deploy, not permission. The sweep route keeps its own copy and its own
 * docblock; the two must agree, and `internal-secret.test.ts` says so.
 *
 * ⚠ The 503 for "not configured" is distinguishable from the 401 for "wrong".
 * That is deliberate and inherited: it is how a silently inert scheduled job
 * gets diagnosed from outside (12 Aug), and it tells an attacker nothing
 * worth having.
 */
import { timingSafeEqual } from 'node:crypto';

export const INTERNAL_SECRET_HEADER = 'x-cron-secret';

export function secretMatches(provided: string | null | undefined, expected: string): boolean {
  if (provided === null || provided === undefined) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * `null` when the caller may proceed; otherwise the response to return.
 */
export function requireInternalSecret(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return Response.json({ success: false, error: 'Not configured' }, { status: 503 });
  }
  if (!secretMatches(request.headers.get(INTERNAL_SECRET_HEADER), secret)) {
    return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
