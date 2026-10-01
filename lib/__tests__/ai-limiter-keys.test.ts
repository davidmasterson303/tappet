/**
 * A model call's limiter counts the caller, after the caller is known.
 *
 * @jest-environment node
 *
 * Audit 360 (1 Oct):
 *   - SEC-6 · `consultant:${vehicleId}` ran before authentication on both the
 *     route and the action, so ten unauthenticated POSTs a minute with anyone's
 *     vehicle id (every web URL carries one; the demo ids are public) made the
 *     owner's advisor answer 429.
 *   - SEC-2 · `health:${vehicleId}` meant an account with N cars had N × 10 a
 *     minute of health refreshes.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('@/lib/supabase', () => ({ getServiceRoleClient: jest.fn() }));

import { aiCallerKey } from '@/lib/rate-limit';

const ROOT = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

/** The body of one exported function, up to the next export. */
function fn(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', start + signature.length);
  return source.slice(start, next === -1 ? undefined : next);
}

describe('aiCallerKey', () => {
  it('a signed-in caller is counted as themselves, whichever car they ask about', () => {
    expect(aiCallerKey('consultant', { userId: 'u1', vehicleId: 'car-a' })).toBe('consultant:user:u1');
    expect(aiCallerKey('consultant', { userId: 'u1', vehicleId: 'car-b' })).toBe('consultant:user:u1');
  });

  it('a demo visitor is counted by address; only with neither does the vehicle key remain', () => {
    expect(aiCallerKey('consultant', { userId: null, visitor: '203.0.113.7', vehicleId: 'demo' })).toBe(
      'consultant:visitor:203.0.113.7'
    );
    expect(aiCallerKey('consultant', { userId: null, visitor: null, vehicleId: 'demo' })).toBe('consultant:demo');
  });
});

describe('every site limits after authorizing, on the caller', () => {
  const route = fn(read('app', 'api', 'v1', 'consultant', 'route.ts'), 'export async function POST');
  const actions = read('app', 'actions.ts');
  const consultant = fn(actions, 'export async function sendConsultantMessage');
  const health = fn(actions, 'export async function generateVehicleHealthSummary');

  it.each([
    ['the consultant route', route, "aiCallerKey('consultant'"],
    ['the consultant action', consultant, "aiCallerKey('consultant'"],
    ['the health action', health, "aiCallerKey('health'"],
  ])('%s', (_name, body, key) => {
    const authorized = body.indexOf('authorizeVehicleAccess(');
    const limited = body.indexOf(key);
    expect(authorized).toBeGreaterThan(-1);
    expect(limited).toBeGreaterThan(authorized);
    // The 'ai' bucket is never spent ahead of authorization.
    expect(body.slice(0, authorized)).not.toMatch(/checkRateLimit\([^)]*'ai'\)/);
    // In a call, not in prose: the comments here quote the old key on purpose.
    expect(body).not.toMatch(/checkRateLimit\(\s*`(consultant|health):\$\{(params\.)?vehicleId\}`/);
  });

  it('can still detect the shape that shipped, so this is not vacuous', () => {
    const shipped = "  const rateLimit = await checkRateLimit(`consultant:${vehicleId}`, 'ai');";
    expect(shipped).toMatch(/checkRateLimit\(\s*`(consultant|health):\$\{(params\.)?vehicleId\}`/);
    expect(shipped).toMatch(/checkRateLimit\([^)]*'ai'\)/);
  });
});
