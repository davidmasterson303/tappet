/**
 * Audit 360, TL-6 (1 Oct) — a question sent again because the phone stopped
 * waiting is answered from the thread, not asked and stored a second time.
 *
 * TL-12 (1 Oct, round 2) — and the same *words* sent again as a new message
 * ("yes", then "yes") get a new answer. The first version replayed on text
 * alone; the "yes"/"yes" case below fails on that shape.
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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

import { POST } from '@/app/api/v1/consultant/route';
import { getConsultantSession, sendConsultantMessage } from '@/app/actions';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import {
  PHONE_GAVE_UP_MS,
  PHONE_WAIT_MS,
  REPLAY_WINDOW_MS,
  UNNAMED_RESEND_WINDOW_MS,
  parseClientTurnId,
  replayedAnswer,
} from '@/lib/consultant-replay';

const CAR = '7f4c2a10-1111-4222-8333-944455556666';
const send = sendConsultantMessage as jest.Mock;
const session = getConsultantSession as jest.Mock;
const authorize = authorizeVehicleAccess as jest.Mock;

const QUESTION = 'Is $1,400 fair for a timing belt?';
const ANSWER = 'About $900–$1,300 at an independent.';
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

/**
 * A thread whose last exchange is `question`, taken up `tookMs` before it was
 * answered, answered `answeredAgo` ms ago. `askedAt: null` is a turn stored
 * before the field existed.
 */
function thread({
  question = QUESTION,
  answer = ANSWER,
  tookMs = 70_000,
  answeredAgo = 5_000,
  askedAt,
  clientTurnId,
  documents,
}: {
  question?: string;
  answer?: string;
  tookMs?: number;
  answeredAgo?: number;
  askedAt?: string | null;
  clientTurnId?: string;
  documents?: unknown[];
} = {}) {
  const answeredAt = ago(answeredAgo);
  const taken = askedAt === null ? undefined : askedAt ?? ago(answeredAgo + tookMs);
  return [
    { role: 'user', content: 'Earlier question', timestamp: ago(3_600_000), askedAt: ago(3_601_000) },
    { role: 'assistant', content: 'Earlier answer', timestamp: ago(3_600_000) },
    {
      role: 'user',
      content: question,
      timestamp: answeredAt,
      ...(taken ? { askedAt: taken } : {}),
      ...(clientTurnId ? { clientTurnId } : {}),
      ...(documents ? { documents } : {}),
    },
    { role: 'assistant', content: answer, timestamp: answeredAt, wishlistActions: [{ a: 1 }] },
  ];
}

function post(body: unknown): NextRequest {
  return new NextRequest('https://tappet.test/api/v1/consultant', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function stored(history: unknown[]) {
  session.mockResolvedValue({ success: true, data: { vehicle_id: CAR, message_history: history } });
}

beforeEach(() => {
  jest.clearAllMocks();
  authorize.mockResolvedValue({ ok: true, isDemo: false, userId: 'u1' });
  send.mockResolvedValue({ success: true, response: 'A fresh answer', contextKinds: ['records'], wishlistActions: [] });
});

describe('a build-2 phone (no turn id) — audit 360, TL-6 / TL-12', () => {
  it('answers a resend from the thread when the stored answer outlasted the phone', async () => {
    stored(thread({ tookMs: 70_000 }));

    const response = await POST(post({ vehicleId: CAR, sessionId: 's1', message: `  ${QUESTION} ` }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ success: true, sessionId: 's1', response: ANSWER, wishlistActions: [{ a: 1 }] });
    // No second model call, so no second pair of turns.
    expect(send).not.toHaveBeenCalled();
  });

  it('answers "yes" then "yes" twice — the second is a new message, not a resend', async () => {
    // The advisor asked; the owner said yes; it answered in four seconds and the phone showed it.
    stored(
      thread({
        question: 'yes',
        answer: 'Added brake fluid to your Needs. Anything else bugging you with the car?',
        tookMs: 4_000,
        answeredAgo: 20_000,
      })
    );

    const response = await POST(post({ vehicleId: CAR, sessionId: 's1', message: 'yes' }));
    const body = await response.json();

    expect(body.response).toBe('A fresh answer');
    expect(body.response).not.toMatch(/Added brake fluid/);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ message: 'yes', clientTurnId: null }));
  });

  it('asks a different question of the model (anti-vacuous)', async () => {
    stored(thread({ tookMs: 70_000 }));

    const response = await POST(post({ vehicleId: CAR, sessionId: 's1', message: 'And the water pump?' }));

    expect((await response.json()).response).toBe('A fresh answer');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('asks again once the resend window has passed', async () => {
    stored(thread({ tookMs: 70_000, answeredAgo: UNNAMED_RESEND_WINDOW_MS + 1_000 }));

    await POST(post({ vehicleId: CAR, sessionId: 's1', message: QUESTION }));
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('never replays a turn stored before askedAt existed', async () => {
    stored(thread({ askedAt: null }));

    await POST(post({ vehicleId: CAR, sessionId: 's1', message: QUESTION }));
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('a build-3 phone (turn id)', () => {
  const ID = 'k3x9-2f8a1c0d';

  it('answers its own resend from the thread, even a fast answer lost to the network', async () => {
    stored(thread({ tookMs: 3_000, clientTurnId: ID }));

    const response = await POST(post({ vehicleId: CAR, sessionId: 's1', message: QUESTION, clientTurnId: ID }));

    expect((await response.json()).response).toBe(ANSWER);
    expect(send).not.toHaveBeenCalled();
  });

  it('asks afresh for the same words under a new id, even after a slow answer', async () => {
    stored(thread({ question: 'yes', tookMs: 70_000, clientTurnId: ID }));

    await POST(post({ vehicleId: CAR, sessionId: 's1', message: 'yes', clientTurnId: 'a-new-turn-0001' }));
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ clientTurnId: 'a-new-turn-0001' }));
  });

  it('drops an id that is not one the route will store', async () => {
    stored(thread({ question: 'hi', tookMs: 70_000 }));
    await POST(post({ vehicleId: CAR, sessionId: 's1', message: 'hi', clientTurnId: 'x'.repeat(200) }));
    // An oversized id is no id: read as a build-2 resend, and not stored.
    expect(send).not.toHaveBeenCalled();
    expect(parseClientTurnId('<script>')).toBeNull();
    expect(parseClientTurnId(42)).toBeNull();
    expect(parseClientTurnId(ID)).toBe(ID);
  });
});

describe('replayedAnswer', () => {
  const now = Date.now();

  it('needs the same attachments', () => {
    const docs = [{ file_url: 'placeholder://car/consultant/a.jpg' }];
    expect(replayedAnswer(thread({ documents: docs }), QUESTION, docs, null, now)).not.toBeNull();
    expect(replayedAnswer(thread({ documents: docs }), QUESTION, [], null, now)).toBeNull();
    expect(replayedAnswer(thread(), QUESTION, docs, null, now)).toBeNull();
  });

  it('only replays the thread’s last exchange', () => {
    const history = [...thread(), { role: 'user', content: 'x', timestamp: ago(500) }];
    expect(replayedAnswer(history, QUESTION, undefined, null, now)).toBeNull();
    expect(replayedAnswer([], QUESTION, undefined, null, now)).toBeNull();
  });

  it('draws the build-2 line at an answer the phone had given up on', () => {
    expect(replayedAnswer(thread({ tookMs: PHONE_GAVE_UP_MS }), QUESTION, undefined, null, now)).not.toBeNull();
    expect(replayedAnswer(thread({ tookMs: PHONE_GAVE_UP_MS - 1 }), QUESTION, undefined, null, now)).toBeNull();
  });

  it('a named turn is never replayed to an unnamed message, and the id window holds', () => {
    expect(replayedAnswer(thread({ clientTurnId: 'abcdefgh' }), QUESTION, undefined, null, now)).toBeNull();
    expect(
      replayedAnswer(thread({ clientTurnId: 'abcdefgh', answeredAgo: REPLAY_WINDOW_MS + 1_000 }), QUESTION, undefined, 'abcdefgh', now)
    ).toBeNull();
  });
});

/*
  The two halves the rule leans on that live elsewhere: the action stores
  `askedAt` and the turn id on the user turn, and the phone's wait is the one
  `PHONE_GAVE_UP_MS` sits under. Source pins, comments stripped, each with
  a case showing the reader can still miss.
*/
describe('the rule’s other ends', () => {
  const ROOT = join(__dirname, '..', '..');
  const code = (path: string) =>
    readFileSync(join(ROOT, path), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const userTurn = (src: string) => {
    const at = src.indexOf("role: 'user',\n        content: message,");
    return at < 0 ? '' : src.slice(at, src.indexOf('};', at));
  };

  it('the action stores when the question was taken up, and its turn id', () => {
    const turn = userTurn(code('app/actions.ts'));
    expect(turn.length).toBeGreaterThan(0);
    expect(turn).toMatch(/\baskedAt\b/);
    expect(turn).toMatch(/clientTurnId: params\.clientTurnId/);
    // Anti-vacuous: the reader misses on the shape TL-6 shipped.
    expect(userTurn("role: 'user',\n        content: message,\n        timestamp: x,\n};")).not.toMatch(/askedAt/);
  });

  it('the phone gives up after PHONE_WAIT_MS, and the build-2 line sits below it', () => {
    const phone = code('apps/mobile/src/api/consultant.ts');
    const wait = /timeoutMs:\s*([\d_]+)/.exec(phone.slice(phone.indexOf("apiRequest<")));
    expect(wait).not.toBeNull();
    expect(Number(wait![1].replace(/_/g, ''))).toBe(PHONE_WAIT_MS);
    expect(PHONE_GAVE_UP_MS).toBeLessThan(PHONE_WAIT_MS);
    expect(/timeoutMs:\s*([\d_]+)/.exec('no bound here')).toBeNull();
  });
});
