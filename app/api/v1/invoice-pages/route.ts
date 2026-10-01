import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@tappet/core/logger';
import { MAX_FILE_SIZE, ALLOWED_INVOICE_PAGE_TYPES, INVOICE_PAGE_LIMIT } from '@tappet/core/validation';
import { invoicePagePath, isInvoicePagePath } from '@tappet/core/storage-paths';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { UNREADABLE_REQUEST } from '@/lib/api-error-copy';

export const dynamic = 'force-dynamic';

/**
 * One page of a multi-page invoice scan, stored before the invoice exists.
 *
 * ── Why the pages travel one at a time (27 Sep) ─────────────────────────────
 *
 * The obvious shape — every page in one multipart POST to `/upload-document`
 * — does not fit: a phone photograph at `INVOICE_QUALITY` is 1.5–3 MB, and a
 * serverless request body stops at about 6 MB, so the third page of an
 * ordinary invoice would be refused by the platform before any of this code
 * ran. So each page is POSTed here as it is photographed, answered with its
 * storage path, and Done sends the paths (`uploadInvoicePages`). The upload
 * of page 3 also overlaps the photographing of page 4, which is most of the
 * time the whole scan used to take.
 *
 * No model is called here, so this is a storage write and a rate-limit row:
 * the `page` tier, not `upload`, whose five a minute would refuse the fifth
 * page of a scan. The paid half — the filing — stays behind `upload` and `ai`.
 *
 * `DELETE` discards pages the person abandoned. The server removes pages
 * itself once an invoice is filed; this is the other ending.
 */
export async function POST(request: NextRequest): Promise<Response> {
  const rateLimit = await checkRateLimit(getClientIdentifier(request, 'page'), 'page');
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  try {
    /*
      An unreadable body is the caller's mistake, not ours: 400. Inside the
      catch-all below, a POST with no multipart body answered 500 "Failed to
      store the page" — found probing the live route, 28 Sep.
    */
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json({ success: false, error: 'Expected a multipart form' }, { status: 400 });
    }
    const file = formData.get('file');
    const vehicleId = formData.get('vehicleId');

    if (!(file instanceof File) || typeof vehicleId !== 'string' || !vehicleId) {
      return NextResponse.json({ success: false, error: UNREADABLE_REQUEST }, { status: 400 });
    }

    // Before the file is inspected — the upload route's order, for its reason.
    const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
    if (!access.ok) return access.response;

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { success: false, error: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 400 }
      );
    }
    if (!ALLOWED_INVOICE_PAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'That file type cannot be read. Choose a photo.' }, { status: 400 });
    }

    const path = invoicePagePath(vehicleId, file.name || 'page.jpg');
    const { error } = await access.client.storage
      .from('vehicle-documents')
      .upload(path, new Blob([Buffer.from(await file.arrayBuffer())], { type: file.type }), {
        contentType: file.type,
        upsert: false,
      });

    if (error) {
      logger.error('API:INVOICE_PAGE', new Error(error.message), { vehicleId });
      return NextResponse.json({ success: false, error: 'Tappet could not store that page just now. Try again in a moment.' }, { status: 500 });
    }

    return NextResponse.json({ success: true, path });
  } catch (error) {
    logger.error('API:INVOICE_PAGE', error as Error);
    return NextResponse.json({ success: false, error: 'Tappet could not store that page just now. Try again in a moment.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
  try {
    const body = (await request.json().catch(() => null)) as { vehicleId?: unknown; paths?: unknown } | null;
    const vehicleId = typeof body?.vehicleId === 'string' ? body.vehicleId : '';
    const paths = body?.paths;

    if (!vehicleId || !Array.isArray(paths) || paths.length === 0) {
      return NextResponse.json({ success: false, error: UNREADABLE_REQUEST }, { status: 400 });
    }

    const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
    if (!access.ok) return access.response;

    /*
      Only this car's pending pages, and never more than a scan can hold
      (retakes included, twice over). A filed invoice lives at a different
      path, so nothing here can reach one.
    */
    if (paths.length > INVOICE_PAGE_LIMIT * 2 || !paths.every((path) => isInvoicePagePath(vehicleId, path))) {
      return NextResponse.json({ success: false, error: 'INVALID_PAGES' }, { status: 400 });
    }

    const { error } = await access.client.storage.from('vehicle-documents').remove(paths as string[]);
    if (error) {
      logger.error('API:INVOICE_PAGE_DISCARD', new Error(error.message), { vehicleId });
      return NextResponse.json({ success: false, error: 'Tappet could not discard those pages just now.' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error('API:INVOICE_PAGE_DISCARD', error as Error);
    return NextResponse.json({ success: false, error: 'Tappet could not discard those pages just now.' }, { status: 500 });
  }
}
