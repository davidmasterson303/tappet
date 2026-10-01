/**
 * The web's odometer write keeps the phone's rule and moves the projection
 * (audit 360, TL-26).
 *
 * @jest-environment node
 *
 * `updateVehicleMileage` wrote any integer, with no range or jump rule and no
 * `projectNextService`: a web typo (450000 for 45000) was stored and the
 * phone's next reading refused as below it, and the phone's NEXT SERVICE
 * cell kept yesterday's projection until the sweep. `createVehicle` (the
 * wizard) skipped the first-reading rule the add route applies. Executed
 * against a stubbed table: the assertions are what was written.
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
  authorizeVehicleAccess: jest.fn(),
}));
jest.mock('@/lib/next-service', () => ({ projectNextService: jest.fn(async () => null) }));

import { createServerActionClient, getServiceRoleClient } from '@/lib/supabase';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { projectNextService } from '@/lib/next-service';
import { createVehicle, updateVehicleMileage } from '@/app/actions';
import { correctionAction } from '@tappet/core/mileage-tracking';

const serviceRole = getServiceRoleClient as jest.Mock;
const sessionClient = createServerActionClient as jest.Mock;
const authorize = authorizeVehicleAccess as jest.Mock;
const project = projectNextService as jest.Mock;

let stored: { current_mileage: number | null } | null;
let updates: Array<Record<string, unknown>>;
let inserts: Array<Record<string, unknown>>;

function vehiclesTable() {
  return {
    from: jest.fn(() => {
      const chain: Record<string, unknown> = {
        select: jest.fn(() => chain),
        eq: jest.fn(() => chain),
        maybeSingle: jest.fn(async () => ({ data: stored, error: null })),
        update: jest.fn((values: Record<string, unknown>) => {
          updates.push(values);
          return { eq: jest.fn(async () => ({ error: null })) };
        }),
        insert: jest.fn((values: Record<string, unknown>) => {
          inserts.push(values);
          return {
            select: () => ({ single: async () => ({ data: null, error: { code: 'XX000', message: 'stop here' } }) }),
          };
        }),
      };
      return chain;
    }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  stored = { current_mileage: 45_000 };
  updates = [];
  inserts = [];
  authorize.mockResolvedValue({ ok: true, userId: 'u1' });
  serviceRole.mockImplementation(() => vehiclesTable());
  sessionClient.mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } });
});

describe('updateVehicleMileage — the phone’s rule (TL-26)', () => {
  it('refuses a ten-times typo as a jump, writes nothing, and offers the answer', async () => {
    const result = await updateVehicleMileage('v1', 450_000);
    expect(result.success).toBe(false);
    expect(result.reason).toBe('implausible-jump');
    expect(correctionAction(result.reason)).toBe('The reading is right');
    expect(updates).toEqual([]);
    expect(project).not.toHaveBeenCalled();
  });

  it('refuses a reading past the plausible range outright', async () => {
    const result = await updateVehicleMileage('v1', 3_000_000, { isCorrection: true });
    expect(result.reason).toBe('out-of-range');
    expect(updates).toEqual([]);
  });

  it('asks before going backwards, and takes the correction when it is answered', async () => {
    const refused = await updateVehicleMileage('v1', 4_500);
    expect(refused.reason).toBe('went-backwards');
    expect(updates).toEqual([]);

    const corrected = await updateVehicleMileage('v1', 4_500, { isCorrection: true });
    expect(corrected.success).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0].current_mileage).toBe(4_500);
  });

  it('re-projects the next service after a saved reading', async () => {
    const result = await updateVehicleMileage('v1', 48_000);
    expect(result.success).toBe(true);
    expect(updates[0].current_mileage).toBe(48_000);
    expect(project).toHaveBeenCalledWith('v1');
  });

  it('reads a stored 0 as no reading, so a high first reading is not a jump (TL-5)', async () => {
    stored = { current_mileage: 0 };
    const result = await updateVehicleMileage('v1', 170_000);
    expect(result.success).toBe(true);
  });
});

describe('createVehicle — the first-reading rule (TL-26)', () => {
  const car = {
    vin: '1HGCM56633A000000',
    year: 2003,
    make: 'Honda',
    model: 'Accord',
    trim: 'EX',
    color: 'Silver',
    engine_type: null,
    transmission_type: null,
    drivetrain: null,
    ownership_objective: 'keep',
    usage_profile: '1000 miles/month',
    avg_miles_per_month: 1000,
    performance_mindedness: 'stock' as const,
    driving_style: 'normal',
  };

  it('refuses an odometer past the plausible range before inserting', async () => {
    const result = await createVehicle({ ...car, current_mileage: 9_999_999 });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/out of range/);
    expect(inserts).toEqual([]);
  });

  it('anti-vacuous: a high first reading reaches the insert (no jump from nothing)', async () => {
    await createVehicle({ ...car, current_mileage: 170_000 });
    expect(inserts).toHaveLength(1);
    expect(inserts[0].current_mileage).toBe(170_000);
  });
});
