/**
 * A cost nobody gave is stored as `null`, never 0 (audit 360, TL-27).
 *
 * @jest-environment node
 *
 * `addMaintenanceHistory` wrote `cost_labor: cost || 0`, and `service_items`
 * defaults both cost columns to 0 (production OpenAPI, 1 Oct), so an absent
 * cost became a recorded free job. Executed against a stubbed insert.
 */

jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: jest.fn(),
  createServerActionClient: jest.fn(),
  getServerClient: jest.fn(),
  supabase: {},
}));
jest.mock('@/lib/api-auth', () => ({
  requireSession: jest.fn(),
  requireCaller: jest.fn(),
  authorizeVehicleAccess: jest.fn(async () => ({ ok: true, userId: 'u1' })),
}));

import { getServiceRoleClient } from '@/lib/supabase';
import { addMaintenanceHistory } from '@/app/actions';

describe('addMaintenanceHistory (TL-27)', () => {
  let inserted: Array<Record<string, unknown>>;
  beforeEach(() => {
    inserted = [];
    (getServiceRoleClient as jest.Mock).mockReturnValue({
      from: () => ({
        insert: async (row: Record<string, unknown>) => {
          inserted.push(row);
          return { error: null };
        },
      }),
    });
  });

  it('stores no cost as null in both cost columns', async () => {
    await addMaintenanceHistory('v1', 'Oil change', '2026-09-01', 'Shop', undefined);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].cost_labor).toBeNull();
    expect(inserted[0].cost_parts).toBeNull();
  });

  it('anti-vacuous: a given cost is stored', async () => {
    await addMaintenanceHistory('v1', 'Oil change', '2026-09-01', 'Shop', 65);
    expect(inserted[0].cost_labor).toBe(65);
  });
});
