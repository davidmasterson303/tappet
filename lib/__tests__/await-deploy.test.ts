/**
 * The deploy waiter must recognise the commit it is waiting for.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * On 11 Sep the first real demo promote through `awaitDeploy` printed
 * `still 0986d15c (demo-live)` every 15 s for six minutes — for the exact
 * commit it was waiting for — and then declared the deploy missing. The demo
 * caller passed `git rev-parse demo-live` sliced to eight characters; the
 * waiter compared it with `===` against the full SHA `/api/version` reports.
 * The web caller passed the full SHA, so the same waiter worked there, and
 * nothing in the suite exercised the demo side.
 *
 * CLAUDE.md §5: a guard that cries wolf is worse than none — the next reader
 * of "did not appear within 6 minutes" goes to the Netlify dashboard to debug
 * a deploy that already landed. And §5's other half: the fix must not make the
 * comparison so loose that it matches everything, which is the same failure
 * pointing the other way. Both halves are pinned here, on the pure comparison
 * and then end to end through the poll with a fake fetch.
 */
import { awaitDeploy, commitMatches } from '../../scripts/lib/await-deploy.mjs';

const FULL = '0986d15c4876b182669539d827465fb8ebeeec1b';
const OTHER = 'fbfc641e5b572abac8ecb12be3c9a635fda55d32';

describe('commitMatches', () => {
  it('matches an abbreviated expectation against the full SHA the host reports', () => {
    // The 11 Sep failure, exactly: demo passed eight characters, the host served forty.
    expect(commitMatches(FULL, FULL.slice(0, 8))).toBe(true);
  });

  it('matches full against full, which is what the web caller always did', () => {
    expect(commitMatches(FULL, FULL)).toBe(true);
  });

  it('matches in the other direction too, if a host ever abbreviates', () => {
    expect(commitMatches(FULL.slice(0, 12), FULL)).toBe(true);
  });

  it('is case-insensitive, because SHAs are hex and hex has no case', () => {
    expect(commitMatches(FULL.toUpperCase(), FULL.slice(0, 8))).toBe(true);
  });

  it('does not match a different commit — the anti-vacuous case', () => {
    expect(commitMatches(OTHER, FULL.slice(0, 8))).toBe(false);
    expect(commitMatches(OTHER, FULL)).toBe(false);
  });

  it('refuses an expectation shorter than seven characters rather than matching every deploy', () => {
    // An empty or truncated expectation would otherwise be a prefix of anything,
    // and the waiter would report the previous build as the promote landing.
    expect(commitMatches(FULL, '')).toBe(false);
    expect(commitMatches(FULL, FULL.slice(0, 6))).toBe(false);
    expect(commitMatches('', '')).toBe(false);
    expect(commitMatches(undefined, FULL)).toBe(false);
  });
});

describe('awaitDeploy', () => {
  const realFetch = global.fetch;
  let log: jest.SpyInstance;
  let err: jest.SpyInstance;

  beforeEach(() => {
    log = jest.spyOn(console, 'log').mockImplementation(() => {});
    err = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = realFetch;
    log.mockRestore();
    err.mockRestore();
  });

  function serving(commit: string) {
    global.fetch = jest.fn(async () => ({
      json: async () => ({ commit, branch: 'demo-live' }),
    })) as unknown as typeof fetch;
  }

  it('resolves true when the host serves the full SHA and the caller passed the short one', async () => {
    serving(FULL);
    await expect(
      awaitDeploy({
        hostname: 'https://example.test',
        expectCommit: FULL.slice(0, 8),
        label: 'demo',
        pollMs: 1,
        timeoutMs: 200,
      }),
    ).resolves.toBe(true);
  });

  it('resolves false when the host keeps serving the previous build', async () => {
    serving(OTHER);
    await expect(
      awaitDeploy({
        hostname: 'https://example.test',
        expectCommit: FULL,
        label: 'demo',
        pollMs: 1,
        timeoutMs: 30,
      }),
    ).resolves.toBe(false);
  });
});
