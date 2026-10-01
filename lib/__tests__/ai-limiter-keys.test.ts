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
 *   - SEC-15 (round 3) · `dossier:`, `moddetails:` and `invoice:` were still
 *     keyed on the vehicle id ahead of the gate.
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

/** A spending bucket keyed on the vehicle id, in a call (not in prose). */
const VEHICLE_KEYED = /checkRateLimit\(\s*`(consultant|health|dossier|moddetails|invoice):\$\{(params\.)?vehicleId\}`/;

describe('every site limits after authorizing, on the caller', () => {
  const route = fn(read('app', 'api', 'v1', 'consultant', 'route.ts'), 'export async function POST');
  const actions = read('app', 'actions.ts');
  const consultant = fn(actions, 'export async function sendConsultantMessage');
  const health = fn(actions, 'export async function generateVehicleHealthSummary');
  const dossier = fn(actions, 'export async function generateVehicleDossier');
  const modDetails = fn(actions, 'export async function generateModificationDetails');
  const invoice = fn(actions, 'export async function parseInvoiceLineItems');

  it.each([
    ['the consultant route', route, "aiCallerKey('consultant-route'"],
    ['the consultant action', consultant, "aiCallerKey('consultant'"],
    ['the health action', health, "aiCallerKey('health'"],
    ['the dossier action', dossier, "aiCallerKey('dossier'"],
    ['the mod-details action', modDetails, "aiCallerKey('moddetails'"],
    ['the invoice parser', invoice, "aiCallerKey('invoice'"],
  ])('%s', (_name, body, key) => {
    const authorized = body.indexOf('authorizeVehicleAccess(');
    const limited = body.indexOf(key);
    expect(authorized).toBeGreaterThan(-1);
    expect(limited).toBeGreaterThan(authorized);
    // The 'ai' bucket is never spent ahead of authorization.
    expect(body.slice(0, authorized)).not.toMatch(/checkRateLimit\([^)]*'ai'\)/);
    // In a call, not in prose: the comments here quote the old key on purpose.
    expect(body).not.toMatch(VEHICLE_KEYED);
  });

  it('every action in the file that spends the ai tier keys it with aiCallerKey (SEC-15)', () => {
    const calls = actions.match(/checkRateLimit\([^;]*?'ai'\s*\)/g) ?? [];
    // Found sources: the five action sites above, the demo quote's address
    // key, and the post-upload stats refresh keyed on the authorized user.
    expect(calls.length).toBeGreaterThanOrEqual(7);
    for (const call of calls) {
      expect(call).toMatch(/aiCallerKey\(|^checkRateLimit\(access\.userId \?\?|`demoquote:\$\{ip\}`/);
    }
  });

  it('can still detect the shape that shipped, so this is not vacuous', () => {
    const shipped = "  const rateLimit = await checkRateLimit(`consultant:${vehicleId}`, 'ai');";
    expect(shipped).toMatch(VEHICLE_KEYED);
    expect(shipped).toMatch(/checkRateLimit\([^)]*'ai'\)/);
    for (const feature of ['dossier', 'moddetails', 'invoice']) {
      expect(`    const rl = await checkRateLimit(\`${feature}:\${vehicleId}\`, 'ai');`).toMatch(VEHICLE_KEYED);
    }
  });
});

/*
  TL-19 (round 3) · the route and the action spent one bucket, so a message
  cost two of the ten. Each now has its own key; the simulation below runs
  the real `aiCallerKey` against a per-identifier counter shaped like
  `consume_rate_limit` (one row per identifier and tier).
*/
describe('one advisor message costs one of the ten (TL-19)', () => {
  const featureOf = (body: string) => /aiCallerKey\('([\w-]+)'/.exec(body)?.[1] ?? null;
  const route = fn(read('app', 'api', 'v1', 'consultant', 'route.ts'), 'export async function POST');
  const action = fn(read('app', 'actions.ts'), 'export async function sendConsultantMessage');

  function allowedMessages(routeFeature: string, actionFeature: string): number {
    const counts = new Map<string, number>();
    const consume = (key: string) => {
      const n = (counts.get(`${key}|ai`) ?? 0) + 1;
      counts.set(`${key}|ai`, n);
      return n <= 10;
    };
    const caller = { userId: 'u1', vehicleId: 'car-a' };
    let answered = 0;
    for (let i = 0; i < 20; i++) {
      if (!consume(aiCallerKey(routeFeature, caller))) continue;
      if (!consume(aiCallerKey(actionFeature, caller))) continue;
      answered++;
    }
    return answered;
  }

  it('the route and the action count in different buckets, so ten messages a minute are answered', () => {
    const routeFeature = featureOf(route);
    const actionFeature = featureOf(action);
    expect(routeFeature).not.toBeNull();
    expect(actionFeature).toBe('consultant');
    expect(routeFeature).not.toBe(actionFeature);
    expect(allowedMessages(routeFeature!, actionFeature!)).toBe(10);
  });

  it('can still detect the shared bucket that shipped (five a minute)', () => {
    expect(allowedMessages('consultant', 'consultant')).toBe(5);
  });
});
