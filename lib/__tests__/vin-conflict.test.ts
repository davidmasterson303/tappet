/**
 * A save refused on the VIN's key says whose car it is only to its owner.
 *
 * @jest-environment node
 *
 * Audit 360, SEC-1 (1 Oct). `vehicles_vin_key` made a VIN unique across
 * every account (confirmed on production by a dry insert), and the phone's
 * route answered every `23505` with "A car with that VIN is already in a
 * garage." — an oracle, and a dead end for a used car's buyer.
 * `20261001120000` moves the key to `(user_id, vin)`; `explainVinConflict`
 * is right on both sides of it.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('@tappet/core/logger', () => ({ logger: { warn: jest.fn(), info: jest.fn(), error: jest.fn() } }));

import { logger } from '@tappet/core/logger';
import { explainVinConflict, VIN_ALREADY_YOURS, VIN_HELD_ELSEWHERE } from '../vin-conflict';

const ROOT = join(__dirname, '..', '..');
const read = (...parts: string[]) => readFileSync(join(ROOT, ...parts), 'utf8');

const VIN = '1HGCM56633A000000';

function clientWithVehicles(rows: Array<{ id: string; vin: string; user_id: string }>) {
  const seen: Array<Array<[string, string]>> = [];
  const from = jest.fn(() => {
    const filters: Array<[string, string]> = [];
    seen.push(filters);
    const chain: Record<string, unknown> = {
      select: jest.fn(() => chain),
      eq: jest.fn((column: string, value: string) => {
        filters.push([column, value]);
        return chain;
      }),
      maybeSingle: jest.fn(async () => ({
        data: rows.find((row) => filters.every(([c, v]) => (row as Record<string, string>)[c] === v)) ?? null,
        error: null,
      })),
    };
    return chain;
  });
  return { client: { from } as never, seen };
}

describe('explainVinConflict', () => {
  it('the caller’s own car: already in your garage, with the id to go to', async () => {
    const { client } = clientWithVehicles([{ id: 'mine', vin: VIN, user_id: 'me' }]);
    await expect(explainVinConflict(client, 'me', VIN)).resolves.toEqual({
      error: VIN_ALREADY_YOURS,
      vehicleId: 'mine',
    });
  });

  it('a stranger’s car (only before the migration): no id, no owner, and a log line naming the migration', async () => {
    const { client, seen } = clientWithVehicles([{ id: 'theirs', vin: VIN, user_id: 'them' }]);
    const answer = await explainVinConflict(client, 'me', VIN);

    expect(answer).toEqual({ error: VIN_HELD_ELSEWHERE });
    expect(JSON.stringify(answer)).not.toMatch(/theirs|them/);
    expect(logger.warn).toHaveBeenCalledWith(
      'VIN:GLOBAL_KEY_STILL_APPLIED',
      expect.stringContaining('20261001120000'),
      expect.anything()
    );
    // The one question asked is about the caller's rows.
    expect(seen).toHaveLength(1);
    expect(seen[0]).toContainEqual(['user_id', 'me']);
  });
});

describe('both save paths use it on 23505', () => {
  const route = read('app', 'api', 'v1', 'vehicles', 'route.ts');
  const actions = read('app', 'actions.ts');

  it('the phone’s route', () => {
    expect(route).toMatch(/error\?\.code === '23505'[\s\S]{0,900}explainVinConflict\(client, caller\.userId, vin\)[\s\S]{0,200}status:\s*409/);
    expect(route).not.toMatch(/already in a garage/);
  });

  it('the web’s createVehicle, and the decode step no longer asks about other accounts', () => {
    expect(actions).toMatch(/vehicleError\?\.code === '23505'[\s\S]{0,300}explainVinConflict\(client, user\.id, vehicleData\.vin\)/);
    expect(actions).not.toMatch(/registeredElsewhere/);
  });

  it('can still detect the route that shipped, so this is not vacuous', () => {
    const shipped = `if (error?.code === '23505') {
    return Response.json(
      { success: false, error: 'A car with that VIN is already in a garage.' } as ApiResponse,
      { status: 409 }
    );
  }`;
    expect(shipped).not.toMatch(/explainVinConflict/);
    expect(shipped).toMatch(/already in a garage/);
  });
});

describe('the migration', () => {
  const sql = read('supabase', 'migrations', '20261001120000_a_vin_is_unique_within_a_garage.sql');
  const body = sql.replace(/\/\*[\s\S]*?\*\//g, '');

  it('drops the table-wide key and keys the VIN per owner, idempotently', () => {
    expect(body).toMatch(/ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_vin_key;/);
    expect(body).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS vehicles_user_id_vin_key ON vehicles \(user_id, vin\);/);
  });

  it('the constraint it drops is the one the first schema created', () => {
    // Anti-vacuous: Postgres names `vin text UNIQUE` on `vehicles` as `vehicles_vin_key`.
    expect(read('supabase', 'migrations', '20260101215332_create_crewchief_schema.sql')).toMatch(/vin text UNIQUE NOT NULL/);
  });
});

describe('the held-elsewhere sentence promises only a reply (COPY-16)', () => {
  const promisesWhatExists = (text: string) => !/\bvehicle\b/i.test(text) && !/transfer/i.test(text) && /get back to you/.test(text);

  it('says car, names the address, and promises no transfer', () => {
    expect(promisesWhatExists(VIN_HELD_ELSEWHERE)).toBe(true);
    expect(VIN_HELD_ELSEWHERE).toMatch(/@/);
  });

  it('can still detect the sentence that shipped (anti-vacuous)', () => {
    const shipped =
      'This VIN is already registered to another Tappet account. If you have just bought this vehicle, contact support@southmoordigital.com and we will transfer it.';
    expect(promisesWhatExists(shipped)).toBe(false);
  });
});
