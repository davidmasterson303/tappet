import DevGarage, { type DevGarageState } from './DevGarage';

/**
 * `/dev/garage` — the signed-in garage, renderable without a session.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * `/garage` is in `PROTECTED_ROUTES`, so the design-critic loop's anonymous
 * capture 307s to `/login` and the page went unjudged through two locked
 * briefs. The one dev credential the repo knew of does not authenticate (11
 * Sep), and minting a session is not something an agent may do. The phone hit
 * the same wall twice; its `dev/fixtures.ts` records the lesson this follows —
 * the screens need data, not a session.
 *
 * Unreachable in production: `app/dev/layout.tsx` calls `notFound()` for
 * everything under `/dev` (SEC-10), and `app/robots.ts` disallows the prefix.
 *
 *   /dev/garage                the demo garage's real rows
 *   /dev/garage?state=empty    the empty state
 *   /dev/garage?state=error    the error state
 *   /dev/garage?state=loading  the loading state
 */
const STATES: DevGarageState[] = ['demo', 'empty', 'error', 'loading'];

export default function DevGaragePage({
  searchParams,
}: {
  searchParams?: { state?: string };
}) {
  const requested = searchParams?.state;
  const state = STATES.find((s) => s === requested) ?? 'demo';
  return <DevGarage state={state} />;
}
