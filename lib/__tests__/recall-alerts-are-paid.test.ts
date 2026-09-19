/**
 * Recall alerts are paid, and the nightly sweep is where that is enforced.
 *
 * @jest-environment node
 *
 * ── The decision, and the piece of it that was still a list entry ───────────
 *
 * `recalls` moved to `PAID_FEATURES` on 30 Aug (David's call, the argument
 * against kept in `paid-features.ts`) and was confirmed on 17 Sep when the
 * free tier was kept. Until 19 Sep nothing enforced it: `paid-features.test.ts`
 * carried it as an `UNGATED` allowlist entry reading "gate belongs in the
 * sweep's refresh and notify, not the read path — E8". This is that gate.
 *
 * The shape: the sweep reads one page of vehicles, asks `usersEntitledTo` once
 * for the page's owners, and skips the recall half — `collectRecalls`, which
 * is both the NHTSA refresh and the notification — for owners the gate
 * refuses. The service half runs for everyone, because what is due by mileage
 * is a free feature. Every recall already stored stays readable on the car;
 * that is `read-own-records`, never withdrawn.
 *
 * Off until `PAID_FEATURES_ENFORCED`: not enforced, the batch check returns
 * every owner and tonight's sweep is last night's.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), 'utf8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/*
  The gate's own reads, mocked at the seam. `getServiceRoleClient` hands back
  whatever the case seeded, so the batch check is exercised end to end — the
  query it builds, the rows it reads, the verdict per account — without a
  database.
*/
const seeded: { data: unknown; error: { message: string } | null } = { data: [], error: null };
const inCalls: unknown[][] = [];
jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        in: (...args: unknown[]) => {
          inCalls.push(args);
          return Promise.resolve(seeded);
        },
      }),
    }),
  }),
}));

import { usersEntitledTo } from '@/lib/feature-gate';
import { PAID_FEATURES } from '@tappet/core/paid-features';

const LIVE = { user_id: 'paid-1', tier: 'paid', expires_at: '2099-01-01T00:00:00Z' };
const LAPSED = { user_id: 'lapsed-1', tier: 'paid', expires_at: '2020-01-01T00:00:00Z' };

beforeEach(() => {
  seeded.data = [];
  seeded.error = null;
  inCalls.length = 0;
  delete process.env.PAID_FEATURES_ENFORCED;
});

describe('usersEntitledTo — the batch form of the gate', () => {
  it('is a paid feature, so the gate has something to enforce', () => {
    expect(PAID_FEATURES).toContain('recalls');
  });

  it('not enforced: every owner, and no query — tonight is last night', async () => {
    const owners = await usersEntitledTo(['a', 'b', 'a', ''], 'recalls');
    expect(Array.from(owners).sort()).toEqual(['a', 'b']);
    expect(inCalls).toEqual([]);
  });

  it('enforced: one query for the page, a live subscriber in, a lapsed one and a stranger out', async () => {
    process.env.PAID_FEATURES_ENFORCED = 'true';
    seeded.data = [LIVE, LAPSED];

    const owners = await usersEntitledTo(['paid-1', 'lapsed-1', 'never-1'], 'recalls');

    expect(Array.from(owners)).toEqual(['paid-1']);
    expect(inCalls).toHaveLength(1);
    expect(inCalls[0]).toEqual(['user_id', ['paid-1', 'lapsed-1', 'never-1']]);
  });

  it('enforced and unreadable: nobody, and it says so', async () => {
    /*
      The single check's direction, for the single check's reason: a broken
      row read as paid gives the product away to the case somebody would
      manufacture. What that withholds for a night is a notice, and the next
      sweep tries again; the docblock names the trade rather than hiding it.
    */
    process.env.PAID_FEATURES_ENFORCED = 'true';
    seeded.error = { message: 'connection refused' };

    const owners = await usersEntitledTo(['paid-1'], 'recalls');
    expect(owners.size).toBe(0);
  });

  it('enforced with no owners on the page asks nothing', async () => {
    process.env.PAID_FEATURES_ENFORCED = 'true';
    expect((await usersEntitledTo([], 'recalls')).size).toBe(0);
    expect(inCalls).toEqual([]);
  });
});

describe('the sweep skips the recall half for a refused owner, never the service half', () => {
  const route = code(read('app', 'api', 'internal', 'notify-sweep', 'route.ts'));
  const loop = route.slice(route.indexOf('for (let page'), route.indexOf('const refreshPlan'));

  it('asks once per page, for recalls, before walking the cars', () => {
    const ask = loop.indexOf("usersEntitledTo(owners, 'recalls')");
    const walk = loop.indexOf('for (const vehicle of vehicles)');
    expect(ask).toBeGreaterThan(-1);
    expect(walk).toBeGreaterThan(ask);
  });

  it('gates collectRecalls on the owner and leaves collectService unconditional', () => {
    expect(loop).toMatch(/if \(recallsAllowed\.has\(vehicle\.user_id\)\) \{\s*await collectRecalls\(/);
    // The service call is not inside that branch: it follows the closing brace.
    const gated = loop.indexOf('if (recallsAllowed.has(vehicle.user_id))');
    const service = loop.indexOf('await collectService(', gated);
    const elseBranch = loop.indexOf('recallsGated += 1', gated);
    expect(service).toBeGreaterThan(elseBranch);
    expect(loop.slice(gated, service)).toMatch(/\}\s*else \{[\s\S]*?\}\s*$/);
  });

  it('reports the gated count in the run log rather than storing it', () => {
    // `sweep_runs` has no column for it (42703 is the cheapest schema check
    // there is), so it rides the completion log with the summary.
    expect(route).toMatch(/'Sweep complete', \{ \.\.\.summary, recallsGated \}/);
    expect(route).not.toMatch(/recalls_gated/);
  });

  it('can still detect the loop that gated nothing, so this is not vacuous', () => {
    const before = `
    for (let page = 0; ; page += 1) {
      for (const vehicle of vehicles) {
        if (vehicle.is_demo || !vehicle.user_id) continue;
        await collectRecalls(client, vehicle, name, recallCandidates, refreshCandidates);
        await collectService(client, vehicle, name, today, serviceCandidates, generationCandidates);
      }
    }
    const refreshPlan = recallsToRefresh(refreshCandidates);`;
    const old = before.slice(before.indexOf('for (let page'), before.indexOf('const refreshPlan'));
    expect(old).not.toMatch(/usersEntitledTo/);
    expect(old).toMatch(/await collectRecalls\(/);
    expect(loop.length).toBeGreaterThan(100);
  });
});
