import { apiRequest } from '../client';
import { askAdvisor, newTurnId } from '../consultant';

/**
 * Audit 360, TL-12 (1 Oct) — the question's id reaches the route, which keys
 * a resend on it (`lib/consultant-replay.ts`), and is within the shape the
 * route will store (`parseClientTurnId`: `[A-Za-z0-9_-]{8,64}`).
 */

jest.mock('../client', () => {
  const actual = jest.requireActual('../client');
  return { ...actual, apiRequest: jest.fn() };
});
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ sessionId: 's1', response: 'Fine.', contextKinds: [] } as never);
});

const sent = () => (request.mock.calls[0][1] as { body: Record<string, unknown> }).body;

describe('askAdvisor — the turn id (TL-12)', () => {
  it('sends the id it is given', async () => {
    await askAdvisor({ vehicleId: 'v1', message: 'yes', sessionId: 's1', clientTurnId: 'abc12345-xyz' });
    expect(sent()).toEqual({ vehicleId: 'v1', message: 'yes', sessionId: 's1', clientTurnId: 'abc12345-xyz' });
  });

  it('sends no id field when it has none (anti-vacuous)', async () => {
    await askAdvisor({ vehicleId: 'v1', message: 'yes', sessionId: 's1' });
    expect(sent()).not.toHaveProperty('clientTurnId');
  });

  it('makes ids the route will keep, and different ones', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newTurnId()));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
  });
});
