/**
 * Audit 360, TL-13 (1 Oct) — a described car's add, sent again after the
 * phone stopped waiting, answers with the car it made rather than making a
 * second one.
 *
 * @jest-environment node
 *
 * The route is executed over an in-memory `vehicles` table whose stub
 * honours the filters the code chose, so the assertion is about the query,
 * not about a fixed row.
 */

jest.mock('@/lib/supabase', () => ({ getServiceRoleClient: jest.fn(), createServerActionClient: jest.fn() }));
jest.mock('@/lib/api-auth', () => ({ requireCaller: jest.fn(), authorizeVehicleAccess: jest.fn() }));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  rateLimitResponse: jest.fn(),
  getClientIdentifier: jest.fn(() => '203.0.113.7'),
}));
jest.mock('@/lib/plates', () => ({
  ensurePlate: jest.fn().mockResolvedValue({ key: null }),
  attachPlateToVehicle: jest.fn(),
}));

import { NextRequest } from 'next/server';

import { POST } from '@/app/api/v1/vehicles/route';
import { getServiceRoleClient } from '@/lib/supabase';
import { requireCaller } from '@/lib/api-auth';

type Row = Record<string, unknown>;

function table(rows: Row[]) {
  let n = 0;
  const from = jest.fn((name: string) => {
    if (name !== 'vehicles') return { insert: jest.fn(async () => ({ error: null })) };

    const filters: Array<(row: Row) => boolean> = [];
    const chain: Record<string, unknown> = {
      select: jest.fn(() => chain),
      eq: jest.fn((column: string, value: unknown) => (filters.push((r) => r[column] === value), chain)),
      is: jest.fn((column: string, value: unknown) => (filters.push((r) => (r[column] ?? null) === value), chain)),
      gte: jest.fn((column: string, value: string) => (filters.push((r) => String(r[column]) >= value), chain)),
      order: jest.fn(() => chain),
      limit: jest.fn(() => chain),
      maybeSingle: jest.fn(async () => ({ data: rows.find((r) => filters.every((f) => f(r))) ?? null, error: null })),
      insert: jest.fn((values: Row) => {
        /*
          The VIN's UNIQUE, as 20261001120000 makes it — within a garage.
          (Before that migration it is table-wide; either way the caller's
          own VIN is a 23505, which is the case TL-17 is about.)
        */
        if (values.vin && rows.some((r) => r.vin === values.vin && r.user_id === values.user_id)) {
          const refused: Record<string, unknown> = {
            select: jest.fn(() => refused),
            single: jest.fn(async () => ({ data: null, error: { code: '23505', message: 'duplicate key' } })),
          };
          return refused;
        }
        const row: Row = { id: `car-${++n}`, created_at: new Date().toISOString(), ...values };
        rows.push(row);
        const inserted: Record<string, unknown> = {
          select: jest.fn(() => inserted),
          single: jest.fn(async () => ({
            data: { id: row.id, year: row.year, make: row.make, model: row.model },
            error: null,
          })),
        };
        return inserted;
      }),
    };
    return chain;
  });
  return { from };
}

function post(body: Row): NextRequest {
  return new NextRequest('https://tappet.test/api/v1/vehicles', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const CIVIC = { year: 2009, make: 'Honda', model: 'Civic', trim: 'LX', currentMileage: 142_000, wantsModifications: true };

let rows: Row[];
beforeEach(() => {
  jest.clearAllMocks();
  rows = [];
  (getServiceRoleClient as jest.Mock).mockReturnValue(table(rows));
  (requireCaller as jest.Mock).mockResolvedValue({ ok: true, userId: 'owner-1' });
});

describe('POST /api/v1/vehicles — a resent add (TL-13)', () => {
  it('answers the second CONTINUE with the car the first one made', async () => {
    const first = await POST(post(CIVIC));
    const second = await POST(post(CIVIC));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((await second.json()).vehicle.id).toBe((await first.json()).vehicle.id);
    expect(rows.filter((r) => r.make === 'Honda')).toHaveLength(1);
  });

  it('still adds a different car, and the same car at another reading (anti-vacuous)', async () => {
    await POST(post(CIVIC));
    await POST(post({ ...CIVIC, model: 'Accord' }));
    await POST(post({ ...CIVIC, currentMileage: 90_000 }));
    expect(rows).toHaveLength(3);
  });

  it('does not answer with another owner’s car, nor with one added long ago', async () => {
    rows.push({ id: 'theirs', user_id: 'owner-2', vin: null, year: 2009, make: 'Honda', model: 'Civic', trim: 'LX', current_mileage: 142_000, created_at: new Date().toISOString() });
    rows.push({ id: 'old', user_id: 'owner-1', vin: null, year: 2009, make: 'Honda', model: 'Civic', trim: 'LX', current_mileage: 142_000, created_at: new Date(Date.now() - 3_600_000).toISOString() });

    const response = await POST(post(CIVIC));

    expect(response.status).toBe(201);
    expect(rows).toHaveLength(3);
  });

  it('does not answer a described car with a scanned one', async () => {
    await POST(post({ ...CIVIC, vin: '1HGFA16589L000000' }));
    await POST(post(CIVIC));
    expect(rows).toHaveLength(2);
    expect(rows[0].vin).toBe('1HGFA16589L000000');
  });
});

/*
  TL-17 (round 3) · the scanned car. Its VIN's UNIQUE caught the second row,
  and answered the retry 409 "That car is already in your garage." on a form
  that still asked for the odometer — the App Review path, since a reviewer
  scans. A VIN'd add the caller made inside the window is now the answer, as
  a described car's is; an older one is still the honest 409.
*/
describe('POST /api/v1/vehicles — a resent scanned add (TL-17)', () => {
  const VIN = '1HGFA16589L000000';

  it('answers the second CONTINUE with the car the first one made — build 2 and build 3 alike', async () => {
    const first = await POST(post({ ...CIVIC, vin: VIN }));
    const second = await POST(post({ ...CIVIC, vin: VIN.toLowerCase() }));

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect((await second.json()).vehicle.id).toBe((await first.json()).vehicle.id);
    expect(rows).toHaveLength(1);
  });

  it('still refuses, with the car to go to, a VIN added long ago (the legitimate 409)', async () => {
    rows.push({ id: 'old', user_id: 'owner-1', vin: VIN, year: 2009, make: 'Honda', model: 'Civic', trim: 'LX', current_mileage: 120_000, created_at: new Date(Date.now() - 3_600_000).toISOString() });

    const response = await POST(post({ ...CIVIC, vin: VIN }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ success: false, error: 'That car is already in your garage.', vehicleId: 'old' });
    expect(rows).toHaveLength(1);
  });

  it('never answers with another owner’s car with the same VIN', async () => {
    rows.push({ id: 'theirs', user_id: 'owner-2', vin: VIN, year: 2009, make: 'Honda', model: 'Civic', trim: 'LX', current_mileage: 142_000, created_at: new Date().toISOString() });

    const response = await POST(post({ ...CIVIC, vin: VIN }));

    expect(response.status).toBe(201);
    expect((await response.json()).vehicle.id).not.toBe('theirs');
    expect(rows).toHaveLength(2);
  });
});

/*
  TL-20 (round 3) · a scanned car's decoded trim. vPIC's `Trim` is unbounded,
  build-2 phones send it as decoded, and the answers screen has no trim field
  — a 422 about trim there had nothing to edit. The route clips it.
*/
describe('POST /api/v1/vehicles — a long decoded trim (TL-20)', () => {
  const LONG = 'Sport Utility 4D Limited Platinum Reserve Edition w/ Advanced Package';

  it('adds the car with the trim clipped to fifty, rather than refusing it', async () => {
    const response = await POST(post({ ...CIVIC, vin: '1FM5K8GC0MGA00000', trim: LONG }));

    expect(response.status).toBe(201);
    expect(rows).toHaveLength(1);
    expect(String(rows[0].trim).length).toBeLessThanOrEqual(50);
    expect(LONG.startsWith(String(rows[0].trim))).toBe(true);
  });

  it('still refuses an oversized make or model — those have fields (anti-vacuous)', async () => {
    const response = await POST(post({ ...CIVIC, model: 'M'.repeat(51) }));
    expect(response.status).toBe(422);
    expect(rows).toHaveLength(0);
  });
});
