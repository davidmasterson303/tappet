/**
 * Adding a car from the phone.
 *
 * @jest-environment node
 *
 * `createVehicle` in `app/actions.ts` authenticates with
 * `createServerActionClient()` — cookies and nothing else — so a React Native
 * client could never call it. Until 8 Aug that was tolerable, because mobile
 * was a companion and enrollment happened on the web. It stopped being
 * tolerable the moment the product went mobile-first: **a person could not
 * create a car on the phone at all.**
 *
 * This is a static read of the route rather than an execution of it, for the
 * reason `auth-posture.test.ts` sets out — running it needs a live Supabase, and
 * the properties worth pinning are which helper authorizes, what is refused, and
 * what is never trusted from the caller. All three are on disk.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');

/**
 * Source with comments removed.
 *
 * `push-token-registration.test.ts` learned this three times: a docblock
 * explaining what a route does *not* do is good writing and a bad substring.
 * This route's own header names `createServerActionClient` to record that it
 * cannot use it.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

const route = code(readFileSync(join(ROOT, 'app', 'api', 'v1', 'vehicles', 'route.ts'), 'utf8'));
const post = route.slice(route.indexOf('export async function POST'));

describe('POST /api/v1/vehicles', () => {
  it('exists at all — the gap that blocked mobile-first', () => {
    expect(route).toMatch(/export async function POST/);
  });

  it('authorizes with requireCaller, so a bearer token works', () => {
    // The whole point. `createServerActionClient` reads next/headers cookies,
    // which a native client does not have.
    expect(post).toMatch(/requireCaller\(\)/);
    expect(post).not.toMatch(/createServerActionClient/);
  });

  it('never takes user_id from the request body', () => {
    /*
      Ownership comes from the verified session. A client-supplied `user_id`
      reads as authoritative even when the handler ignores it, which is one
      careless edit from being trusted — `createVehicle`'s own comment makes
      the point and it holds harder on a route.
    */
    expect(post).toMatch(/user_id:\s*caller\.userId/);
    expect(post).not.toMatch(/body\.user_?[iI]d/);
  });

  it('reuses the mileage rule rather than growing a second opinion — as a first reading', () => {
    /*
      `current: null`, never `0`. With `0` the jump check read any first
      reading past 100,000 as a typo and this route answered 422 — a 2003
      Accord at 170,000, refused on 19 Sep with "check the digits".
      `mileage-update.test.ts` pins the rule at a value that trips the jump.
    */
    expect(post).toMatch(/validateMileageUpdate\(\{\s*current:\s*null/);
    expect(post).not.toMatch(/validateMileageUpdate\(\{\s*current:\s*0/);
  });

  it('does not await the dossier research', () => {
    /*
      Measured at ~23s warm. Holding the response open for it puts a half-minute
      spinner between "add my car" and seeing anything. The row is seeded
      `pending` and `VehicleInsights` picks it up on first view.
    */
    expect(post).toMatch(/research_status:\s*'pending'/);
    expect(post).not.toMatch(/await\s+generateVehicleDossier/);
  });

  it('sets the one product branch that must exist at creation', () => {
    // Whether this owner ever sees modifications. `mild` means interested,
    // `stock` means not — the enum's own values, read by showsModifications.
    expect(post).toMatch(/performance_mindedness:.*'stock'.*:.*'mild'|wantsModifications/s);
  });

  it('returns 201 on success rather than 200', () => {
    expect(post).toMatch(/status:\s*201/);
  });

  describe('what it refuses', () => {
    it('a malformed year', () => {
      expect(post).toMatch(/Number\.isInteger\(year\)/);
      expect(post).toMatch(/year\s*<\s*1900/);
    });

    it('a missing make or model', () => {
      expect(post).toMatch(/!make\s*\|\|\s*!model/);
    });

    it('an implausible odometer reading, as 422 rather than 400', () => {
      // The request is well-formed and the caller authorized; what failed is a
      // rule about the value, and the message is written to be shown.
      expect(post).toMatch(/status:\s*422/);
    });
  });

  it('survives a knowledge-base insert failure without losing the car', () => {
    // The vehicle exists and is usable; the dossier is the thing that waits.
    expect(post).toMatch(/kbError/);
    expect(post).toMatch(/logger\.warn/);
  });

  describe('the VIN — the column that refused every car from 8 Aug to 19 Sep', () => {
    /*
      `vehicles.vin` was `text UNIQUE NOT NULL` from the first schema, and
      this insert never named it, so the database refused the row whole:
      every car added on the phone answered 500 "Could not save the vehicle"
      for six weeks, and the table had never held one. The route's docblock
      said "everything else has a sensible default"; the phone's said a car
      added here "carries no VIN in the database". Both were the schema
      stated from a file read — §2 — and the artefact (a PostgREST probe,
      23502) said otherwise. Every case here reads source, as the rest of
      this file does; the applied state of the migration is the probe.
    */
    const insert = post.slice(post.indexOf(".from('vehicles')"), post.indexOf(".select('id,year,make,model')"));

    it('names the column in the insert at all', () => {
      expect(insert).toMatch(/\bvin:/);
    });

    it('carries the VIN the phone decoded, normalised, and refuses a malformed one in the field\'s words', () => {
      // The same rule the field shows while it is typed, so the phone and
      // the route cannot disagree about what a VIN is.
      expect(post).toMatch(/normaliseVin\(body\.vin\)/);
      expect(post).toMatch(/const vinTrouble = vinProblem\(vin\)/);
      expect(post).toMatch(/error:\s*vinTrouble[\s\S]{0,80}status:\s*422/);
    });

    it('stores null when there is none — never the empty string', () => {
      // `''` is a value, and UNIQUE would let exactly one car in the whole
      // product have it. `null` is "not given", and NULLs are distinct.
      expect(insert).toMatch(/vin:\s*vin \|\| null/);
      expect(insert).not.toMatch(/vin:\s*''/);
      expect(insert).not.toMatch(/vin:\s*vin,/);
    });

    it('answers a taken VIN with 409 and a reason, not a 500', () => {
      expect(post).toMatch(/error\?\.code === '23505'[\s\S]{0,400}status:\s*409/);
      expect(post).toMatch(/already in a garage/);
    });

    it('the migration that lets the row exist is on disk, and the first schema shows why it is needed', () => {
      const schema = readFileSync(
        join(ROOT, 'supabase', 'migrations', '20260101215332_create_crewchief_schema.sql'),
        'utf8'
      );
      const migration = readFileSync(
        join(ROOT, 'supabase', 'migrations', '20260919160000_a_car_added_from_the_phone_may_have_no_vin.sql'),
        'utf8'
      );
      // Anti-vacuous: the constraint this undoes is really in the first file.
      expect(schema).toMatch(/vin text UNIQUE NOT NULL/);
      expect(migration).toMatch(/ALTER TABLE vehicles ALTER COLUMN vin DROP NOT NULL;/);
      // And UNIQUE is left alone — one real VIN is still one car.
      expect(migration).not.toMatch(/DROP CONSTRAINT/i);
    });

    it('can still detect the insert that shipped, so this is not vacuous', () => {
      const shipped = `
    .from('vehicles')
    .insert({
      year,
      make,
      model,
      trim: typeof body.trim === 'string' ? body.trim.trim() : '',
      current_mileage: mileage,
      performance_mindedness: body.wantsModifications === false ? 'stock' : 'mild',
      user_id: caller.userId,
    })
    .select('id,year,make,model')`;
      const old = shipped.slice(shipped.indexOf(".from('vehicles')"), shipped.indexOf(".select('id,year,make,model')"));
      expect(old).not.toMatch(/\bvin:/);
      expect(insert.length).toBeGreaterThan(50);
    });
  });

  describe('the Track A2a service baseline', () => {
    it('is built by core rather than assembled here', () => {
      // Which date "in the last 6 months" resolves to is a product rule with a
      // safety direction, and it belongs in one place that a test can drive
      // without a database. See onboarding-baseline.ts.
      expect(post).toMatch(/buildBaselineRow\(/);
      expect(post).toMatch(/isBaselineAge\(/);
    });

    it('narrows the age rather than trusting the body', () => {
      // A client-supplied string reaching `baselineDate` unchecked would put an
      // unrecognised value into a lookup that returns null for it — silent, and
      // indistinguishable from the owner choosing "not sure".
      expect(post).toMatch(/isBaselineAge\(body\.lastServiceAge\)/);
    });

    it('does not fail the request when the insert is rejected', () => {
      /*
        The important one, and it is not hypothetical: the migration adding
        `mileage_at_service` and the `'owner-onboarding'` source **is written
        but not yet applied**. Until it runs, this insert is rejected on a
        missing column.

        If that could fail the request, a pending migration would mean nobody
        can add a car — a total outage of the launch-blocking flow, caused by a
        DB change that has not happened yet. Same posture as the knowledge-base
        insert above: what the caller asked for was a vehicle.
      */
      const baselineBlock = post.slice(post.indexOf('buildBaselineRow'));

      expect(baselineBlock).toMatch(/baselineError/);
      expect(baselineBlock).toMatch(/logger\.warn/);
      // No early return and no non-2xx between the insert and the 201.
      expect(baselineBlock).not.toMatch(/status:\s*(4|5)\d\d/);
    });

    it('writes the baseline after the vehicle exists, not before', () => {
      // It carries `vehicle_id`. Ordering this ahead of the insert that creates
      // the row would make it fail on a foreign key every time — and, given the
      // rule above, fail silently.
      expect(post.indexOf('buildBaselineRow')).toBeGreaterThan(post.indexOf('.insert('));
    });
  });
});
