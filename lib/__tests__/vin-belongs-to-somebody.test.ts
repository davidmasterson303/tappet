/**
 * A VIN that is already registered belongs to somebody, and it matters who.
 *
 * @jest-environment node
 *
 * ── The dead end this is written against ────────────────────────────────────
 *
 * Found 22 Aug by entering a VIN another account already held. The screen said
 * **"This vehicle is already in your garage"**, waited two seconds, and then
 * **bounced to the garage with no message at all**.
 *
 * The lookup ran on the service-role client with no `user_id` filter, so it
 * searched every account — and `vehicles.vin` is `UNIQUE` across the table, so
 * the row it found was as likely to be a stranger's as the caller's. It then
 * returned that stranger's `vehicleId`, which the form navigates to.
 *
 * ⚠ **Authorization held.** `authorizeVehicleAccess` refused the dashboard,
 * which is why the user landed back at the garage and why nothing leaked. The
 * bounce was the last line of defence doing its job about a journey that
 * should never have started. Nothing here weakens that check; the fix is two
 * layers earlier, where the wrong vehicle was chosen.
 */

jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: jest.fn(),
  createServerActionClient: jest.fn(),
}));
jest.mock('@/lib/api-auth', () => ({
  requireSession: jest.fn(),
  requireCaller: jest.fn(),
  authorizeVehicleAccess: jest.fn(),
}));

import { getServiceRoleClient } from '@/lib/supabase';
import { requireSession } from '@/lib/api-auth';
import { decodeVIN } from '@/app/actions';

const serviceRole = getServiceRoleClient as jest.Mock;
const session = requireSession as jest.Mock;

const CALLER = 'user-caller';
const VIN = '1HGCM56633A000000';

/** Every `.eq()` pair seen, in order, across all queries of this client. */
type Filters = Array<[string, string]>;

/**
 * A client whose `vehicles` lookups answer from `rows`, matching on whatever
 * filters the query actually applied.
 *
 * That is the point: the assertion is about the **filter the code chose**, so
 * the stub must honour filters rather than return a fixed row.
 */
function clientWithVehicles(rows: Array<{ id: string; vin: string; user_id: string }>) {
  const seen: Filters[] = [];

  const from = jest.fn(() => {
    const filters: Filters = [];
    seen.push(filters);

    const chain: Record<string, unknown> = {
      select: jest.fn(() => chain),
      eq: jest.fn((column: string, value: string) => {
        filters.push([column, value]);
        return chain;
      }),
      maybeSingle: jest.fn(async () => {
        const match = rows.find((row) =>
          filters.every(([column, value]) => (row as Record<string, string>)[column] === value)
        );
        return { data: match ?? null, error: null };
      }),
    };

    return chain;
  });

  return { client: { from }, seen };
}

beforeEach(() => {
  jest.clearAllMocks();
  session.mockResolvedValue({ ok: true, userId: CALLER });
  global.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({
      Results: [{ ErrorCode: '0', ModelYear: '2003', Make: 'HONDA', Model: 'Accord', Trim: 'EX' }],
    }),
  })) as unknown as typeof fetch;
});

describe('a VIN held by another account', () => {
  /*
    ⚠ Audit 360, SEC-1 (1 Oct). Until then this block asserted the refusal
    "This VIN is already registered to another Tappet account" — at the
    decode step, before anything was saved. That sentence was a free oracle
    for whether a car is in Tappet and a dead end for a used car's buyer. A
    VIN is now unique per owner (`20261001120000`), so the decode answers a
    stranger's VIN exactly as it answers one nobody has. What the 22 Aug
    fix established still holds and is still asserted: no "in your garage"
    claim, no other account's vehicle id, and the only question asked is
    about the caller's own rows.
  */
  const strangersCar = { id: 'their-vehicle', vin: VIN, user_id: 'somebody-else' };

  it('decodes it, exactly as if nobody had it — the decode is not an oracle', async () => {
    serviceRole.mockReturnValue(clientWithVehicles([strangersCar]).client);

    const result = await decodeVIN(VIN);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.vehicle).toMatchObject({ make: 'HONDA', model: 'Accord', year: 2003 });
  });

  it('never hands back the other account’s vehicle id', async () => {
    serviceRole.mockReturnValue(clientWithVehicles([strangersCar]).client);

    const result = await decodeVIN(VIN);

    expect(result).not.toHaveProperty('vehicleId');
    expect(JSON.stringify(result)).not.toContain('their-vehicle');
  });

  it('asks only about the caller’s own rows — never "does anybody have this VIN"', async () => {
    const { client, seen } = clientWithVehicles([strangersCar]);
    serviceRole.mockReturnValue(client);

    await decodeVIN(VIN);

    // Anti-vacuous: the lookup ran at all.
    expect(seen.length).toBeGreaterThan(0);
    for (const filters of seen) {
      expect(filters).toContainEqual(['user_id', CALLER]);
    }
  });

  it('can still detect the unscoped lookup that shipped', () => {
    // The 1 Oct shape: a second query filtered on the VIN alone.
    const shipped: Filters[] = [[['vin', VIN], ['user_id', CALLER]], [['vin', VIN]]];
    expect(shipped.every((filters) => filters.some(([column]) => column === 'user_id'))).toBe(false);
  });
});

describe('a VIN the caller already owns', () => {
  it('still offers the vehicle to redirect to', async () => {
    /*
      ⚠ Anti-vacuous, and the behaviour worth keeping. "You already have this
      car, here it is" is a good outcome — the fix must not turn the caller's
      own vehicle into a refusal with nowhere to go.
    */
    serviceRole.mockReturnValue(
      clientWithVehicles([{ id: 'my-vehicle', vin: VIN, user_id: CALLER }]).client
    );

    const result = await decodeVIN(VIN);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/in your garage/i);
    expect(result.vehicleId).toBe('my-vehicle');
  });
});

describe('a VIN nobody has', () => {
  it('decodes it', async () => {
    // The ordinary path, and the check that neither branch above swallows it.
    serviceRole.mockReturnValue(clientWithVehicles([]).client);

    const result = await decodeVIN(VIN);

    expect(result.success).toBe(true);
    expect(result.vehicle).toMatchObject({ make: 'HONDA', model: 'Accord', year: 2003 });
    expect(global.fetch).toHaveBeenCalled();
  });
});
