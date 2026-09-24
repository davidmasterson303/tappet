import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@tappet/core/logger';
import { validateMileageUpdate } from '@tappet/core/mileage-tracking';
import { rotationPayloadProblems, type TireRotationRow } from '@tappet/core/tires';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { authorizeVehicleScopedRow } from '@/lib/api-auth';
import { tireTablesMissing } from '@/lib/tires-store';

/**
 * A rotation, logged against a set — and taken back.
 *
 * ── The record is the product ───────────────────────────────────────────────
 *
 * "Tappet knows what your tires need, **and proves it**" — the proof is this
 * table, with its provenance. Every row written here is `'typed'`: the owner
 * said so. The `'invoice'` value and `line_item_id` are for the vision path,
 * which already reads rotation lines off receipts and is not yet wired to
 * write them here; when it is, it writes its own rows with the document
 * behind them, and this route stays the owner's.
 *
 * ── The odometer only goes up, and it moves the car's reading ───────────────
 *
 * `rotationPayloadProblems` refuses a reading below the install odometer or
 * below a rotation already logged (the axis plots every tick by its
 * odometer, and a record out of order would draw a rotation before the set
 * went on). A reading *above* the car's current mileage becomes the car's
 * reading — the same write `wishlist/complete` makes for a service marked
 * done, through the same rule (`validateMileageUpdate`), refused silently
 * rather than failing a rotation that already happened.
 *
 * ── Deleted, not edited ─────────────────────────────────────────────────────
 *
 * There is no PATCH. A wrong rotation is deleted and re-entered: the two
 * facts on it are a date and a reading, and a row that could be nudged is
 * how an axis quietly stops agreeing with the receipts it was typed from.
 */

export const dynamic = 'force-dynamic';

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function POST(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(identifier, 'default');
  if (!rateLimit.allowed) {
    logger.warn('TIRE_ROTATIONS_API:RATE_LIMIT', 'Rate limit exceeded', { identifier });
    return rateLimitResponse(rateLimit);
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Send the rotation as JSON' }, { status: 400 });
    }

    const setId = typeof body.setId === 'string' ? body.setId : null;
    const access = await authorizeVehicleScopedRow('tire_sets', setId, { intent: 'write' });
    if (!access.ok) return access.response;

    const client = access.client;
    const vehicleId = access.vehicleId!;

    const [{ data: set, error: setError }, { data: logged, error: loggedError }] = await Promise.all([
      client.from('tire_sets').select('id, installed_on, install_odometer, retired_at').eq('id', setId!).maybeSingle(),
      client.from('tire_rotations').select('odometer').eq('set_id', setId!),
    ]);

    if (setError || loggedError || !set) {
      const failure = setError ?? loggedError;
      if (tireTablesMissing(failure)) {
        return NextResponse.json({ error: 'Tire records are not switched on yet.', code: 'tires-unavailable' }, { status: 503 });
      }
      logger.error('TIRE_ROTATIONS_API:READ', new Error(failure?.message ?? 'no set'), { setId });
      return NextResponse.json({ error: 'Could not read the set' }, { status: 500 });
    }

    if (set.retired_at) {
      // A retired set's record is closed. Logging against it would be
      // rewriting the history of tires no longer on the car.
      return NextResponse.json({ error: 'This set is no longer on the car' }, { status: 409 });
    }

    const problems = rotationPayloadProblems(body, {
      today: today(),
      set: { installedOn: set.installed_on, installOdometer: set.install_odometer },
      rotations: (logged ?? []) as Array<{ odometer: number }>,
    });
    if (problems.length > 0) {
      return NextResponse.json({ error: problems[0].message, problems }, { status: 400 });
    }

    const rotatedOn = (body.rotatedOn as string).trim();
    const odometer = Math.round(body.odometer as number);

    const { data: rotation, error } = await client
      .from('tire_rotations')
      .insert({ set_id: setId, vehicle_id: vehicleId, rotated_on: rotatedOn, odometer, provenance: 'typed' })
      .select('id, set_id, rotated_on, odometer, provenance, line_item_id')
      .single();

    if (error) {
      logger.error('TIRE_ROTATIONS_API:POST', new Error(error.message), { setId, code: error.code });
      return NextResponse.json({ error: 'Could not log the rotation' }, { status: 500 });
    }

    /*
      The car's reading moves forward with the record, never back. The rule is
      the mileage PATCH's own; a refusal is logged and the rotation stands.
    */
    const { data: car } = await client.from('vehicles').select('current_mileage').eq('id', vehicleId).maybeSingle();
    const current = typeof car?.current_mileage === 'number' ? car.current_mileage : null;
    if (current !== null && odometer > current) {
      const check = validateMileageUpdate({ current, next: odometer });
      if (check.ok) {
        const { error: odometerError } = await client
          .from('vehicles')
          .update({ current_mileage: odometer, last_mileage_update_date: new Date().toISOString() })
          .eq('id', vehicleId);
        if (odometerError) {
          logger.warn('TIRE_ROTATIONS_API:ODOMETER', 'Could not move the reading', { vehicleId, error: odometerError.message });
        }
      } else {
        logger.warn('TIRE_ROTATIONS_API:ODOMETER_REFUSED', check.message ?? 'refused', { vehicleId, odometer, current });
      }
    }

    return NextResponse.json({ rotation: rotation as TireRotationRow }, { status: 201 });
  } catch (error) {
    logger.error('TIRE_ROTATIONS_API:POST_EXCEPTION', error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const identifier = getClientIdentifier(request);
  const rateLimit = await checkRateLimit(identifier, 'default');
  if (!rateLimit.allowed) {
    logger.warn('TIRE_ROTATIONS_API:RATE_LIMIT', 'Rate limit exceeded', { identifier });
    return rateLimitResponse(rateLimit);
  }

  try {
    const rotationId = new URL(request.url).searchParams.get('rotationId');
    const access = await authorizeVehicleScopedRow('tire_rotations', rotationId, { intent: 'write' });
    if (!access.ok) return access.response;

    const { error, count } = await access.client
      .from('tire_rotations')
      .delete({ count: 'exact' })
      .eq('id', rotationId!);

    if (error) {
      logger.error('TIRE_ROTATIONS_API:DELETE', new Error(error.message), { rotationId });
      return NextResponse.json({ error: 'Could not remove the rotation' }, { status: 500 });
    }
    if (!count) {
      return NextResponse.json({ error: 'Rotation not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('TIRE_ROTATIONS_API:DELETE_EXCEPTION', error as Error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
