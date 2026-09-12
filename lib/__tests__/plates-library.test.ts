/**
 * The generation-plate library — the I/O half, against an in-memory store.
 *
 * ── ⚠ Why this exists ───────────────────────────────────────────────────────
 *
 * `lib/plates.ts` is where the money is spent and where onboarding could be
 * slowed, so its rules are pinned without a database or a model in the loop:
 *
 * - the library is consulted before the classifier — a second car of a known
 *   generation makes no model call and inserts nothing;
 * - a classifier that fails or answers badly falls back to the single year
 *   the decode already knows (§10), never to a guess;
 * - the cap is enforced at the claim, and a capped row stays `pending`;
 * - `ensurePlate` never throws at a caller — the VIN step must not care;
 * - the trigger sends the shared secret in the header the sweep uses.
 *
 * The fake client below implements exactly the chains the module uses. It
 * is deliberately small; a chain it does not know throws, so a new query in
 * the module shows up here as a failure rather than as a silent pass.
 */
import {
  attachPlateToVehicle,
  claimPlate,
  ensurePlate,
  storePlate,
  triggerPlateJob,
} from '@/lib/plates';
import { PLATE_DAILY_CAP } from '@tappet/core/plates';

// `lib/plate-image.ts` imports `jimp`, an ESM-only package the runner cannot
// parse — the same wall `recall-row-does-not-contradict-itself.test.tsx`
// records for `@google/genai`. Nothing here exercises the image half, so it
// is mocked at its boundary; `plate-image.test.ts` covers it on its own.
jest.mock('@/lib/plate-image', () => ({
  generatePlateFrame: jest.fn(),
  derivePlateJpegs: jest.fn(),
}));

type Row = Record<string, unknown>;
type Filter = { op: 'eq' | 'lte' | 'gte' | 'is'; col: string; val: unknown };

class FakeDb {
  tables: Record<string, Row[]> = { vehicle_plates: [], vehicles: [] };
  uploads: Array<{ bucket: string; path: string; bytes: number; opts: Row }> = [];

  from(table: string) {
    const db = this;
    const state = {
      op: 'select' as 'select' | 'update' | 'upsert',
      filters: [] as Filter[],
      patch: null as Row | null,
      upsertRow: null as Row | null,
      upsertOpts: null as Row | null,
      single: false,
      count: false,
      limit: 0,
    };
    const rows = () => db.tables[table] ?? [];
    const matches = (row: Row) =>
      state.filters.every((f) => {
        const v = row[f.col];
        if (f.op === 'eq') return v === f.val;
        if (f.op === 'is') return v === f.val;
        if (f.op === 'lte') return (v as number) <= (f.val as number);
        if (f.op === 'gte') return String(v ?? '') >= String(f.val);
        return false;
      });
    const run = () => {
      if (state.op === 'upsert') {
        const key = state.upsertRow!.key as string;
        if (!rows().some((r) => r.key === key)) {
          rows().push({ attempts: 0, error: null, claimed_at: null, generated_at: null, hero_path: null, card_path: null, ...state.upsertRow! });
        }
        return { data: null, error: null };
      }
      const hit = rows().filter(matches);
      if (state.op === 'update') {
        hit.forEach((r) => Object.assign(r, state.patch));
        if (state.single) return { data: hit[0] ?? null, error: null };
        return { data: hit, error: null };
      }
      if (state.count) return { data: null, count: hit.length, error: null };
      const limited = state.limit ? hit.slice(0, state.limit) : hit;
      if (state.single) return { data: limited[0] ?? null, error: null };
      return { data: limited, error: null };
    };
    const builder: Record<string, unknown> = {
      select(_cols: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count) state.count = true;
        return builder;
      },
      eq(col: string, val: unknown) { state.filters.push({ op: 'eq', col, val }); return builder; },
      lte(col: string, val: unknown) { state.filters.push({ op: 'lte', col, val }); return builder; },
      gte(col: string, val: unknown) { state.filters.push({ op: 'gte', col, val }); return builder; },
      is(col: string, val: unknown) { state.filters.push({ op: 'is', col, val }); return builder; },
      limit(n: number) { state.limit = n; return builder; },
      maybeSingle() { state.single = true; return builder; },
      update(patch: Row) { state.op = 'update'; state.patch = patch; return builder; },
      upsert(row: Row, opts: Row) { state.op = 'upsert'; state.upsertRow = row; state.upsertOpts = opts; return builder; },
      then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
        return Promise.resolve().then(run).then(resolve, reject);
      },
    };
    return builder;
  }

  storage = {
    from: (bucket: string) => ({
      upload: async (path: string, body: Buffer, opts: Row) => {
        this.uploads.push({ bucket, path, bytes: body.length, opts });
        return { error: null };
      },
    }),
  };
}

const flashAnswer = (answer: unknown) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }),
  }) as unknown as Response;

const F22 = { family: '2 Series', generation: 'F22', label: 'F22 (2014–2021)', year_from: 2014, year_to: 2021, body: 'coupe' };

let db: FakeDb;
let fetchMock: jest.Mock;
const env = { ...process.env };

beforeEach(() => {
  db = new FakeDb();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  process.env.GEMINI_API_KEY = 'test-key';
  delete process.env.URL;
  delete process.env.CRON_SECRET;
  // No local in-process job during these tests: the trigger only runs one
  // outside production, and the type is read-only, hence the cast.
  (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
});

afterEach(() => {
  process.env = { ...env };
});

const client = () => db as unknown as import('@supabase/supabase-js').SupabaseClient;

describe('ensurePlate', () => {
  it('names the generation, keys the row from it, and stores the house prompt', async () => {
    fetchMock.mockResolvedValueOnce(flashAnswer(F22));
    const result = await ensurePlate({ year: 2015, make: 'BMW', model: 'M235i', trim: 'xDrive' }, { client: client() });
    expect(result).toEqual({ key: 'bmw/2-series/f22', status: 'pending' });
    const row = db.tables.vehicle_plates[0];
    expect(row).toMatchObject({ key: 'bmw/2-series/f22', make: 'bmw', family: '2-series', generation: 'f22', year_from: 2014, year_to: 2021, status: 'pending' });
    expect(row.prompt).toContain('2015 BMW 2 Series coupe');
    expect(row.prompt).toContain('dark graphite metallic');
    // The classifier was asked exactly once, with the car.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][1].body)).toContain('2015 BMW M235i xDrive');
  });

  it('finds the library row first and makes no model call — the second car of a generation', async () => {
    db.tables.vehicle_plates.push({ key: 'honda/accord/10th', make: 'honda', family: 'accord', generation: '10th', year_from: 2018, year_to: 2022, status: 'ready', hero_path: 'plates/honda/accord/10th/hero-3x2.jpg', claimed_at: null, attempts: 1 });
    const result = await ensurePlate({ year: 2020, make: 'Honda', model: 'Accord' }, { client: client() });
    expect(result).toEqual({ key: 'honda/accord/10th', status: 'ready' });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(db.tables.vehicle_plates).toHaveLength(1);
  });

  it('does not find a row whose years do not cover the car', async () => {
    db.tables.vehicle_plates.push({ key: 'honda/accord/9th', make: 'honda', family: 'accord', generation: '9th', year_from: 2013, year_to: 2017, status: 'ready', hero_path: 'x', claimed_at: null, attempts: 1 });
    fetchMock.mockResolvedValueOnce(flashAnswer({ ...F22, family: 'Accord', generation: '10th generation', year_from: 2018, year_to: 2022, body: 'sedan' }));
    const result = await ensurePlate({ year: 2020, make: 'Honda', model: 'Accord' }, { client: client() });
    expect(result.key).toBe('honda/accord/10th-generation');
    expect(db.tables.vehicle_plates).toHaveLength(2);
  });

  it('falls back to the single year when the classifier fails or answers badly', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network'));
    const failed = await ensurePlate({ year: 2015, make: 'BMW', model: 'M235i' }, { client: client() });
    expect(failed.key).toBe('bmw/m235i/2015');

    db = new FakeDb();
    fetchMock.mockResolvedValueOnce(flashAnswer({ ...F22, year_from: 2022, year_to: 2025 })); // misses the car
    const refused = await ensurePlate({ year: 2015, make: 'BMW', model: 'M235i' }, { client: client() });
    expect(refused.key).toBe('bmw/m235i/2015');
    expect(db.tables.vehicle_plates[0]).toMatchObject({ year_from: 2015, year_to: 2015 });
  });

  it('refuses a car it cannot draw, and never throws at the caller', async () => {
    expect(await ensurePlate({ year: 0, make: 'BMW', model: 'M235i' }, { client: client() })).toMatchObject({ key: null });
    expect(await ensurePlate({ year: 2015, make: '', model: 'M235i' }, { client: client() })).toMatchObject({ key: null });
    const broken = { from: () => { throw new Error('db down'); } } as unknown as import('@supabase/supabase-js').SupabaseClient;
    expect(await ensurePlate({ year: 2015, make: 'BMW', model: 'M235i' }, { client: broken })).toMatchObject({ key: null, reason: 'db down' });
  });
});

describe('the trigger', () => {
  it('posts the key to the background function with the sweep\'s secret header', async () => {
    process.env.URL = 'https://tappet.example';
    process.env.CRON_SECRET = 's3cret';
    fetchMock.mockResolvedValueOnce({ ok: true, status: 202 } as Response);
    await triggerPlateJob('bmw/2-series/f22');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://tappet.example/.netlify/functions/plate-generate-background',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-cron-secret': 's3cret' }),
        body: JSON.stringify({ key: 'bmw/2-series/f22' }),
      }),
    );
  });

  it('sends nothing when the site is not configured, and does not throw', async () => {
    await expect(triggerPlateJob('bmw/2-series/f22')).resolves.toBeUndefined();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('claimPlate', () => {
  const pending = () => ({ key: 'k', make: 'bmw', family: '2-series', generation: 'f22', year_from: 2014, year_to: 2021, status: 'pending', prompt: 'p', model: 'm', claimed_at: null, attempts: 0, generated_at: null });

  it('takes a pending row and marks it generating', async () => {
    db.tables.vehicle_plates.push(pending());
    const claim = await claimPlate('k', { client: client() });
    expect(claim.claimed).toBe(true);
    expect(db.tables.vehicle_plates[0]).toMatchObject({ status: 'generating' });
    expect(db.tables.vehicle_plates[0].claimed_at).toBeTruthy();
  });

  it('leaves a ready row alone, and a fresh claim to whoever holds it', async () => {
    db.tables.vehicle_plates.push({ ...pending(), status: 'ready' });
    expect(await claimPlate('k', { client: client() })).toEqual({ claimed: false, reason: 'ready' });
    db.tables.vehicle_plates[0] = { ...pending(), status: 'generating', claimed_at: new Date().toISOString() };
    expect(await claimPlate('k', { client: client() })).toEqual({ claimed: false, reason: 'busy' });
    expect(await claimPlate('nope', { client: client() })).toEqual({ claimed: false, reason: 'missing' });
  });

  it('refuses at the daily cap and the row stays pending — exhaustion degrades, never breaks', async () => {
    const recent = new Date().toISOString();
    for (let i = 0; i < PLATE_DAILY_CAP; i++) {
      db.tables.vehicle_plates.push({ ...pending(), key: `done-${i}`, status: 'ready', generated_at: recent });
    }
    db.tables.vehicle_plates.push(pending());
    expect(await claimPlate('k', { client: client() })).toEqual({ claimed: false, reason: 'capped' });
    expect(db.tables.vehicle_plates.find((r) => r.key === 'k')).toMatchObject({ status: 'pending' });
  });
});

describe('storePlate and attachPlateToVehicle', () => {
  it('uploads the two derivatives under the key and marks the row ready', async () => {
    db.tables.vehicle_plates.push({ key: 'bmw/2-series/f22', status: 'generating', attempts: 0 });
    await storePlate({ key: 'bmw/2-series/f22', hero: Buffer.alloc(10), card: Buffer.alloc(5) }, { client: client() });
    expect(db.uploads.map((u) => `${u.bucket}:${u.path}`)).toEqual([
      'garage-images:plates/bmw/2-series/f22/hero-3x2.jpg',
      'garage-images:plates/bmw/2-series/f22/card-800.jpg',
    ]);
    expect(db.uploads[0].opts).toMatchObject({ contentType: 'image/jpeg', upsert: true });
    expect(db.tables.vehicle_plates[0]).toMatchObject({
      status: 'ready',
      hero_path: 'plates/bmw/2-series/f22/hero-3x2.jpg',
      card_path: 'plates/bmw/2-series/f22/card-800.jpg',
      attempts: 1,
      cost_usd_estimate: 0.134,
    });
    expect(db.tables.vehicle_plates[0].generated_at).toBeTruthy();
  });

  it('attaches only to a car that has no plate yet', async () => {
    db.tables.vehicles.push({ id: 'v1', plate_key: null }, { id: 'v2', plate_key: 'honda/accord/10th' });
    expect(await attachPlateToVehicle('v1', 'bmw/2-series/f22', { client: client() })).toBe(true);
    expect(await attachPlateToVehicle('v2', 'bmw/2-series/f22', { client: client() })).toBe(true);
    expect(db.tables.vehicles).toEqual([
      { id: 'v1', plate_key: 'bmw/2-series/f22' },
      { id: 'v2', plate_key: 'honda/accord/10th' },
    ]);
  });
});
