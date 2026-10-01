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

  it('leaves a car with a VIN to its own UNIQUE', async () => {
    await POST(post({ ...CIVIC, vin: '1HGFA16589L000000' }));
    // No pre-insert lookup on a VIN'd car: the dedupe is for the car nothing else can catch.
    expect(rows).toHaveLength(1);
    expect(rows[0].vin).toBe('1HGFA16589L000000');
  });
});
