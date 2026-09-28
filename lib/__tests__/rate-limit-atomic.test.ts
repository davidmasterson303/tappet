/**
 * The limiter has one path, and it is the atomic one.
 *
 * @jest-environment node
 *
 * SEC-05: read-then-insert let two concurrent requests create two rows for one
 * window, after which the limiter failed open for the rest of it.
 * `consume_rate_limit` (migration `20260824110000`) closed that, but for a
 * month the code kept the racy path as a fallback because the migration had
 * never been applied — and could not be, since it died on `min(uuid)`. Applied
 * and verified 24 Sep; the fallback went with it.
 *
 * This suite pins that there is no way back to it. The client mock records
 * every table call, so a reintroduced `.select`/`.insert`/`.update` on
 * `api_rate_limits` fails here — and the anti-vacuous case proves the recorder
 * can see one (CLAUDE.md §5).
 */

const rpc = jest.fn();
const tableCalls: string[] = [];

function recordingTable(name: string) {
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'insert', 'update', 'delete', 'eq', 'lt', 'order']) {
    chain[op] = (..._args: unknown[]) => {
      tableCalls.push(`${name}.${op}`);
      return chain;
    };
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: null, error: null });
  return chain;
}

const client = {
  rpc: (...args: unknown[]) => rpc(...args),
  from: (name: string) => recordingTable(name),
};

jest.mock('@/lib/supabase', () => ({ getServiceRoleClient: () => client }));

const logged: string[] = [];
jest.mock('@tappet/core/logger', () => ({
  logger: {
    error: (code: string) => logged.push(code),
    warn: (code: string) => logged.push(code),
    info: () => {},
  },
}));

import { checkRateLimit } from '../rate-limit';

/** Any read or write other than the expired-window cleanup is the racy path. */
const racyCalls = () =>
  tableCalls.filter(
    (c) => c.startsWith('api_rate_limits.') && !/\.(delete|eq|lt)$/.test(c)
  );

beforeEach(() => {
  rpc.mockReset();
  tableCalls.length = 0;
  logged.length = 0;
});

describe('checkRateLimit', () => {
  it('counts through consume_rate_limit and allows under the ceiling', async () => {
    rpc.mockResolvedValue({ data: 3, error: null });

    const result = await checkRateLimit('1.2.3.4', 'ai');

    expect(rpc).toHaveBeenCalledWith('consume_rate_limit', expect.objectContaining({
      p_identifier: '1.2.3.4',
      p_endpoint: 'ai',
    }));
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(7);
    expect(racyCalls()).toEqual([]);
  });

  it('refuses over the ceiling with a retry-after', async () => {
    rpc.mockResolvedValue({ data: 11, error: null });

    const result = await checkRateLimit('1.2.3.4', 'ai');

    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('fails open on an RPC error, loudly, without reaching for the table', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });

    const result = await checkRateLimit('1.2.3.4', 'upload');

    expect(result.allowed).toBe(true);
    expect(logged).toContain('RATE_LIMIT:RPC_FAILED');
    expect(racyCalls()).toEqual([]);
  });

  it('only touches the table to clear expired windows, on a fresh window', async () => {
    rpc.mockResolvedValue({ data: 1, error: null });

    await checkRateLimit('1.2.3.4', 'default');

    expect(tableCalls).toContain('api_rate_limits.delete');
    expect(racyCalls()).toEqual([]);
  });

  it('the recorder can still see a racy read (anti-vacuous)', () => {
    (client.from('api_rate_limits') as { select: () => unknown }).select();
    expect(racyCalls()).toEqual(['api_rate_limits.select']);
  });
});
