/**
 * The orphan record's two reads (audit 360, TL-29).
 *
 * @jest-environment node
 *
 * Executed against a stub that records the filters the code chose: an
 * unclaimed row only, and a failure that never throws into the route.
 */

jest.mock('@/lib/supabase', () => ({ getServiceRoleClient: jest.fn() }));

import { getServiceRoleClient } from '@/lib/supabase';
import { isOrphanedSubscription, markSubscriptionReclaimed } from '@/lib/orphaned-subscriptions';

type Row = { original_transaction_id: string; reclaimed_at: string | null };

function client(rows: Row[], fail = false) {
  const calls: Array<{ table: string; filters: Array<[string, unknown]>; update?: Record<string, unknown> }> = [];
  return {
    calls,
    from: (table: string) => {
      const call: (typeof calls)[number] = { table, filters: [] };
      calls.push(call);
      const matches = () =>
        rows.filter((r) => call.filters.every(([c, v]) => (r as Record<string, unknown>)[c] === v));
      const chain: Record<string, unknown> = {
        select: () => chain,
        eq: (c: string, v: unknown) => (call.filters.push([c, v]), chain),
        is: (c: string, v: unknown) => {
          call.filters.push([c, v]);
          if (call.update) {
            if (fail) return Promise.resolve({ error: { message: 'down' } });
            for (const r of matches()) Object.assign(r, call.update);
            return Promise.resolve({ error: null });
          }
          return chain;
        },
        update: (values: Record<string, unknown>) => ((call.update = values), chain),
        maybeSingle: async () =>
          fail ? { data: null, error: { message: 'down' } } : { data: matches()[0] ?? null, error: null },
      };
      return chain;
    },
  };
}

describe('isOrphanedSubscription', () => {
  it('is true for an unclaimed orphan and false for a reclaimed one or a stranger', async () => {
    const rows: Row[] = [
      { original_transaction_id: 'A', reclaimed_at: null },
      { original_transaction_id: 'B', reclaimed_at: '2026-09-30T00:00:00Z' },
    ];
    const stub = client(rows);
    (getServiceRoleClient as jest.Mock).mockReturnValue(stub);
    expect(await isOrphanedSubscription('A')).toBe(true);
    expect(await isOrphanedSubscription('B')).toBe(false);
    expect(await isOrphanedSubscription('C')).toBe(false);
    expect(stub.calls.every((c) => c.table === 'orphaned_apple_subscriptions')).toBe(true);
  });

  it('a failed read is false, never a throw', async () => {
    (getServiceRoleClient as jest.Mock).mockReturnValue(client([], true));
    await expect(isOrphanedSubscription('A')).resolves.toBe(false);
  });
});

describe('markSubscriptionReclaimed', () => {
  it('stamps an unclaimed row and leaves an earlier reclaim standing', async () => {
    const rows: Row[] = [
      { original_transaction_id: 'A', reclaimed_at: null },
      { original_transaction_id: 'B', reclaimed_at: '2026-09-30T00:00:00Z' },
    ];
    (getServiceRoleClient as jest.Mock).mockReturnValue(client(rows));
    await markSubscriptionReclaimed('A');
    await markSubscriptionReclaimed('B');
    expect(rows[0].reclaimed_at).toEqual(expect.any(String));
    expect(rows[1].reclaimed_at).toBe('2026-09-30T00:00:00Z');
  });

  it('a failed write resolves, never a throw', async () => {
    (getServiceRoleClient as jest.Mock).mockReturnValue(client([], true));
    await expect(markSubscriptionReclaimed('A')).resolves.toBeUndefined();
  });
});
