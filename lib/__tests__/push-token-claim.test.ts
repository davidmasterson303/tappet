/**
 * Audit 360, TL-8 (1 Oct) — the next account on a phone does not inherit the
 * last one's push row.
 *
 * @jest-environment node
 *
 * The route is executed over an in-memory `device_push_tokens` table that
 * applies `eq`/`neq` the way PostgREST does, so the assertion is on the rows
 * left behind, not on which methods were called.
 */
type Row = { user_id: string; device_id: string; expo_push_token: string; platform: string };
const table: Row[] = [];

function query(rows: Row[], op: 'delete' | 'select') {
  let filtered = rows;
  let returning = false;
  const chain: any = {
    // `.delete()…select('user_id')` answers with the rows it removed, as PostgREST does.
    select: () => {
      returning = true;
      return chain;
    },
    eq: (column: keyof Row, value: string) => {
      filtered = filtered.filter((r) => r[column] === value);
      return chain;
    },
    neq: (column: keyof Row, value: string) => {
      filtered = filtered.filter((r) => r[column] !== value);
      return chain;
    },
    then: (resolve: (v: unknown) => unknown) => {
      const removed = [...filtered];
      if (op === 'delete') {
        for (const row of filtered) table.splice(table.indexOf(row), 1);
      }
      return resolve({ data: returning ? removed.map((r) => ({ user_id: r.user_id })) : null, error: null });
    },
  };
  return chain;
}

jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: () => ({
    from: () => ({
      upsert: async (row: Row) => {
        const at = table.findIndex((r) => r.user_id === row.user_id && r.device_id === row.device_id);
        if (at === -1) table.push({ ...row });
        else table[at] = { ...row };
        return { error: null };
      },
      delete: () => query(table, 'delete'),
    }),
  }),
}));
jest.mock('@/lib/api-auth', () => ({ requireCaller: jest.fn() }));
jest.mock('@tappet/core/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  getClientIdentifier: jest.fn(() => 'id'),
  rateLimitResponse: jest.fn(),
}));

import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/push-token/route';
import { requireCaller } from '@/lib/api-auth';
import { logger } from '@tappet/core/logger';

const caller = requireCaller as jest.Mock;
const TOKEN = 'ExponentPushToken[abcdefghijklmnopqrstuv]';
const OTHER_TOKEN = 'ExponentPushToken[zzzzzzzzzzzzzzzzzzzzzz]';

function register(userId: string, deviceId: string, expoPushToken = TOKEN) {
  caller.mockResolvedValue({ ok: true, userId });
  return POST(
    new NextRequest('https://tappet.test/api/v1/push-token', {
      method: 'POST',
      body: JSON.stringify({ expoPushToken, deviceId, platform: 'ios' }),
      headers: { 'content-type': 'application/json' },
    })
  );
}

beforeEach(() => {
  table.splice(0, table.length);
});

describe('push-token registration — audit 360, TL-8', () => {
  it('claims the handset: the previous account’s row for this install is gone', async () => {
    expect((await register('user-a', 'install-1')).status).toBe(200);
    // A signed out without the DELETE reaching the server; B signs in on the phone.
    expect((await register('user-b', 'install-1')).status).toBe(200);

    expect(table.map((r) => r.user_id)).toEqual(['user-b']);
  });

  it('claims by token too — a reinstall with a new install id', async () => {
    await register('user-a', 'install-1');
    await register('user-b', 'install-2');

    expect(table.map((r) => r.user_id)).toEqual(['user-b']);
  });

  it('leaves another account’s different phone alone (anti-vacuous)', async () => {
    await register('user-a', 'install-1', OTHER_TOKEN);
    await register('user-b', 'install-2');

    expect(table.map((r) => r.user_id).sort()).toEqual(['user-a', 'user-b']);
  });

  it('keeps the caller’s own other devices', async () => {
    await register('user-b', 'install-9', OTHER_TOKEN);
    await register('user-b', 'install-2');

    expect(table).toHaveLength(2);
  });
});

/*
  Audit 360, SEC-11 (1 Oct). The claim removed another account's row without
  a word, so an account that learned a phone's token could silence its owner
  and nothing would say so. Every displaced row is now logged at warn, naming
  both accounts and the column that matched.
*/
describe('a claim is never silent — audit 360, SEC-11', () => {
  const warn = logger.warn as jest.Mock;
  beforeEach(() => warn.mockClear());

  it('names the displaced account, the claimant and the column', async () => {
    await register('user-a', 'install-1');
    await register('user-b', 'install-2');

    expect(warn).toHaveBeenCalledWith('PUSH_TOKEN:CLAIMED', expect.any(String), {
      userId: 'user-b',
      displacedUserId: 'user-a',
      matchedOn: 'expo_push_token',
    });
  });

  it('says nothing when nothing was displaced (anti-vacuous)', async () => {
    await register('user-a', 'install-1', OTHER_TOKEN);
    await register('user-b', 'install-2');
    await register('user-b', 'install-2');

    expect(warn).not.toHaveBeenCalledWith('PUSH_TOKEN:CLAIMED', expect.anything(), expect.anything());
  });
});
