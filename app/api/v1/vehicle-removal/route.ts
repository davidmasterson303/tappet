import { type NextRequest } from 'next/server';
import type { ApiResponse } from '@tappet/core/types';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { inventoryVehicleRemoval, removeVehicle } from '@/lib/vehicle-deletion';

export const dynamic = 'force-dynamic';

/**
 * Remove a car from the phone — what would go, and then removing it.
 *
 * ── Why a route of its own, and a query string rather than a segment ────────
 *
 * No v1 route uses a path parameter (`/api/v1/vehicles`'s docblock carries
 * the argument), so this is `?vehicleId=` like `load-vehicle`. It is its
 * own route rather than a DELETE verb on `/api/v1/vehicles` because the
 * confirmation needs a read of its own — GET here is the inventory the
 * phone quotes before asking — and a GET on the vehicles route already
 * means the garage.
 *
 * ── The two verbs ───────────────────────────────────────────────────────────
 *
 *   GET     what removing this car takes with it, from the rows: recalls
 *           open and marked repaired, service records, receipt photographs
 *           (the bucket, listed), the score and the schedule, advisor
 *           threads, needs. A count that could not be read is `null`, and
 *           the phone draws no line for it.
 *   DELETE  `removeVehicle` — objects first, refused if any cannot be
 *           removed, then the row and everything that cascades. The same
 *           function the web's `deleteVehicle` runs.
 *
 * Both are vehicle-scoped with a write intent, which also refuses the demo:
 * reading what a demo car's removal would take is answering a question the
 * demo cannot act on.
 */
async function vehicleIdFrom(request: NextRequest): Promise<string | null> {
  const id = request.nextUrl.searchParams.get('vehicleId');
  return id && id.length > 0 ? id : null;
}

export async function GET(request: NextRequest): Promise<Response> {
  const rateLimit = await checkRateLimit(getClientIdentifier(request), 'default');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const vehicleId = await vehicleIdFrom(request);
  const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
  if (!access.ok) return access.response;

  const inventory = await inventoryVehicleRemoval(vehicleId as string);
  if (!inventory) {
    return Response.json({ success: false, error: 'Vehicle not found' } as ApiResponse, { status: 404 });
  }
  return Response.json({ success: true, inventory } as ApiResponse);
}

export async function DELETE(request: NextRequest): Promise<Response> {
  const rateLimit = await checkRateLimit(getClientIdentifier(request), 'default');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const vehicleId = await vehicleIdFrom(request);
  const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
  if (!access.ok) return access.response;

  const outcome = await removeVehicle(vehicleId as string);
  if (!outcome.ok) {
    const status = outcome.reason === 'missing' ? 404 : outcome.reason === 'storage' ? 409 : 500;
    return Response.json({ success: false, error: outcome.error } as ApiResponse, { status });
  }
  return Response.json({ success: true, removed: outcome.removed } as ApiResponse);
}
