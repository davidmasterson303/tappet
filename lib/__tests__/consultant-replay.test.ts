/**
 * Audit 360, TL-6 (1 Oct) — a question sent again because the phone stopped
 * waiting is answered from the thread, not asked and stored a second time.
 *
 * @jest-environment node
 *
 * The route is executed with the action, auth and rate limit mocked — the
 * shape `advisor-failure-states.test.ts` uses.
 */
jest.mock('@/app/actions', () => ({
  sendConsultantMessage: jest.fn(),
  createConsultantSession: jest.fn(),
  getConsultantSession: jest.fn(),
  generateSessionTitle: jest.fn(),
}));
jest.mock('@/lib/api-auth', () => ({ authorizeVehicleAccess: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: jest.fn(),
  getClientIdentifier: jest.fn(() => '203.0.113.7'),
  aiCallerKey: jest.fn(() => 'consultant:caller'),
}));

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/v1/consultant/route';
import { getConsultantSession, sendConsultantMessage } from '@/app/actions';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { REPLAY_WINDOW_MS, replayedAnswer } from '@/lib/consultant-replay';

const CAR = '7f4c2a10-1111-4222-8333-944455556666';
const send = sendConsultantMessage as jest.Mock;
const session = getConsultantSession as jest.Mock;
const authorize = authorizeVehicleAccess as jest.Mock;

const QUESTION = 'Is $1,400 fair for a timing belt?';
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

function thread(askedAt: string, question = QUESTION, documents?: unknown[]) {
  return [
    { role: 'user', content: 'Earlier question', timestamp: ago(3_600_000) },
    { role: 'assistant', content: 'Earlier answer', timestamp: ago(3_600_000) },
    { role: 'user', content: question, timestamp: askedAt, ...(documents ? { documents } : {}) },
    { role: 'assistant', content: 'About $900–$1,300 at an independent.', timestamp: askedAt, wishlistActions: [{ a: 1 }] },
  ];
}

function post(body: unknown): NextRequest {
  return new NextRequest('https://tappet.test/api/v1/consultant', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  authorize.mockResolvedValue({ ok: true, isDemo: false, userId: 'u1' });
  send.mockResolvedValue({ success: true, response: 'A fresh answer', contextKinds: ['records'], wishlistActions: [] });
});

describe('the consultant route — audit 360, TL-6', () => {
  it('answers the same question, asked again after its answer was stored, from the thread', async () => {
    session.mockResolvedValue({ success: true, data: { vehicle_id: CAR, message_history: thread(ago(70_000)) } });

    const response = await POST(post({ vehicleId: CAR, sessionId: 's1', message: `  ${QUESTION} ` }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      sessionId: 's1',
      response: 'About $900–$1,300 at an independent.',
      wishlistActions: [{ a: 1 }],
    });
    // No second model call, so no second pair of turns.
    expect(send).not.toHaveBeenCalled();
  });

  it('asks the model for a different question (anti-vacuous)', async () => {
    session.mockResolvedValue({ success: true, data: { vehicle_id: CAR, message_history: thread(ago(70_000)) } });

    const response = await POST(post({ vehicleId: CAR, sessionId: 's1', message: 'And the water pump?' }));

    expect((await response.json()).response).toBe('A fresh answer');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('asks again once the window has passed', async () => {
    session.mockResolvedValue({
      success: true,
      data: { vehicle_id: CAR, message_history: thread(ago(REPLAY_WINDOW_MS + 1_000)) },
    });

    await POST(post({ vehicleId: CAR, sessionId: 's1', message: QUESTION }));
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('replayedAnswer', () => {
  const now = Date.now();

  it('needs the same attachments', () => {
    const docs = [{ file_url: 'placeholder://car/consultant/a.jpg' }];
    expect(replayedAnswer(thread(ago(1_000), QUESTION, docs), QUESTION, docs, now)).not.toBeNull();
    expect(replayedAnswer(thread(ago(1_000), QUESTION, docs), QUESTION, [], now)).toBeNull();
    expect(replayedAnswer(thread(ago(1_000)), QUESTION, docs, now)).toBeNull();
  });

  it('only replays the thread’s last exchange', () => {
    const history = [...thread(ago(1_000)), { role: 'user', content: 'x', timestamp: ago(500) }];
    expect(replayedAnswer(history, QUESTION, undefined, now)).toBeNull();
    expect(replayedAnswer([], QUESTION, undefined, now)).toBeNull();
  });
});
