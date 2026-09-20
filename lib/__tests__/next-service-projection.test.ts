/**
 * The next service is projected when the research lands, with the sweep's
 * own maths, and the two write sites cannot drift.
 *
 * @jest-environment node
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

const seeded: { vehicle: unknown; knowledge: unknown; history: unknown[] } = { vehicle: null, knowledge: null, history: [] };
const updates: Array<Record<string, unknown>> = [];
jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: () => ({
    from: (table: string) => ({
      select: () => {
        const answer = table === 'vehicles' ? seeded.vehicle : table === 'vehicle_knowledge_base' ? seeded.knowledge : null;
        const chain = {
          eq: () => (table === 'maintenance_line_items' ? Promise.resolve({ data: seeded.history }) : chain),
          maybeSingle: () => Promise.resolve({ data: answer }),
        };
        return chain;
      },
      update: (values: Record<string, unknown>) => {
        updates.push(values);
        return { eq: () => Promise.resolve({ error: null }) };
      },
    }),
  }),
}));

import { projectNextService } from '@/lib/next-service';

beforeEach(() => {
  updates.length = 0;
  seeded.vehicle = { current_mileage: 120_000 };
  seeded.knowledge = {
    maintenance_schedule: [
      { service: 'Engine oil and filter', interval_miles: 5_000 },
      { service: 'Timing belt', interval_miles: 90_000 },
    ],
  };
  seeded.history = [];
});

describe('projectNextService', () => {
  it('writes the three columns the sweep writes, from the schedule and the odometer', async () => {
    const projected = await projectNextService('v1');
    expect(projected?.service).toBeTruthy();
    expect(updates).toHaveLength(1);
    expect(Object.keys(updates[0]).sort()).toEqual(['next_service_at_miles', 'next_service_label', 'next_service_updated_at']);
    expect(updates[0].next_service_label).toBe(projected?.service);
  });

  it('projects nothing — and writes nothing — without an odometer or a schedule', async () => {
    seeded.vehicle = { current_mileage: 0 };
    expect(await projectNextService('v1')).toBeNull();
    seeded.vehicle = { current_mileage: 50_000 };
    seeded.knowledge = { maintenance_schedule: [] };
    expect(await projectNextService('v1')).toBeNull();
    expect(updates).toEqual([]);
  });

  it('is called when the research is stored, and the sweep still writes the same three columns', () => {
    const research = code(read('lib', 'vehicle-research.ts'));
    const store = research.slice(research.indexOf('export async function storeResearchResponse'), research.indexOf('export async function markResearchFailed'));
    expect(store).toMatch(/await projectNextService\(vehicleId\)/);
    const sweep = code(read('app', 'api', 'internal', 'notify-sweep', 'route.ts'));
    const mine = code(read('lib', 'next-service.ts'));
    for (const column of ['next_service_label', 'next_service_at_miles', 'next_service_updated_at']) {
      expect([column, sweep.includes(`${column}:`)]).toEqual([column, true]);
      expect([column, mine.includes(`${column}:`)]).toEqual([column, true]);
    }
  });
});
