/**
 * The crash log sink is attributable, and anonymous reports cost more.
 *
 * @jest-environment node
 *
 * Audit 360, SEC-7 (1 Oct). `/api/v1/client-errors` logged every report as
 * anonymous, 60/min per address, with 4 KB stacks and the message printed
 * raw — a newline in it started a line that could imitate any log key.
 */

jest.mock('@tappet/core/logger', () => ({ logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  getClientIdentifier: jest.fn((_r: unknown, tier?: string) => (tier ? `unverified:${tier}` : '203.0.113.7')),
  rateLimitResponse: jest.fn(() => new Response(null, { status: 429 })),
}));
jest.mock('@/lib/api-auth', () => ({ requireCaller: jest.fn() }));

import { NextRequest } from 'next/server';
import { logger } from '@tappet/core/logger';
import { checkRateLimit } from '@/lib/rate-limit';
import { requireCaller } from '@/lib/api-auth';
import { POST } from '@/app/api/v1/client-errors/route';

const post = (body: unknown) =>
  POST(new NextRequest('https://tappet.test/api/v1/client-errors', { method: 'POST', body: JSON.stringify(body) }));

const logged = () => (logger.error as jest.Mock).mock.calls.at(-1) as [string, Error, Record<string, unknown>];

beforeEach(() => jest.clearAllMocks());

describe('an anonymous report', () => {
  beforeEach(() => (requireCaller as jest.Mock).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) }));

  it('is labelled anonymous, spends the tighter bucket, and carries a 1 KB stack', async () => {
    const response = await post({ message: 'boom', stack: 's'.repeat(4_000), where: 'Garage' });
    expect(response.status).toBe(202);

    const [key, error, meta] = logged();
    expect(key).toBe('CLIENT_CRASH');
    expect(error.message).toBe('boom');
    expect(meta.reporter).toBe('anonymous');
    expect((meta.stack as string).length).toBe(1_000);
    expect(checkRateLimit).toHaveBeenCalledWith('client-errors:anonymous:unverified:upload', 'upload');
  });

  it('cannot start a forged line — control characters become spaces', async () => {
    await post({ message: 'x\n[ERROR:API:CONSULTANT] forged', where: 'a\r\nb', version: '1\t2' });
    const [, error, meta] = logged();
    expect(error.message).toBe('x [ERROR:API:CONSULTANT] forged');
    expect(meta.where).toBe('a b');
    expect(meta.version).toBe('1 2');
  });

  it('is refused when its own bucket is spent', async () => {
    (checkRateLimit as jest.Mock)
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false });
    const response = await post({ message: 'boom' });
    expect(response.status).toBe(429);
    expect(logger.error).not.toHaveBeenCalled();
  });
});

describe('a signed-in report', () => {
  it('names the account, keeps the 4 KB stack, and does not spend the anonymous bucket', async () => {
    (requireCaller as jest.Mock).mockResolvedValue({ ok: true, userId: 'user-1', client: {} });
    await post({ message: 'boom', stack: 's'.repeat(5_000) });

    const [, , meta] = logged();
    expect(meta.reporter).toBe('user-1');
    expect((meta.stack as string).length).toBe(4_000);
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
  });
});
