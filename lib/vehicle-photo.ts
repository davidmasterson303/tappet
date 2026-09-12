import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@tappet/core/logger';
import {
  STORED_URL_SCHEME,
  storagePathFromStoredUrl,
  vehicleIdFromStoragePath,
} from '@tappet/core/storage-paths';
import { isUnphotographedDemoVehicle } from '@tappet/core/demo';
import { platePublicUrl, type PlateStatus } from '@tappet/core/plates';

/** Matches the web's signed-URL lifetime (app/actions.ts). */
export const SIGNED_URL_TTL_SECONDS = 3600;

export interface VehiclePhotoColumns {
  image_url?: string | null;
  custom_image_url?: string | null;
  /** The generation plate the car stands on with neither of the above (11 Sep). */
  plate_key?: string | null;
}

export const VEHICLE_PHOTO_BUCKET = 'vehicle-documents';

/**
 * Turn a vehicle's stored image columns into one renderable URL.
 *
 * `custom_image_url` holds `placeholder://{vehicleId}/{kind}/{file}` — a
 * storage path in a private bucket, not a URL. The web client exchanges it for
 * a signed URL per read (`hooks/useSignedUrl.ts`). An API client handed the raw
 * column would have nothing it could render and no obvious way to find out why,
 * so the exchange happens server-side and the wire format carries a URL or
 * null — never a scheme the caller has to know about.
 *
 * Precedence matches `useVehicleImage` deliberately: the owner's photo wins
 * outright once one exists, rather than falling back to the stock image while
 * it resolves. Web and mobile disagreeing about which photo a car has would be
 * the same class of bug this codebase keeps finding — a second implementation
 * of a rule that already had one.
 *
 * Never throws and never returns a `placeholder://` value. Every failure path
 * degrades to the stock photo or to null, because the caller renders a photo
 * or it doesn't; a broken URL is worse than no URL.
 */
export async function resolveVehiclePhoto(
  vehicleId: string,
  vehicle: VehiclePhotoColumns,
  client: SupabaseClient
): Promise<string | null> {
  const plan = planVehiclePhoto(vehicleId, vehicle);

  if (plan.kind === 'resolved') return plan.url;
  if (plan.kind === 'plate') {
    const plates = await readyPlateUrls([plan.key], client);
    return plates.get(plan.key) ?? plan.fallback;
  }

  try {
    const { data, error } = await client.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .createSignedUrl(plan.path, SIGNED_URL_TTL_SECONDS);

    if (error || !data) {
      logger.warn('VEHICLE_PHOTO', 'Could not sign stored photo', { vehicleId });
      return plan.fallback;
    }

    return data.signedUrl;
  } catch (error) {
    logger.warn('VEHICLE_PHOTO', 'Signing threw', { vehicleId, error });
    return plan.fallback;
  }
}

/**
 * The same rule, for a list.
 *
 * A garage is many vehicles and each stored photo needs its own signed URL.
 * Calling `resolveVehiclePhoto` in a loop costs one storage round trip per car,
 * which on a phone connection is the difference between a garage that loads and
 * one that appears broken. `createSignedUrls` takes the whole list at once.
 *
 * Deliberately *not* a second implementation of the rule: both functions decide
 * what to do via `planVehiclePhoto` and differ only in how they sign. The rule
 * about which photo a vehicle has is the thing that must never fork.
 *
 * Returns a map keyed by vehicle id. Every input id is present in the output,
 * with null where there is nothing renderable.
 */
export async function resolveVehiclePhotos(
  vehicles: Array<{ id: string } & VehiclePhotoColumns>,
  client: SupabaseClient
): Promise<Map<string, string | null>> {
  const resolved = new Map<string, string | null>();
  const toSign: { id: string; path: string; fallback: string | null }[] = [];
  const onPlates: { id: string; key: string; fallback: string | null }[] = [];

  for (const vehicle of vehicles) {
    const plan = planVehiclePhoto(vehicle.id, vehicle);
    if (plan.kind === 'resolved') resolved.set(vehicle.id, plan.url);
    else if (plan.kind === 'plate') onPlates.push({ id: vehicle.id, key: plan.key, fallback: plan.fallback });
    else toSign.push({ id: vehicle.id, path: plan.path, fallback: plan.fallback });
  }

  // One round trip for every car on a plate, however many share a key.
  if (onPlates.length > 0) {
    const plates = await readyPlateUrls(onPlates.map((entry) => entry.key), client);
    for (const entry of onPlates) resolved.set(entry.id, plates.get(entry.key) ?? entry.fallback);
  }

  if (toSign.length === 0) return resolved;

  try {
    const { data, error } = await client.storage
      .from(VEHICLE_PHOTO_BUCKET)
      .createSignedUrls(
        toSign.map((entry) => entry.path),
        SIGNED_URL_TTL_SECONDS
      );

    if (error || !data) {
      logger.warn('VEHICLE_PHOTO', 'Could not batch-sign stored photos', {
        count: toSign.length,
      });
      for (const entry of toSign) resolved.set(entry.id, entry.fallback);
      return resolved;
    }

    /*
      Positional, because that is the correspondence the API guarantees: results
      come back in request order. Matching on the returned `path` instead would
      break on two vehicles pointing at the same object, which is rare but is
      exactly the case a lookup-by-key would silently collapse.
    */
    toSign.forEach((entry, index) => {
      const signed = data[index];
      resolved.set(entry.id, signed?.signedUrl && !signed.error ? signed.signedUrl : entry.fallback);
    });

    return resolved;
  } catch (error) {
    logger.warn('VEHICLE_PHOTO', 'Batch signing threw', { error });
    for (const entry of toSign) resolved.set(entry.id, entry.fallback);
    return resolved;
  }
}

type PhotoPlan =
  | { kind: 'resolved'; url: string | null }
  | { kind: 'sign'; path: string; fallback: string | null }
  | { kind: 'plate'; key: string; fallback: string | null };

/**
 * The public hero URL of every `ready` plate among `keys`, in one query.
 *
 * `vehicle_plates` is readable by every role, so whichever client the caller
 * holds can ask. A plate that is still drawing, or failed, is simply absent
 * from the map and the car keeps its fallback — the house plate on the phone,
 * exactly as the web's `useVehicleImage` resolves it. Never throws.
 */
async function readyPlateUrls(keys: string[], client: SupabaseClient): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const unique = Array.from(new Set(keys));
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (unique.length === 0 || !base) return urls;
  try {
    const { data, error } = await client
      .from('vehicle_plates')
      .select('key,status,hero_path')
      .in('key', unique)
      .eq('status', 'ready');
    if (error) {
      // The table arrives with a migration; before it, every car keeps its fallback.
      logger.warn('VEHICLE_PHOTO', 'Could not read plates', { error: error.message });
      return urls;
    }
    for (const row of (data ?? []) as Array<{ key: string; hero_path: string | null }>) {
      if (row.hero_path) urls.set(row.key, platePublicUrl(base, row.hero_path));
    }
  } catch (error) {
    logger.warn('VEHICLE_PHOTO', 'Plate read threw', { error });
  }
  return urls;
}

/**
 * Decide what a vehicle's photo should be, without doing any I/O.
 *
 * Pure, so the rule can be tested directly instead of through a storage mock —
 * and so the single and batch resolvers above cannot drift apart.
 */
function planVehiclePhoto(vehicleId: string, vehicle: VehiclePhotoColumns): PhotoPlan {
  // One demo car is unphotographed on purpose and still carries a seeded
  // image_url; honoured here so every surface answers the same way.
  if (isUnphotographedDemoVehicle(vehicleId)) return { kind: 'resolved', url: null };

  const storedPath = storagePathFromStoredUrl(vehicle.custom_image_url);

  if (!storedPath) {
    /*
      Not a resolvable stored path — but "not resolvable" and "not ours" are
      different, and conflating them is how the scheme leaks. A malformed
      value that still carries the prefix (`placeholder://` with an empty
      path, which storagePathFromStoredUrl reports as null) must not be passed
      through as though it were a renderable URL. Caught by the contract test
      rather than by reasoning, which is the point of having one.
    */
    const isMalformedStored = vehicle.custom_image_url?.startsWith(STORED_URL_SCHEME);
    const passthrough = isMalformedStored ? null : vehicle.custom_image_url;
    const url = passthrough || vehicle.image_url || null;

    /*
      The generation plate ranks last (11 Sep), after the owner's photograph
      and the stock image, and is the same precedence `useVehicleImage` keeps
      on the web. The plan names the key; the resolvers look it up, because
      whether it is ready is a database fact and this function does no I/O.
    */
    if (!url && vehicle.plate_key) return { kind: 'plate', key: vehicle.plate_key, fallback: null };

    return { kind: 'resolved', url };
  }

  /*
    Ownership was proven for `vehicleId`, not for whatever this column happens
    to point at. A signed URL bypasses RLS for its lifetime, so a row whose
    custom_image_url referenced another vehicle's object would otherwise get
    that object signed under this vehicle's authorization. Cheap to check, and
    it is the only thing standing between a column value and a credential.
  */
  if (vehicleIdFromStoragePath(storedPath) !== vehicleId) {
    logger.warn('VEHICLE_PHOTO', 'Stored photo path is not scoped to this vehicle', {
      vehicleId,
    });
    return { kind: 'resolved', url: vehicle.image_url || null };
  }

  return { kind: 'sign', path: storedPath, fallback: vehicle.image_url || null };
}

/**
 * Remove the owner's photograph — one implementation for both clients.
 *
 * ── ⚠ Why this is here (11 Sep) ─────────────────────────────────────────────
 *
 * David, on the phone: *"i can't delete the image i uploaded on the app, so i
 * can't revert to seeing the new default images for my car."* The web has had
 * `removeVehiclePhoto` since the photo dialog gained its Remove button; the
 * phone had no way to remove at all, and its API had no route for one. The
 * body of the web action lives here so `DELETE /api/v1/upload-photo` and the
 * action do exactly the same three things and cannot drift: delete the
 * storage object, then null the three columns that describe it.
 *
 * ⚠ Order matters and is kept: the object first, the row second. If the row
 * were cleared first and the delete failed, the object would be orphaned with
 * nothing pointing at it; this way a failed delete leaves the row intact and
 * the photo still shows, which is the honest state. A storage delete that
 * fails is logged and not fatal — the columns are what every surface reads.
 *
 * The caller authorises. This trusts the client it is handed, which is the
 * vehicle-scoped client `authorizeVehicleAccess` returns.
 */
export async function clearVehiclePhoto(
  client: SupabaseClient,
  vehicleId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const { data: vehicle, error: vehicleError } = await client
    .from('vehicles')
    .select('custom_image_storage_path')
    .eq('id', vehicleId)
    .maybeSingle();
  if (vehicleError) {
    logger.error('PHOTO:REMOVE_FETCH', new Error(vehicleError.message), { vehicleId });
    return { success: false, error: 'Failed to fetch vehicle' };
  }
  const path = (vehicle as { custom_image_storage_path?: string | null } | null)?.custom_image_storage_path;
  if (path) {
    const { error: deleteError } = await client.storage.from(VEHICLE_PHOTO_BUCKET).remove([path]);
    if (deleteError) {
      logger.warn('PHOTO:REMOVE_OBJECT', 'Failed to delete storage file', { vehicleId, error: deleteError.message });
    }
  }
  const { error: updateError } = await client
    .from('vehicles')
    .update({ custom_image_url: null, custom_image_storage_path: null, custom_image_uploaded_at: null })
    .eq('id', vehicleId);
  if (updateError) {
    logger.error('PHOTO:REMOVE_UPDATE', new Error(updateError.message), { vehicleId });
    return { success: false, error: 'Failed to remove photo' };
  }
  return { success: true };
}

/**
 * The library status of each car's plate, for the ones with no photograph.
 *
 * The phone's empty plate wants to say "Drawing this car's plate" the way the
 * web card does, and the status is a database fact. One query for the whole
 * garage, keyed by plate key; a car with a photograph, no key, or a key the
 * table does not know gets `null`. Never throws — before the migration the
 * table is absent and every car reads `null`, which is "nothing to say".
 */
export async function platePresence(
  vehicles: Array<{ id: string; photo_url: string | null; plate_key?: string | null }>,
  client: SupabaseClient,
): Promise<Map<string, PlateStatus | null>> {
  const statuses = new Map<string, PlateStatus | null>();
  const keys = Array.from(
    new Set(vehicles.filter((v) => !v.photo_url && v.plate_key).map((v) => v.plate_key as string)),
  );
  const byKey = new Map<string, PlateStatus>();
  if (keys.length > 0) {
    try {
      const { data, error } = await client.from('vehicle_plates').select('key,status').in('key', keys);
      if (!error) {
        for (const row of (data ?? []) as Array<{ key: string; status: PlateStatus }>) byKey.set(row.key, row.status);
      }
    } catch (error) {
      logger.warn('VEHICLE_PHOTO', 'Plate status read threw', { error });
    }
  }
  for (const v of vehicles) {
    statuses.set(v.id, !v.photo_url && v.plate_key ? byKey.get(v.plate_key) ?? null : null);
  }
  return statuses;
}
