/**
 * Removing a vehicle removes its receipts — one path, for the web, the phone
 * and the purge account deletion shares.
 *
 * @jest-environment node
 *
 * Proven 20 Sep before any of this was written: the web's `deleteVehicle`
 * deleted the row and trusted the cascade, and a probe object at
 * `80de5647-…/invoices/probe-153411-receipt.jpg` outlived its row. Account
 * deletion's private purge removed the same kind of object on a throwaway
 * user. These pin the shape that makes that impossible to drift back: the
 * purge is one module, `removeVehicle` runs it first and refuses when it
 * fails, the web action and the route both call it, and the confirmation's
 * counts come from rows or are not drawn.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

/* A fake service client: tables as arrays, a bucket as paths. */
const state: {
  vehicle: Record<string, unknown> | null;
  counts: Record<string, number | 'error'>;
  singles: Record<string, { data: unknown; error?: { message: string } }>;
  objects: string[];
  listFails: boolean;
  removeFails: boolean;
  deleteFails: boolean;
  log: string[];
} = { vehicle: null, counts: {}, singles: {}, objects: [], listFails: false, removeFails: false, deleteFails: false, log: [] };

jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: () => ({
    from: (table: string) => ({
      select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.head) {
          return {
            eq: () => {
              const c = state.counts[table];
              return Promise.resolve(c === 'error' ? { count: null, error: { message: 'boom' } } : { count: c ?? 0, error: null });
            },
          };
        }
        return {
          eq: () => ({
            maybeSingle: () => {
              if (table === 'vehicles') return Promise.resolve({ data: state.vehicle, error: null });
              return Promise.resolve(state.singles[table] ?? { data: null, error: null });
            },
          }),
        };
      },
      delete: () => ({
        eq: () => ({
          select: () => {
            state.log.push('delete-row');
            if (state.deleteFails) return Promise.resolve({ data: null, error: { message: 'db down' } });
            const had = state.vehicle;
            state.vehicle = null;
            return Promise.resolve({ data: had ? [{ id: had.id }] : [], error: null });
          },
        }),
      }),
    }),
    storage: {
      from: () => ({
        list: (prefix: string) => {
          state.log.push(`list:${prefix}`);
          if (state.listFails) return Promise.resolve({ data: null, error: { message: 'storage down' } });
          const under = state.objects.filter((o) => o.startsWith(`${prefix}/`)).map((o) => ({ name: o.slice(prefix.length + 1), id: 'obj' }));
          return Promise.resolve({ data: under, error: null });
        },
        remove: (paths: string[]) => {
          state.log.push(`remove:${paths.length}`);
          if (state.removeFails) return Promise.resolve({ error: { message: 'cannot remove' } });
          state.objects = state.objects.filter((o) => !paths.includes(o));
          return Promise.resolve({ error: null });
        },
      }),
    },
  }),
}));

import { inventoryVehicleRemoval, removeVehicle } from '@/lib/vehicle-deletion';

const V = 'aaaaaaaa-0000-0000-0000-000000000001';

beforeEach(() => {
  state.vehicle = { id: V, year: 2003, make: 'Honda', model: 'Accord' };
  state.counts = { recall_actions: 2, maintenance_line_items: 6, consultant_conversations: 1, wishlist_items: 0 };
  state.singles = {
    nhtsa_data: { data: { recalls: Array.from({ length: 24 }, (_, i) => ({ NHTSACampaignNumber: `c${i}`, Component: 'AIR BAGS', Summary: 's' })) } },
    vehicle_health_summary: { data: { health_score: 50 } },
    vehicle_knowledge_base: { data: { maintenance_schedule: [1, 2, 3] } },
  };
  state.objects = [`${V}/invoices/a.jpg`, `${V}/invoices/b.jpg`, `${V}/photos/c.jpg`];
  state.listFails = false;
  state.removeFails = false;
  state.deleteFails = false;
  state.log = [];
});

describe('removeVehicle — the objects first, then the row', () => {
  it('purges every object under the vehicle, then deletes the row', async () => {
    const outcome = await removeVehicle(V);
    expect(outcome).toEqual({ ok: true, removed: { storageObjects: 3 } });
    expect(state.objects).toEqual([]);
    expect(state.vehicle).toBeNull();
    // Order is load-bearing: the row goes last.
    expect(state.log.indexOf('delete-row')).toBe(state.log.length - 1);
    expect(state.log.filter((l) => l.startsWith('remove:'))).toEqual(['remove:3']);
  });

  it('refuses the removal when the bucket cannot be listed — nothing is deleted', async () => {
    state.listFails = true;
    const outcome = await removeVehicle(V);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.reason).toBe('storage');
    expect(state.vehicle).not.toBeNull();
    expect(state.log).not.toContain('delete-row');
  });

  it('refuses when an object cannot be removed, and says so', async () => {
    state.removeFails = true;
    const outcome = await removeVehicle(V);
    expect(outcome).toMatchObject({ ok: false, reason: 'storage', leftBehind: 1 });
    expect(outcome.ok === false && outcome.error).toMatch(/nothing was removed/);
    expect(state.log).not.toContain('delete-row');
  });

  it('a car with no objects is removed with a count of zero, not a failure', async () => {
    state.objects = [];
    expect(await removeVehicle(V)).toEqual({ ok: true, removed: { storageObjects: 0 } });
    expect(state.vehicle).toBeNull();
  });

  it('a missing car is said so', async () => {
    state.vehicle = null;
    expect(await removeVehicle(V)).toMatchObject({ ok: false, reason: 'missing' });
  });

  it('a failed row delete after a successful purge is reported as the row, not hidden', async () => {
    state.deleteFails = true;
    const outcome = await removeVehicle(V);
    expect(outcome).toMatchObject({ ok: false, reason: 'row' });
  });
});

describe('inventoryVehicleRemoval — counts from rows, or no count', () => {
  it('quotes the rows: open recalls are campaigns minus repaired', async () => {
    const inv = await inventoryVehicleRemoval(V);
    expect(inv).toMatchObject({
      vehicle: { id: V, year: 2003, make: 'Honda', model: 'Accord' },
      openRecalls: 22,
      markedRepaired: 2,
      serviceRecords: 6,
      receiptPhotographs: 3,
      hasHealthScore: true,
      hasSchedule: true,
      advisorThreads: 1,
      needs: 0,
    });
  });

  it('a count that cannot be read is null — the phone draws no line for it', async () => {
    state.counts.maintenance_line_items = 'error';
    state.listFails = true;
    const inv = await inventoryVehicleRemoval(V);
    expect(inv?.serviceRecords).toBeNull();
    expect(inv?.receiptPhotographs).toBeNull();
    // And open recalls need both halves.
    state.counts.recall_actions = 'error';
    expect((await inventoryVehicleRemoval(V))?.openRecalls).toBeNull();
  });

  it('a missing car is null, not an empty inventory', async () => {
    state.vehicle = null;
    expect(await inventoryVehicleRemoval(V)).toBeNull();
  });
});

describe('one path, three callers', () => {
  const actions = code(read('app', 'actions.ts'));
  const body = (() => {
    const start = actions.indexOf('export async function deleteVehicle(');
    const rest = actions.slice(start + 1);
    const next = rest.search(/^(?:export )?(?:async )?function \w+\(/m);
    return actions.slice(start, start + 1 + next);
  })();

  it('the web action removes through removeVehicle and never deletes the row itself', () => {
    expect(body).toMatch(/await removeVehicle\(vehicleId\)/);
    expect(body).not.toMatch(/\.from\('vehicles'\)\s*\.delete\(/);
    // Still authorizes first — the ownership check that stops "any vehicle, given its id".
    expect(body.indexOf("authorizeVehicleAccess(vehicleId, { intent: 'write' })")).toBeLessThan(body.indexOf('removeVehicle('));
  });

  it('the phone route runs the same function, vehicle-scoped, on both verbs', () => {
    const route = code(read('app', 'api', 'v1', 'vehicle-removal', 'route.ts'));
    expect(route).toMatch(/export async function GET/);
    expect(route).toMatch(/export async function DELETE/);
    expect((route.match(/authorizeVehicleAccess\(vehicleId, \{ intent: 'write' \}\)/g) ?? []).length).toBe(2);
    expect(route).toMatch(/await removeVehicle\(vehicleId as string\)/);
    expect(route).toMatch(/await inventoryVehicleRemoval\(vehicleId as string\)/);
  });

  it('the purge is defined once, and account deletion uses that one', () => {
    const purge = read('lib', 'storage-purge.ts');
    const account = read('lib', 'account-data.ts');
    expect(purge).toMatch(/export async function purgeVehicleStorage\(/);
    expect(account).not.toMatch(/async function purgeVehicleStorage\(/);
    expect(account).toMatch(/import \{ purgeVehicleStorage \} from '@\/lib\/storage-purge'/);
    expect(code(account)).toMatch(/await purgeVehicleStorage\(client, vehicleIds\)/);
    const deletion = read('lib', 'vehicle-deletion.ts');
    expect(deletion).toMatch(/import \{ listObjectsRecursive, purgeVehicleStorage \} from '@\/lib\/storage-purge'/);
  });

  it('can still detect the action that shipped, so this is not vacuous', () => {
    const shipped = `
export async function deleteVehicle(vehicleId: string) {
    const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
    const { error: vehicleError, data } = await client
      .from('vehicles')
      .delete()
      .eq('id', vehicleId)
      .select();
export async function updateIssueStatus(`;
    const start = shipped.indexOf('export async function deleteVehicle(');
    const rest = shipped.slice(start + 1);
    const next = rest.search(/^(?:export )?(?:async )?function \w+\(/m);
    const old = shipped.slice(start, start + 1 + next);
    expect(old).toMatch(/\.from\('vehicles'\)\s*\.delete\(/);
    expect(old).not.toMatch(/removeVehicle\(/);
  });
});
