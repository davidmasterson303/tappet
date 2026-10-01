import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@tappet/core/logger';
import { storagePathFromStoredUrl, storedUrl, vehicleIdFromStoragePath } from '@tappet/core/storage-paths';
import { DOCUMENTS_BUCKET } from '@/lib/storage-objects';

/**
 * After a document's row is deleted, delete the file it named.
 *
 * ── Audit 360, SEC-5 (1 Oct) · "deleted" was the row, not the invoice ───────
 *
 * Both delete paths — `POST /api/v1/delete-maintenance-item` (the phone) and
 * `deleteMaintenanceLineItem` (the web) — removed the `vehicle_documents` row
 * and nothing else. The scan itself, with the owner's name, address and VIN
 * on it, stayed in the private bucket until the car or the account was
 * removed (those purge by prefix). The app said it was gone.
 *
 * Called **after** the row is gone: a file removed first, under a row whose
 * delete then failed, would leave a row pointing at nothing.
 *
 * Three refusals, each logged rather than thrown — the owner's delete has
 * already happened and is reported as done:
 *
 *   - **not a stored path** — the demo's placeholder URLs, or anything
 *     `storagePathFromStoredUrl` cannot read. Nothing of ours to remove.
 *   - **another vehicle's prefix** — the row said this car; the path must
 *     agree, the same second check `document-url` makes before signing.
 *   - **still referenced** — the advisor's attachment (`consultant_documents`)
 *     and a filing of it (`vehicle_documents`) share one object. Removing it
 *     under the other row would break the attachment the owner did not
 *     delete; it goes with the last row, or with the car.
 *
 * ⚠ A removal that fails is logged at **error** (`DOCUMENT_FILE:REMOVE_FAILED`):
 * the owner was told it is deleted, and only the log can say otherwise.
 */
export type DocumentFileOutcome = 'removed' | 'not-stored' | 'foreign-path' | 'still-referenced' | 'failed';

export async function removeDocumentFile(
  client: SupabaseClient,
  vehicleId: string,
  fileUrl: unknown
): Promise<DocumentFileOutcome> {
  const path = storagePathFromStoredUrl(typeof fileUrl === 'string' ? fileUrl : null);
  if (!path) return 'not-stored';

  if (vehicleIdFromStoragePath(path) !== vehicleId) {
    logger.warn('DOCUMENT_FILE:FOREIGN_PATH', 'A deleted document named a path outside its vehicle', {
      vehicleId,
    });
    return 'foreign-path';
  }

  // Both spellings a row may hold: the stored URL, and a bare path.
  const spellings = Array.from(new Set([fileUrl as string, storedUrl(path), path]));
  for (const table of ['vehicle_documents', 'consultant_documents'] as const) {
    const { data, error } = await client.from(table).select('id').in('file_url', spellings).limit(1);
    if (error) {
      logger.error('DOCUMENT_FILE:REMOVE_FAILED', new Error(error.message), { vehicleId, step: `refs:${table}` });
      return 'failed';
    }
    if ((data ?? []).length > 0) return 'still-referenced';
  }

  const { error } = await client.storage.from(DOCUMENTS_BUCKET).remove([path]);
  if (error) {
    logger.error('DOCUMENT_FILE:REMOVE_FAILED', new Error(error.message), { vehicleId, step: 'remove' });
    return 'failed';
  }
  return 'removed';
}
