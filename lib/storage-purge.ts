import { getServiceRoleClient } from '@/lib/supabase';
import { vehicleStoragePrefixes } from '@tappet/core/storage-paths';

/**
 * The storage purge — every object a vehicle owns, listed and removed.
 *
 * ── One purge, two deletions (20 Sep) ───────────────────────────────────────
 *
 * This lived inside `lib/account-data.ts` as a private helper of account
 * deletion, which is why account deletion has always removed the receipt
 * photographs and vehicle deletion never has. `deleteVehicle` in
 * `app/actions.ts` deleted the row and trusted the cascade — "Cascades
 * through every child table", its comment said, and it does; a cascade
 * reaches rows, not a bucket. Proven 20 Sep with an object at
 * `80de5647-…/invoices/probe-153411-receipt.jpg` that outlived its row.
 * Account deletion, run through the real function on a throwaway user the
 * same afternoon, removed its object (`storageObjects: 1`). Two deletion
 * implementations had drifted exactly the way two of anything drift here:
 * silently, because nothing fails when an object is left behind.
 *
 * So the purge is one module, and `lib/vehicle-deletion.ts` — which the web
 * action, the phone route and account deletion all go through for a
 * vehicle's objects — is the only caller besides account deletion itself.
 * The bucket held only the M235i's folder on 20 Sep: nothing had leaked
 * historically, and the fix is so nothing can.
 */
export const DOCUMENTS_BUCKET = 'vehicle-documents';

type ServiceClient = ReturnType<typeof getServiceRoleClient>;

/**
 * Prefixes under which a vehicle's files can live.
 *
 * The prefixes come from `lib/storage-paths.ts`, which is the module that
 * writes them. This file used to carry its own identical copy — two
 * definitions of where a user's data lives, which is the arrangement that
 * makes a deletion sweep quietly stop matching the uploader.
 */

/**
 * List every object under a prefix, descending into subfolders.
 *
 * Supabase's list() returns one level at a time, and consultant documents sit
 * two levels deep (`consultant-docs/{vehicleId}/{sessionId}/{file}`). A
 * single-level list silently returns the session folders as if they were
 * files, so nothing gets removed and nothing reports an error.
 */
export async function listObjectsRecursive(
  client: ServiceClient,
  prefix: string,
  depth = 0
): Promise<{ paths: string[]; failures: string[] }> {
  // Guard against a pathological tree; real paths are at most 3 deep.
  if (depth > 4) return { paths: [], failures: [] };

  const { data: entries, error } = await client.storage
    .from(DOCUMENTS_BUCKET)
    .list(prefix, { limit: 1000 });

  if (error) return { paths: [], failures: [`${prefix}: ${error.message}`] };
  if (!entries || entries.length === 0) return { paths: [], failures: [] };

  const paths: string[] = [];
  const failures: string[] = [];

  for (const entry of entries) {
    const full = `${prefix}/${entry.name}`;
    // Supabase marks folders by returning a null id.
    if (entry.id === null) {
      const nested = await listObjectsRecursive(client, full, depth + 1);
      paths.push(...nested.paths);
      failures.push(...nested.failures);
    } else {
      paths.push(full);
    }
  }

  return { paths, failures };
}

/**
 * Remove every storage object belonging to a set of vehicles.
 *
 * Was previously a single-level list of `{vehicleId}/` only, which missed
 * vehicle photos and consultant documents entirely — they survived account
 * deletion as orphaned blobs holding exactly the personal data the user asked
 * to have removed. The unit tests did not catch it because they mocked
 * storage with one flat convention.
 */
export async function purgeVehicleStorage(
  client: ServiceClient,
  vehicleIds: string[]
): Promise<{ removed: number; failures: string[] }> {
  let removed = 0;
  const failures: string[] = [];

  for (const vehicleId of vehicleIds) {
    for (const prefix of vehicleStoragePrefixes(vehicleId)) {
      const { paths, failures: listFailures } = await listObjectsRecursive(client, prefix);
      failures.push(...listFailures);
      if (paths.length === 0) continue;

      const { error: removeError } = await client.storage
        .from(DOCUMENTS_BUCKET)
        .remove(paths);

      if (removeError) {
        failures.push(`${prefix}: ${removeError.message}`);
        continue;
      }
      removed += paths.length;
    }
  }

  return { removed, failures };
}

