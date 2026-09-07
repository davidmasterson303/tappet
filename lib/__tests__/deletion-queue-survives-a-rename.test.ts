/**
 * A queued deletion must survive the product being renamed.
 *
 * ── Why this is a test and not a comment ────────────────────────────────────
 *
 * `deletionRecoveryQueue` holds deletions the server refused and the browser
 * promised to retry. `localStorage` is addressed only by key, so renaming the
 * key does not leave stale data behind — it leaves a deletion the owner asked
 * for that now silently never completes, in a queue nothing will ever read
 * again. No error, no log, no missing row. CLAUDE.md §6: the defects that
 * matter here are silent.
 *
 * ⚠ **It has already happened once.** `06af505` (6 Sep) moved the key from
 * `crewchief-failed-deletions` to `tappet-failed-deletions` as a plain string
 * swap. Every entry queued before that date is still sitting under the old key
 * in whatever browser wrote it. The 7 Sep rename to `tappet-` would have made
 * that twice, which is what this file exists to stop — and the drain it pins
 * recovers the 6 Sep casualties on the way past.
 *
 * The module builds its singleton at import, so each case seeds storage first
 * and then re-imports under `isolateModules`. Importing at the top of the file
 * would run the constructor once, against an empty store, before any test.
 */

const CURRENT = 'tappet-failed-deletions';
const SUPERSEDED = ['wellkept-failed-deletions', 'crewchief-failed-deletions'];

type Entry = { vehicleId: string; attemptedAt: string; error: string; retryCount: number };

const entry = (vehicleId: string, error = 'boom'): Entry => ({
  vehicleId,
  attemptedAt: '2026-09-07T00:00:00.000Z',
  error,
  retryCount: 0,
});

/** Import the module fresh, so its constructor reads what the test just wrote. */
function loadQueue() {
  let queue!: typeof import('../deletion-recovery').deletionRecoveryQueue;
  jest.isolateModules(() => {
    queue = require('../deletion-recovery').deletionRecoveryQueue;
  });
  return queue;
}

beforeEach(() => {
  localStorage.clear();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('a queued deletion survives the key being renamed', () => {
  it('adopts entries stranded under every superseded key', () => {
    /*
      The regression in one line: two renames, two dead keys, and an owner who
      asked for both cars to be deleted.
    */
    localStorage.setItem('wellkept-failed-deletions', JSON.stringify([entry('v-wellkept')]));
    localStorage.setItem('crewchief-failed-deletions', JSON.stringify([entry('v-crewchief')]));

    const ids = loadQueue()
      .getAllFailedDeletions()
      .map((d) => d.vehicleId)
      .sort();

    expect(ids).toEqual(['v-crewchief', 'v-wellkept']);
  });

  it('rewrites what it adopted under the current key, so a reload keeps it', () => {
    localStorage.setItem('wellkept-failed-deletions', JSON.stringify([entry('v1')]));

    loadQueue();

    // Persisted forward…
    const persisted = JSON.parse(localStorage.getItem(CURRENT) ?? 'null');
    expect(persisted).toEqual([expect.objectContaining({ vehicleId: 'v1' })]);

    // …and the drained keys are gone, so this runs once per browser and not
    // forever. A fallback nobody can prove is still reachable is the rot
    // `site-role.ts` warns about; a drain has an end.
    for (const key of SUPERSEDED) expect(localStorage.getItem(key)).toBeNull();

    // The reload itself: a second construction still sees the entry.
    expect(loadQueue().getFailedDeletionCount()).toBe(1);
  });

  it('lets the current key win a collision, rather than the older one', () => {
    /*
      Both keys can name the same vehicle: a deletion failed, the app updated,
      and it failed again. The newer attempt is the true one — adopting over it
      would resurrect a superseded error string and an older retryCount.
    */
    localStorage.setItem(CURRENT, JSON.stringify([{ ...entry('v1', 'current'), retryCount: 3 }]));
    localStorage.setItem('wellkept-failed-deletions', JSON.stringify([entry('v1', 'stale')]));

    const found = loadQueue().getFailedDeletion('v1');

    expect(found?.error).toBe('current');
    expect(found?.retryCount).toBe(3);
  });

  it('can still detect the regression it was written for', () => {
    /*
      ⚠ The anti-vacuous case, per CLAUDE.md §5. Every assertion above passes if
      the queue simply loads its own key and the store happens to be empty, so
      this states the failure directly: with only a superseded key populated, a
      queue that does not drain reports zero — which is precisely how the 6 Sep
      rename looked from the outside, and it looked fine.
    */
    localStorage.setItem('wellkept-failed-deletions', JSON.stringify([entry('v1')]));
    expect(localStorage.getItem(CURRENT)).toBeNull();

    expect(loadQueue().getFailedDeletionCount()).toBe(1);

    // And the same queue reports nothing when there genuinely is nothing,
    // so the count above is evidence rather than a constant.
    localStorage.clear();
    expect(loadQueue().getFailedDeletionCount()).toBe(0);
  });

  it('survives a superseded key holding something that is not a queue', () => {
    // localStorage is shared with everything else on the origin, and a rename
    // is exactly when a half-written or foreign value turns up under an old
    // name. Throwing here would take out the whole recovery queue on load.
    localStorage.setItem(CURRENT, JSON.stringify([entry('v1')]));
    localStorage.setItem('wellkept-failed-deletions', 'not json');
    localStorage.setItem('crewchief-failed-deletions', JSON.stringify({ not: 'an array' }));

    expect(loadQueue().getFailedDeletionCount()).toBe(1);
  });
});
