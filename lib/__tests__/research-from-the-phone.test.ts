/**
 * Research a car from the phone: the trigger, the job, the routes, the
 * background function.
 *
 * @jest-environment node
 *
 * The gap (20 Sep): `POST /api/v1/vehicles` seeded `research_status:
 * 'pending'` and nothing a phone could reach ever moved it — the trigger was
 * a web component on a cookie-authenticated action. The first car ever
 * saved from the phone sat at "No score yet" under a form promising "a few
 * seconds". `lib/research-job.ts` carries the shape; this pins it.
 *
 * The in-flight rule and `startResearch` are executed against a mocked
 * client. The routes and the background function are read as source, for
 * the reason `auth-posture.test.ts` sets out — and because the function is
 * bundled by esbuild on Netlify with no repo aliases, which is a property of
 * its text.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...path: string[]) => readFileSync(join(ROOT, ...path), 'utf8');
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/* The job's reads and writes, mocked at the seam. */
const seeded: { row: Record<string, unknown> | null } = { row: null };
const updates: Array<Record<string, unknown>> = [];
jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: seeded.row }) }),
      }),
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }),
}));

const triggered: string[] = [];
jest.mock('@/lib/vehicle-research', () => ({
  fetchNHTSARecalls: jest.fn(),
  prepareResearch: jest.fn(),
  researchVehicleDossier: jest.fn(),
  SWEEP_RESEARCH_TIMEOUT_MS: 60_000,
}));

import { IN_FLIGHT_MS, researchInFlight, startResearch } from '@/lib/research-job';

const NOW = new Date('2026-09-20T01:00:00Z');
const at = (msAgo: number) => new Date(NOW.getTime() - msAgo).toISOString();
/** Relative to the real clock — `startResearch` reads `new Date()` itself. */
const ago = (ms: number) => new Date(Date.now() - ms).toISOString();

beforeEach(() => {
  seeded.row = null;
  updates.length = 0;
  triggered.length = 0;
  delete process.env.URL;
  delete process.env.CRON_SECRET;
  process.env.NODE_ENV = 'test';
});

describe('the in-flight rule — a fact the row already carries', () => {
  it('a fresh row is not in flight: its marker is still the creation instant', () => {
    const created = at(30_000);
    expect(researchInFlight({ research_status: 'pending', last_research_date: created, created_at: created }, NOW)).toBe(false);
  });

  it('a marker moved off creation and younger than the window is a running job', () => {
    expect(
      researchInFlight({ research_status: 'pending', last_research_date: at(20_000), created_at: at(600_000) }, NOW)
    ).toBe(true);
  });

  it('a marker older than the window is a job that died — retriggering is allowed', () => {
    expect(
      researchInFlight({ research_status: 'pending', last_research_date: at(IN_FLIGHT_MS + 1_000), created_at: at(900_000) }, NOW)
    ).toBe(false);
  });

  it('only a pending row can be in flight', () => {
    for (const status of ['completed', 'failed', 'unsupported']) {
      expect(researchInFlight({ research_status: status, last_research_date: at(1_000), created_at: at(600_000) }, NOW)).toBe(false);
    }
    expect(researchInFlight(null, NOW)).toBe(false);
  });
});

describe('startResearch — idempotent, and it never spends on a dossier that exists', () => {
  it('reports completed and writes nothing', async () => {
    seeded.row = { research_status: 'completed', last_research_date: ago(1), created_at: ago(2) };
    expect(await startResearch('v1')).toBe('completed');
    expect(updates).toEqual([]);
  });

  it('reports a running job and writes nothing — the phone remounting does not pay twice', async () => {
    seeded.row = { research_status: 'pending', last_research_date: ago(10_000), created_at: ago(600_000) };
    expect(await startResearch('v1')).toBe('researching');
    expect(updates).toEqual([]);
  });

  it('starts a fresh car: the marker moves, then the job is handed off', async () => {
    const created = ago(5_000);
    seeded.row = { research_status: 'pending', last_research_date: created, created_at: created };
    expect(await startResearch('v1')).toBe('researching');
    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({ research_status: 'pending' });
    expect(typeof updates[0].last_research_date).toBe('string');
    expect(Date.parse(updates[0].last_research_date as string)).toBeGreaterThan(Date.parse(created));
  });

  it('a failed row starts again — that is the retry, and the sweep never offers a failed car', async () => {
    seeded.row = { research_status: 'failed', last_research_date: ago(100_000), created_at: ago(600_000) };
    expect(await startResearch('v1')).toBe('researching');
    expect(updates[0]).toMatchObject({ research_status: 'pending' });
  });

  it('a car never seeded is said so, not silently researched', async () => {
    seeded.row = null;
    expect(await startResearch('v1')).toBe('no-row');
    expect(updates).toEqual([]);
  });
});

describe('the phone-facing routes', () => {
  const trigger = code(read('app', 'api', 'v1', 'research', 'route.ts'));
  const health = code(read('app', 'api', 'v1', 'health', 'route.ts'));

  it('the trigger authorizes for a write on the car, then rate-limits the AI path, then starts', () => {
    const auth = trigger.indexOf("authorizeVehicleAccess(vehicleId, { intent: 'write' })");
    const limit = trigger.indexOf('checkRateLimit(`research:${vehicleId}`');
    const start = trigger.indexOf('startResearch(');
    expect(auth).toBeGreaterThan(-1);
    expect(limit).toBeGreaterThan(auth);
    expect(start).toBeGreaterThan(limit);
  });

  it('the trigger answers 202 for a running job and never touches the model', () => {
    expect(trigger).toMatch(/status:\s*state === 'researching' \? 202 : 200/);
    expect(trigger).not.toMatch(/generateContent|researchVehicleDossier/);
  });

  it('the score route is the web’s own action behind the same ownership check, refreshed only when asked', () => {
    expect(health).toMatch(/authorizeVehicleAccess\(vehicleId, \{ intent: 'write' \}\)/);
    expect(health).toMatch(/generateVehicleHealthSummary\(vehicleId as string, body\.refresh === true\)/);
    expect(health).toMatch(/status:\s*502/);
  });
});

describe('the internal routes — the background function’s only hands', () => {
  it.each(['claim', 'recalls', 'store', 'fail'])('%s checks the secret before anything else', (route) => {
    const source = code(read('app', 'api', 'internal', 'research', route, 'route.ts'));
    const post = source.slice(source.indexOf('export async function POST'));
    const secret = post.indexOf('requireInternalSecret(request)');
    const json = post.indexOf('request.json()');
    expect(secret).toBeGreaterThan(-1);
    expect(json).toBeGreaterThan(secret);
  });

  it('claim hands out the prompt only through prepareResearch — the gate and the ceiling', () => {
    const job = code(read('lib', 'research-job.ts'));
    const claim = job.slice(job.indexOf('export async function claimResearch'));
    expect(claim).toMatch(/prepareResearch\(loaded\.vehicle, loaded\.userId\)/);
    expect(claim.indexOf('prepareResearch(')).toBeLessThan(claim.indexOf('prompt: prepared.prompt'));
  });

  it('store answers 422 retry on a parse failure and records the spend per attempt', () => {
    const store = code(read('app', 'api', 'internal', 'research', 'store', 'route.ts'));
    expect(store).toMatch(/retry: true[\s\S]{0,80}status: 422/);
    expect(store).toMatch(/recordAiUsageInBackground\(\s*\{ purpose: 'vehicle_dossier'/);
    expect(store).toMatch(/fetchRecalls: false/);
  });

  it('fail is the one exit that names the state: the row goes to failed', () => {
    const fail = code(read('app', 'api', 'internal', 'research', 'fail', 'route.ts'));
    expect(fail).toMatch(/markResearchFailed\(vehicleId\)/);
  });
});

describe('the background function', () => {
  const source = read('netlify', 'functions', 'research-background.mts');
  const body = code(source);

  it('imports nothing — esbuild bundles it with no repo alias in sight', () => {
    expect(body).not.toMatch(/^\s*import\s/m);
    expect(body).not.toMatch(/require\(/);
  });

  it('asks NHTSA before the model, and posts claim, recalls, store and fail through the app', () => {
    const claim = body.indexOf("post('claim'");
    const recalls = body.indexOf("post('recalls'");
    const model = body.indexOf('await askModel(');
    const store = body.indexOf("post('store'");
    const fail = body.indexOf("post('fail'");
    expect([claim, recalls, model, store, fail].every((i) => i > -1)).toBe(true);
    expect(claim).toBeLessThan(recalls);
    expect(recalls).toBeLessThan(model);
    expect(model).toBeLessThan(store);
    expect(store).toBeLessThan(fail);
  });

  it('retries a parse failure and not silence — the in-process policy', () => {
    expect(body).toMatch(/const ATTEMPTS = 3/);
    expect(body).toMatch(/const MODEL_TIMEOUT_MS = 60_000/);
    expect(body).toMatch(/if \(store\.status !== 422 \|\| !body\.retry\) break/);
    expect(body).toMatch(/name === 'AbortError'\) break/);
  });

  it('answers 202 on every path and compares the secret in constant time', () => {
    expect(body).toMatch(/timingSafeMatch\(request\.headers\.get\('x-cron-secret'\), secret\)/);
    expect((body.match(/status: 202/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it('can still detect a function that forgot to fail the row, so this is not vacuous', () => {
    const forgetful = body.replace("post('fail'", "post('done'");
    expect(forgetful.indexOf("post('fail'")).toBe(-1);
    const aliased = `import { researchVehicleDossier } from '@/lib/vehicle-research';\n${body}`;
    expect(aliased).toMatch(/^\s*import\s/m);
  });
});

describe('the create route says where the research now starts', () => {
  it('no longer credits a web component with the phone’s research', () => {
    const create = read('app', 'api', 'v1', 'vehicles', 'route.ts');
    expect(create).toMatch(/\/api\/v1\/research/);
  });
});
