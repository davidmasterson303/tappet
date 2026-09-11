import type { FleetSummary } from '@tappet/core/fleet-summary';

/**
 * The three facts a garage header can carry, as a mono stat strip.
 *
 * `app/page.tsx` draws this inline for the demo garage, and the signed-in
 * garage now carries the same strip — the locked signed-in brief (B5) asks for
 * "the landing's mono stat strip" by name. Same labels, same type, same
 * tabular numerals, so the two garages read as one product. The landing keeps
 * its inline copy for now; it is graded on its own loop.
 *
 * ── ⚠ What it refuses to say, and how it says so ────────────────────────────
 *
 * The landing's version *omits* a cell it cannot fill. This version prints an
 * em dash instead — the brief's wording is "em dash where the data cannot
 * say" — and the dash is doing §10's job: it is "we cannot say", rendered as a
 * non-reading rather than as a zero. Three rules, all this codebase's standing
 * ones, and all inherited from `fleetSummary`:
 *
 *   - **Average health is over scored cars only**, and the label says how many
 *     when that is not all of them. `null` — nothing scored — is the dash,
 *     never 0.
 *   - **Open recalls prints a count only when there is one.** A count of zero
 *     may mean the lookup never ran (§10), and the garage query does not
 *     select `lookup_status` — so there is no way to tell a clean car from an
 *     unchecked one here, and the dash is the honest cell. A non-empty count is
 *     evidence in itself (`recallsAreKnown` in core), so that one is printed.
 *   - **An empty garage reads 0 / — / —.** Zero cars is a fact; an average and a
 *     recall count over nothing are not.
 */
export function FleetStrip({ fleet, className = '' }: { fleet: FleetSummary; className?: string }) {
  const partial = fleet.averageScore !== null && fleet.scored < fleet.count;

  return (
    <dl className={`flex flex-wrap items-baseline gap-x-10 gap-y-3 ${className}`}>
      <div>
        <dt className="mono text-xs uppercase tracking-[0.18em] text-white/55">In the garage</dt>
        <dd className="mono num mt-1 text-2xl text-white tabular-nums">{fleet.count}</dd>
      </div>

      <div>
        <dt className="mono text-xs uppercase tracking-[0.18em] text-white/55">
          Average health{partial ? ` · ${fleet.scored} of ${fleet.count}` : ''}
        </dt>
        <dd className="mono num mt-1 text-2xl text-white tabular-nums">
          {fleet.averageScore === null ? <Unknown /> : fleet.averageScore}
        </dd>
      </div>

      <div>
        <dt className="mono text-xs uppercase tracking-[0.18em] text-white/55">Open recalls</dt>
        {/* A recall is on the sodium axis like every other warning in the system. */}
        {fleet.openRecalls > 0 ? (
          <dd className="mono num mt-1 text-2xl tabular-nums" style={{ color: 'var(--critical)' }}>
            {fleet.openRecalls}
          </dd>
        ) : (
          <dd className="mono num mt-1 text-2xl text-white tabular-nums">
            <Unknown />
          </dd>
        )}
      </div>
    </dl>
  );
}

/**
 * The non-reading. An em dash for sighted readers, "not known" for a screen
 * reader — a bare dash is announced as nothing at all, which would turn "we
 * cannot say" into silence.
 */
function Unknown() {
  return (
    <>
      <span aria-hidden="true">—</span>
      <span className="sr-only">not known</span>
    </>
  );
}
