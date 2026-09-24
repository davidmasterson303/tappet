import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@tappet/core/logger';
import {
  intervalSourceFor,
  scheduledRotationInterval,
  tireSetPayloadProblems,
  type IntervalSource,
  type TireSetPayload,
} from '@tappet/core/tires';
import type { SupabaseClient } from '@supabase/supabase-js';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { authorizeVehicleAccess, authorizeVehicleScopedRow } from '@/lib/api-auth';
import { TIRES_UNAVAILABLE, readTireRecords, tireTablesMissing } from '@/lib/tires-store';

/**
 * The tire set on a car — read it, put one on, change what was entered.
 *
 * v1.1 (20 Sep 2026). `packages/core/src/tires.ts` carries the feature's
 * argument and every derivation; this file is the IO around the set itself.
 * Rotations have their own route beside this one.
 *
 * ── Free, and why that is not re-litigated here ─────────────────────────────
 *
 * No `checkFeatureAccess`. It is a database write plus a notification, and
 * `paid-features.ts` says a paid feature that costs nothing to run would be a
 * price rise wearing a feature's clothes. `'tires'` is in `FREE_FEATURES`, so
 * every sentence that lists what is free carries it. The paid hook is the
 * advisor — "is this wear pattern normal?" — which is already gated.
 *
 * ── The interval is asked, never assumed ────────────────────────────────────
 *
 * Whatever arrives in `rotationIntervalMiles` is stored with
 * `interval_source = 'owner'`: it came from this request, which came from the
 * owner's own hand. Nothing here fills one in when the field is blank, and a
 * blank field stores `NULL` — the state core reads as "no obligation".
 *
 * ── Validation is core's, run twice ─────────────────────────────────────────
 *
 * The phone runs `tireSetProblems` on the draft before it sends; this route
 * runs `tireSetPayloadProblems` on what arrived. Same function underneath, so
 * a phone stricter than the server refuses valid entries and one looser sends
 * requests that always fail — neither can happen. A problem answers 400 with
 * the field and the sentence the phone would have shown, not a 500.
 *
 * ── ⚠ Until the migrations are applied ──────────────────────────────────────
 *
 * `tire_sets` does not exist on `web-live` until David runs
 * `20260920200000`/`20260920200100` in the SQL editor. Every handler answers
 * **503 `tires-unavailable`** in that state — named, so the phone can say so
 * and a log can be read — rather than a 500 that reads as a bug in the route,
 * or an empty success that invites an owner to enter a set nothing can store.
 */

export const dynamic = 'force-dynamic';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function unavailable() {
  return NextResponse.json(
    { error: 'Tire records are not switched on yet.', code: TIRES_UNAVAILABLE },
    { status: 503 }
  );
}

/**
 * The columns a set payload writes. `interval_source` follows the interval and
 * the server's own reading of the car's schedule — never the client's word
 * alone (21 Sep): a client may *say* `'vehicle'`, and the row carries it only
 * when the figure is the one the dossier's schedule holds for a rotation.
 */
function rowFrom(payload: TireSetPayload, vehicleInterval: number | null) {
  return {
    brand: payload.brand,
    line: payload.line,
    size_front: payload.sizeFront,
    size_rear: payload.sizeRear,
    installed_on: payload.installedOn,
    install_odometer: payload.installOdometer,
    purchase_place: payload.purchasePlace,
    rotation_interval_miles: payload.rotationIntervalMiles,
    interval_source: intervalSourceFor(payload.rotationIntervalMiles, payload.intervalSource, vehicleInterval),
    treadwear_miles_entered: payload.treadwearMilesEntered,
  };
}

/** The rotation interval the car's schedule carries, read for the source decision. Null when it has none, or cannot be read. */
async function vehicleIntervalFor(client: SupabaseClient, vehicleId: string): Promise<number | null> {
  const { data } = await client
    .from('vehicle_knowledge_base')
    .select('maintenance_schedule')
    .eq('vehicle_id', vehicleId)
    .maybeSingle();
  return scheduledRotationInterval(data?.maintenance_schedule);
}

/** The payload as `tireSetPayloadProblems` passed it — every field present, absences `null`. */
function payloadFrom(body: Record<string, unknown>): TireSetPayload {
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const opt = (v: unknown) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null);
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);
  const front = str(body.sizeFront).replace(/\s+/g, '').toUpperCase();
  const rear = opt(body.sizeRear);
  return {
    brand: str(body.brand),
    line: str(body.line),
    sizeFront: front,
    // A blank rear is the front's — per axle from the start, both columns written.
    sizeRear: rear ? rear.replace(/\s+/g, '').toUpperCase() : front,
    installedOn: opt(body.installedOn),
    installOdometer: num(body.installOdometer),
    purchasePlace: opt(body.purchasePlace),
    rotationIntervalMiles: num(body.rotationIntervalMiles),
    intervalSource: body.intervalSource === 'vehicle' ? ('vehicle' as IntervalSource) : undefined,
    treadwearMilesEntered: num(body.treadwearMilesEntered),
  };
}

export async function GET(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(identifier, 'default');
  if (!rateLimit.allowed) {
    logger.warn('TIRES_API:RATE_LIMIT', 'Rate limit exceeded', { identifier });
    return rateLimitResponse(rateLimit);
  }

  try {
    const vehicleId = new URL(request.url).searchParams.get('vehicleId');
    const access = await authorizeVehicleAccess(vehicleId, { intent: 'read' });
    if (!access.ok) return access.response;

    /*
      A demo vehicle answers an empty record rather than a query: demo cars
      carry no tire sets, the anon client has no grant on the table, and a
      `42501` here would read as a broken feature on the portfolio surface.
    */
    if (access.isDemo) return NextResponse.json({ set: null, rotations: [] });

    const records = await readTireRecords(access.client, vehicleId!);
    if (!records.ok) {
      return records.reason === TIRES_UNAVAILABLE
        ? unavailable()
        : NextResponse.json({ error: records.message }, { status: 500 });
    }

    return NextResponse.json({ set: records.set, rotations: records.rotations });
  } catch (error) {
    logger.error('TIRES_API:GET_EXCEPTION', error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(identifier, 'default');
  if (!rateLimit.allowed) {
    logger.warn('TIRES_API:RATE_LIMIT', 'Rate limit exceeded', { identifier });
    return rateLimitResponse(rateLimit);
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Send the set as JSON' }, { status: 400 });
    }

    const vehicleId = typeof body.vehicleId === 'string' ? body.vehicleId : null;
    const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
    if (!access.ok) return access.response;

    const problems = tireSetPayloadProblems(body, today());
    if (problems.length > 0) {
      return NextResponse.json({ error: problems[0].message, problems }, { status: 400 });
    }

    const client = access.client;

    /*
      One current set per vehicle. The partial unique index would refuse a
      second with `23505`; asking first turns that into a 409 that names the
      set, so the phone can offer to edit it rather than reporting a failure.
    */
    const { data: existing, error: existingError } = await client
      .from('tire_sets')
      .select('id')
      .eq('vehicle_id', vehicleId!)
      .is('retired_at', null)
      .maybeSingle();

    if (existingError) {
      if (tireTablesMissing(existingError)) return unavailable();
      logger.error('TIRES_API:POST_LOOKUP', new Error(existingError.message), { vehicleId });
      return NextResponse.json({ error: 'Could not save the set' }, { status: 500 });
    }
    if (existing) {
      return NextResponse.json({ error: 'This car already has a set on record', setId: existing.id }, { status: 409 });
    }

    const { data: set, error } = await client
      .from('tire_sets')
      .insert({
        vehicle_id: vehicleId,
        provenance: 'typed',
        ...rowFrom(payloadFrom(body), await vehicleIntervalFor(access.client, vehicleId!)),
      })
      .select()
      .single();

    if (error) {
      if (tireTablesMissing(error)) return unavailable();
      if (error.code === '23505') {
        return NextResponse.json({ error: 'This car already has a set on record' }, { status: 409 });
      }
      logger.error('TIRES_API:POST', new Error(error.message), { vehicleId, code: error.code });
      return NextResponse.json({ error: 'Could not save the set' }, { status: 500 });
    }

    return NextResponse.json({ set }, { status: 201 });
  } catch (error) {
    logger.error('TIRES_API:POST_EXCEPTION', error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Change what was entered about the set — the interval most often, from
 * `ENTER THE INTERVAL`.
 *
 * The body is a partial payload; it is merged over the stored row and the
 * **whole** result is judged, so a change to one field cannot leave the row in
 * a state entry would have refused. `interval_source` follows the merged
 * interval: a number is the owner's, a null clears both.
 */
export async function PATCH(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(identifier, 'default');
  if (!rateLimit.allowed) {
    logger.warn('TIRES_API:RATE_LIMIT', 'Rate limit exceeded', { identifier });
    return rateLimitResponse(rateLimit);
  }

  try {
    const setId = new URL(request.url).searchParams.get('setId');
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Send the changes as JSON' }, { status: 400 });
    }

    /*
      `authorizeVehicleScopedRow` reads the row before it knows who is asking,
      so a missing table answers its 500 rather than the named 503 above. That
      is acceptable here and not in GET: no screen reaches PATCH without having
      read the set first, and the read is where the named answer lives.
    */
    const access = await authorizeVehicleScopedRow('tire_sets', setId, { intent: 'write' });
    if (!access.ok) return access.response;

    const client = access.client;
    const { data: current, error: readError } = await client
      .from('tire_sets')
      .select('*')
      .eq('id', setId!)
      .maybeSingle();

    if (readError || !current) {
      if (tireTablesMissing(readError)) return unavailable();
      logger.error('TIRES_API:PATCH_READ', new Error(readError?.message ?? 'no row'), { setId });
      return NextResponse.json({ error: 'Could not read the set' }, { status: 500 });
    }

    /*
      Merge: a key present in the body replaces the stored value, `null`
      included, so a cleared field clears. A key absent from the body keeps
      what was stored. The merged object is then the payload entry would have
      produced, and is judged as one.
    */
    const stored: Record<string, unknown> = {
      brand: current.brand,
      line: current.line,
      sizeFront: current.size_front,
      sizeRear: current.size_rear,
      installedOn: current.installed_on,
      installOdometer: current.install_odometer,
      purchasePlace: current.purchase_place,
      rotationIntervalMiles: current.rotation_interval_miles,
      // The stored source rides along, so a change to another field does not turn a schedule's figure into the owner's.
      intervalSource: current.interval_source,
      treadwearMilesEntered: current.treadwear_miles_entered,
    };
    const merged: Record<string, unknown> = { ...stored };
    for (const key of Object.keys(stored)) {
      if (Object.prototype.hasOwnProperty.call(body, key)) merged[key] = body[key];
    }

    const problems = tireSetPayloadProblems(merged, today());
    if (problems.length > 0) {
      return NextResponse.json({ error: problems[0].message, problems }, { status: 400 });
    }

    const { data: set, error } = await client
      .from('tire_sets')
      .update({
        ...rowFrom(payloadFrom(merged), await vehicleIntervalFor(client, current.vehicle_id as string)),
        updated_at: new Date().toISOString(),
      })
      .eq('id', setId!)
      .select()
      .single();

    if (error) {
      if (tireTablesMissing(error)) return unavailable();
      logger.error('TIRES_API:PATCH', new Error(error.message), { setId, code: error.code });
      return NextResponse.json({ error: 'Could not save the change' }, { status: 500 });
    }

    return NextResponse.json({ set });
  } catch (error) {
    logger.error('TIRES_API:PATCH_EXCEPTION', error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
