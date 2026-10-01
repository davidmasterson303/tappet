/**
 * A server action writes named columns, to rows of the car it authorized.
 *
 * @jest-environment node
 *
 * Audit 360, security round 3 (1 Oct). Next compiles every export of a
 * `'use server'` file into a POST endpoint, and a parameter's TypeScript type
 * is erased at that boundary — the client posts whatever it likes. Two shapes
 * shipped, both behind a correct authorization:
 *
 *   - SEC-12 · `updateServiceItem(itemId, updates: any)` → `.update(updates)`:
 *     `vehicle_id` was the caller's to choose, so a free account could move
 *     its own line onto the public demo's Accord.
 *   - SEC-14 · `updateVehicleTCOFields` → `.update({ ...fields, … })`:
 *     `is_demo`, `user_id` and `vin` were writable.
 *   - SEC-13 · `moveServiceItemToHistory` authorized `vehicleId`, then read
 *     and deleted `serviceItemId` alone with the service role — the demo's
 *     service-item ids are anon-readable, so any account could empty the
 *     demo's Needs.
 *
 * And the sweep of every export found two more of the second kind:
 *   - `generateQuoteRequestV2` read `.in('id', selectedItemIds)` with no
 *     vehicle filter — another car's items, into a quote, from the demo.
 *   - `getModificationDetailsBatch` (a `read` action, so open to a demo
 *     visitor) enqueued whatever mod names it was sent into the demo cars'
 *     queue.
 *
 * Part 1 is a scanner over every `'use server'` file; part 2 executes the
 * fixed actions against a recording client.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = join(__dirname, '..', '..');

// ── Part 1 · the scanner ────────────────────────────────────────────────────

const SKIP_DIRS = new Set(['node_modules', '__tests__', '.next', 'apps', 'packages']);

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, acc);
    else if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
}

/**
 * The source with every comment blanked and strings kept — the docblocks in
 * `app/actions.ts` quote the shapes this scanner looks for, on purpose.
 */
export function stripComments(source: string): string {
  let out = '';
  let i = 0;
  let quote: string | null = null;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = null;
      i++;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      out += source.slice(i, stop).replace(/[^\n]/g, ' ');
      i = stop;
    } else if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else {
      if (c === "'" || c === '"' || c === '`') quote = c;
      out += c;
      i++;
    }
  }
  return out;
}

/** True when the module's first statement is the directive (comments aside). */
export function isServerModule(source: string): boolean {
  const code = source.replace(/^(\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, '');
  return /^['"]use server['"]/.test(code);
}

/** The text between an opening bracket at `open` and its match. */
function balanced(source: string, open: number): string {
  const pairs: Record<string, string> = { '(': ')', '{': '}', '[': ']' };
  const stack: string[] = [];
  for (let i = open; i < source.length; i++) {
    const c = source[i];
    if (c in pairs) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) {
      stack.pop();
      if (stack.length === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

/** Split at commas that are not inside any bracket. */
function topLevel(list: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if ('({[<'.includes(c)) depth++;
    else if (')}]>'.includes(c)) depth--;
    else if (c === ',' && depth === 0) {
      parts.push(list.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(list.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** Every name a client can set: plain parameters and destructured ones. */
function parameterNames(params: string): string[] {
  const names: string[] = [];
  for (const param of topLevel(params)) {
    if (param.startsWith('{')) {
      const inner = balanced(param, 0);
      for (const field of topLevel(inner)) {
        const m = /^(?:\.\.\.)?\s*([A-Za-z_$][\w$]*)\s*(?::\s*([A-Za-z_$][\w$]*))?/.exec(field);
        if (m) names.push(m[2] ?? m[1]);
      }
    } else {
      const m = /^([A-Za-z_$][\w$]*)/.exec(param);
      if (m) names.push(m[1]);
    }
  }
  return names;
}

export interface WriteFinding {
  fn: string;
  call: string;
}

export interface ScanResult {
  exports: number;
  writes: number;
  findings: WriteFinding[];
}

/**
 * Every `.update(` / `.insert(` / `.upsert(` inside an exported function
 * whose payload is a parameter (or a member of one), or spreads one.
 */
export function findClientObjectWrites(raw: string): ScanResult {
  const source = stripComments(raw);
  const result: ScanResult = { exports: 0, writes: 0, findings: [] };
  const exportRe = /export\s+async\s+function\s+([A-Za-z_$][\w$]*)\s*(<[^>]*>)?\s*\(/g;
  const starts: Array<{ name: string; paren: number; at: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = exportRe.exec(source))) {
    starts.push({ name: m[1], paren: m.index + m[0].length - 1, at: m.index });
  }
  result.exports = starts.length;

  starts.forEach((start, i) => {
    const params = balanced(source, start.paren);
    const end = i + 1 < starts.length ? starts[i + 1].at : source.length;
    const body = source.slice(start.paren + params.length + 2, end);
    const names = parameterNames(params);

    const writeRe = /\.(update|insert|upsert)\s*\(/g;
    let w: RegExpExecArray | null;
    while ((w = writeRe.exec(body))) {
      result.writes++;
      const args = balanced(body, w.index + w[0].length - 1);
      const payload = topLevel(args)[0] ?? '';
      const bare = /^([A-Za-z_$][\w$]*)(\.[\w$.]+)?(\s+as\s+.*)?$/.exec(payload);
      const passesParam = bare !== null && names.includes(bare[1]);
      const spreadsParam = names.some((n) => new RegExp(`\\.\\.\\.\\s*${n.replace(/\$/g, '\\$')}\\b`).test(payload));
      if (passesParam || spreadsParam) {
        result.findings.push({ fn: start.name, call: `.${w[1]}(${payload.slice(0, 60)})` });
      }
    }
  });
  return result;
}

describe('no server action writes a client object without an allow-list', () => {
  const files = walk(join(ROOT, 'app')).concat(walk(join(ROOT, 'lib')))
    .filter((file) => isServerModule(readFileSync(file, 'utf8')));
  const relativeFiles = files.map((f) => relative(ROOT, f)).sort();

  it('found the server modules', () => {
    expect(relativeFiles).toEqual(expect.arrayContaining([
      'app/actions.ts',
      'app/account-actions.ts',
      'lib/actions/wishlist.ts',
    ]));
  });

  it.each(files.map((f) => [relative(ROOT, f), f]))('%s', (_name, file) => {
    const scan = findClientObjectWrites(readFileSync(file, 'utf8'));
    expect(scan.exports).toBeGreaterThan(0);
    expect(scan.findings).toEqual([]);
  });

  it('read the whole of app/actions.ts, not a fragment of it', () => {
    const scan = findClientObjectWrites(readFileSync(join(ROOT, 'app', 'actions.ts'), 'utf8'));
    expect(scan.exports).toBeGreaterThanOrEqual(70);
    expect(scan.writes).toBeGreaterThanOrEqual(50);
  });

  it('can still detect each shape that shipped (anti-vacuous)', () => {
    const shipped = [
      `export async function updateServiceItem(itemId: string, updates: any) {
        const { data } = await client.from('service_items').update(updates).eq('id', itemId);
      }`,
      `export async function updateVehicleTCOFields(vehicleId: string, fields: { avg_mpg?: number }) {
        await client.from('vehicles').update({
          ...fields,
          updated_at: new Date().toISOString(),
        }).eq('id', vehicleId);
      }`,
      `export async function saveThing({ vehicleId, row }: { vehicleId: string; row: any }) {
        await client.from('things').insert(row as Thing);
      }`,
      `export async function saveNested(input: { row: Row }) {
        await client.from('things').upsert(input.row, { onConflict: 'id' });
      }`,
    ];
    for (const source of shipped) {
      expect(findClientObjectWrites(source).findings).toHaveLength(1);
    }
  });

  it('passes a payload built from named columns', () => {
    const fixed = `export async function updateVehicleTCOFields(vehicleId: string, fields: unknown) {
      const checked = tcoPatch(fields);
      await client.from('vehicles').update({ ...checked.patch, updated_at: now }).eq('id', vehicleId);
      await client.from('service_items').insert({ vehicle_id: vehicleId, description: data.description });
    }`;
    const scan = findClientObjectWrites(fixed);
    expect(scan.writes).toBe(2);
    expect(scan.findings).toEqual([]);
  });

  it('reads code, not the comments that quote the old shape', () => {
    const quoted = `export async function a(updates: unknown) {
      /* This was \`.update(updates)\` — see SEC-12. */
      // and .insert({ ...updates }) too
      await client.from('t').update({ name: 'https://example.com/x' });
    }`;
    const scan = findClientObjectWrites(quoted);
    expect(scan.writes).toBe(1);
    expect(scan.findings).toEqual([]);
  });

  it('isServerModule reads the directive, not a mention of it', () => {
    expect(isServerModule("'use server';\nexport async function a() {}")).toBe(true);
    expect(isServerModule("/** doc */\n'use server';\n")).toBe(true);
    expect(isServerModule("/** a 'use server' file may only export … */\nimport x from 'y';")).toBe(false);
  });
});

// ── Part 2 · the fixed actions, executed ────────────────────────────────────

jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: jest.fn(),
  createServerActionClient: jest.fn(),
  getServerClient: jest.fn(),
  supabase: {},
}));
jest.mock('@/lib/api-auth', () => ({
  NOT_FOUND_MESSAGE: 'Vehicle not found',
  requireSession: jest.fn(),
  requireCaller: jest.fn(),
  authorizeVehicleAccess: jest.fn(),
  authorizeVehicleScopedRow: jest.fn(),
}));

import { getServiceRoleClient } from '@/lib/supabase';
import { authorizeVehicleAccess, authorizeVehicleScopedRow } from '@/lib/api-auth';
import { DEMO_VEHICLE_IDS } from '@tappet/core/demo';
import {
  getModificationDetailsBatch,
  moveServiceItemToHistory,
  updateServiceItem,
  updateVehicleTCOFields,
} from '@/app/actions';
import { serviceItemPatch, tcoPatch } from '@/lib/action-patches';

const DEMO_ACCORD = DEMO_VEHICLE_IDS[0];
const OWN_CAR = 'b1000000-0000-0000-0000-00000000000b';
const DEMO_ITEM = '4a8f50c3-e320-4e65-ad9d-47fb02c03909';
const OWN_ITEM = 'c1000000-0000-0000-0000-00000000000c';

interface Query {
  table: string;
  op: 'select' | 'insert' | 'update' | 'upsert' | 'delete';
  payload?: unknown;
  filters: Array<[string, unknown]>;
}

/** A recording client over a tiny `service_items` table. */
function recordingClient(log: Query[], rows: Array<Record<string, unknown>>) {
  const matches = (q: Query) =>
    rows.filter((r) => q.filters.every(([c, v]) => (Array.isArray(v) ? v.includes(r[c]) : r[c] === v)));
  return {
    from(table: string) {
      const q: Query = { table, op: 'select', filters: [] };
      log.push(q);
      const one = () => {
        if (q.op === 'insert') return { data: { id: 'new-row', ...(q.payload as object) }, error: null };
        if (table === 'service_items') return { data: matches(q)[0] ?? null, error: null };
        return { data: null, error: null };
      };
      const builder: any = {
        select: () => builder,
        insert: (p: unknown) => ((q.op = 'insert'), (q.payload = p), builder),
        update: (p: unknown) => ((q.op = 'update'), (q.payload = p), builder),
        upsert: (p: unknown) => ((q.op = 'upsert'), (q.payload = p), builder),
        delete: () => ((q.op = 'delete'), builder),
        eq: (c: string, v: unknown) => (q.filters.push([c, v]), builder),
        in: (c: string, v: unknown) => (q.filters.push([c, v]), builder),
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => one(),
        single: async () => one(),
        then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          Promise.resolve({ data: q.op === 'select' ? [] : null, error: null }).then(resolve, reject),
      };
      return builder;
    },
  };
}

let log: Query[];
const writes = () => log.filter((q) => q.op !== 'select');

beforeEach(() => {
  log = [];
  (getServiceRoleClient as jest.Mock).mockReturnValue(
    recordingClient(log, [
      { id: DEMO_ITEM, vehicle_id: DEMO_ACCORD, description: 'CVT Fluid Flush', category: 'maintenance', cost_parts: 120, cost_labor: 80 },
      { id: OWN_ITEM, vehicle_id: OWN_CAR, description: 'Brake pads', category: 'repair', cost_parts: 90, cost_labor: 60 },
    ])
  );
  (authorizeVehicleAccess as jest.Mock).mockResolvedValue({ ok: true, isDemo: false, userId: 'u1' });
  (authorizeVehicleScopedRow as jest.Mock).mockResolvedValue({ ok: true, isDemo: false, userId: 'u1', vehicleId: OWN_CAR });
});

describe('SEC-12 · updateServiceItem', () => {
  it('refuses a vehicle_id, so its own line cannot be moved onto the demo', async () => {
    const result = await updateServiceItem(OWN_ITEM, { vehicle_id: DEMO_ACCORD, description: 'Planted' });
    expect(result.success).toBe(false);
    expect(writes()).toEqual([]);
  });

  it.each([['id'], ['created_at'], ['vehicle_id']])('refuses %s', async (column) => {
    const result = await updateServiceItem(OWN_ITEM, { [column]: 'x' });
    expect(result.success).toBe(false);
    expect(writes()).toEqual([]);
  });

  it('refuses an uncapped description with the SEC-10 sentence', async () => {
    const result = await updateServiceItem(OWN_ITEM, { description: 'x'.repeat(4_001) });
    expect(result).toEqual({ success: false, error: 'The description must be 4,000 characters or fewer.' });
    expect(writes()).toEqual([]);
  });

  it('anti-vacuous: writes named columns, scoped to the authorized car', async () => {
    const result = await updateServiceItem(OWN_ITEM, { description: 'Front brake pads', cost_parts: 95 });
    expect(result.success).toBe(true);
    expect(writes()).toEqual([
      {
        table: 'service_items',
        op: 'update',
        payload: { description: 'Front brake pads', cost_parts: 95 },
        filters: [['id', OWN_ITEM], ['vehicle_id', OWN_CAR]],
      },
    ]);
  });
});

describe('SEC-13 · moveServiceItemToHistory', () => {
  it('cannot read or delete the demo’s item from the caller’s own car', async () => {
    const result = await moveServiceItemToHistory(DEMO_ITEM, OWN_CAR, { dateCompleted: '2026-10-01' });
    expect(result).toEqual({ success: false, error: 'Service item not found' });
    expect(writes()).toEqual([]);
    const read = log.find((q) => q.table === 'service_items');
    expect(read?.filters).toEqual([['id', DEMO_ITEM], ['vehicle_id', OWN_CAR]]);
  });

  it('refuses an invoice path filed under another car', async () => {
    const result = await moveServiceItemToHistory(OWN_ITEM, OWN_CAR, {
      dateCompleted: '2026-10-01',
      invoiceUrl: `placeholder://${DEMO_ACCORD}/invoices/1700000000000-receipt.pdf`,
    });
    expect(result.success).toBe(false);
    expect(writes()).toEqual([]);
  });

  it('anti-vacuous: files the caller’s own item and deletes it from that car only', async () => {
    const result = await moveServiceItemToHistory(OWN_ITEM, OWN_CAR, { dateCompleted: '2026-10-01', shopName: 'Main Street Auto' });
    expect(result.success).toBe(true);
    const [insert, remove] = writes();
    expect(insert).toMatchObject({ table: 'maintenance_line_items', op: 'insert', payload: { vehicle_id: OWN_CAR, item_description: 'Brake pads' } });
    expect(remove).toEqual({ table: 'service_items', op: 'delete', filters: [['id', OWN_ITEM], ['vehicle_id', OWN_CAR]] });
  });
});

describe('SEC-14 · updateVehicleTCOFields', () => {
  it.each([
    [{ is_demo: true }],
    [{ user_id: '00000000-0000-0000-0000-000000000000' }],
    [{ vin: 'DEMO1HGCV1F30JA000001' }],
    [{ avg_mpg: 30, is_demo: true }],
    [{ avg_mpg: -1 }],
    [{ purchase_price: '25000' }],
  ])('refuses %j', async (fields) => {
    const result = await updateVehicleTCOFields(OWN_CAR, fields as never);
    expect(result.success).toBe(false);
    expect(writes()).toEqual([]);
  });

  it('anti-vacuous: the four numbers the modal sends are written, and nothing else', async () => {
    const result = await updateVehicleTCOFields(OWN_CAR, {
      purchase_price: 24_500,
      avg_mpg: 31.5,
      fuel_price_per_gallon: null,
      insurance_monthly: 112,
    });
    expect(result.success).toBe(true);
    const [update] = writes();
    expect(update.table).toBe('vehicles');
    expect(Object.keys(update.payload as object).sort()).toEqual(
      ['avg_mpg', 'fuel_price_per_gallon', 'insurance_monthly', 'purchase_price', 'updated_at']
    );
    expect(update.filters).toEqual([['id', OWN_CAR]]);
  });
});

describe('sweep · a demo read writes nothing', () => {
  it('getModificationDetailsBatch does not enqueue for a demo visitor', async () => {
    (authorizeVehicleAccess as jest.Mock).mockResolvedValue({ ok: true, isDemo: true, userId: null });
    await getModificationDetailsBatch(DEMO_ACCORD, ['x'.repeat(10_000), 'Anything at all'], 'moderate');
    expect(writes()).toEqual([]);
  });

  it('anti-vacuous: an owner’s missing details are still enqueued', async () => {
    await getModificationDetailsBatch(OWN_CAR, ['Cold air intake'], 'moderate');
    expect(writes()).toEqual([
      expect.objectContaining({ table: 'mod_detail_queue', op: 'upsert' }),
    ]);
  });
});

describe('sweep · generateQuoteRequestV2 reads only the authorized car’s items', () => {
  it('the service-item read is scoped to the vehicle before the id list', () => {
    const actions = readFileSync(join(ROOT, 'app', 'actions.ts'), 'utf8');
    const start = actions.indexOf('export async function generateQuoteRequestV2(');
    expect(start).toBeGreaterThan(-1);
    const body = actions.slice(start);
    const read = /\.from\('service_items'\)\s*\.select\('\*'\)\s*([\s\S]*?)\.in\('id', selectedItemIds\)/.exec(body);
    expect(read).not.toBeNull();
    expect(read![1]).toMatch(/\.eq\('vehicle_id', vehicleId\)/);
  });

  it('anti-vacuous: the shipped read has no vehicle filter', () => {
    const shipped = `.from('service_items')
        .select('*')
        .in('id', selectedItemIds);`;
    const read = /\.from\('service_items'\)\s*\.select\('\*'\)\s*([\s\S]*?)\.in\('id', selectedItemIds\)/.exec(shipped);
    expect(read![1]).not.toMatch(/\.eq\('vehicle_id', vehicleId\)/);
  });
});

describe('the allow-lists themselves', () => {
  it('serviceItemPatch refuses a non-object and an empty patch', () => {
    expect(serviceItemPatch(null).ok).toBe(false);
    expect(serviceItemPatch([]).ok).toBe(false);
    expect(serviceItemPatch({}).ok).toBe(false);
    expect(serviceItemPatch({ status: 'pwned' }).ok).toBe(false);
    expect(serviceItemPatch({ date_completed: 'yesterday' }).ok).toBe(false);
  });

  it('serviceItemPatch keeps null as null, never 0', () => {
    expect(serviceItemPatch({ cost_labor: null })).toEqual({ ok: true, patch: { cost_labor: null } });
  });

  it('tcoPatch refuses non-finite numbers', () => {
    expect(tcoPatch({ avg_mpg: Number.NaN }).ok).toBe(false);
    expect(tcoPatch({ avg_mpg: Number.POSITIVE_INFINITY }).ok).toBe(false);
    expect(tcoPatch({ avg_mpg: 0 })).toEqual({ ok: true, patch: { avg_mpg: 0 } });
  });
});
