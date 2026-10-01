import { NextRequest, NextResponse } from 'next/server';
import { uploadInvoice, uploadInvoicePages, type InvoiceFilingResult } from '@/app/actions';
import { FILING_IN_PROGRESS_MESSAGE } from '@/lib/invoice-filing-replay';
import { logger } from '@tappet/core/logger';
import { MAX_FILE_SIZE, ALLOWED_DOCUMENT_TYPES } from '@tappet/core/validation';
import type { ApiResponse } from '@tappet/core/types';
import { checkRateLimit, getClientIdentifier, rateLimitResponse } from '@/lib/rate-limit';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { UNREADABLE_REQUEST } from '@/lib/api-error-copy';
import { RATE_LIMITED_CODE } from '@tappet/core/ai/advisor-failure';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<Response> {
  logger.info('API:UPLOAD_INVOICE', 'Upload request received');

  const identifier = getClientIdentifier(request, 'upload');
  const rateLimit = await checkRateLimit(identifier, 'upload');
  if (!rateLimit.allowed) {
    logger.warn('API:UPLOAD_INVOICE', 'Rate limit exceeded', { identifier });
    return rateLimitResponse(rateLimit);
  }

  try {
    /*
      ── The pages form (27 Sep) ─────────────────────────────────────────────

      A multi-page scan has already uploaded its pages
      (`/api/v1/invoice-pages`), so Done arrives as JSON naming them —
      `{ vehicleId, pagePaths, bypassVehicleCheck }` — and no file body at
      all. Same authorization first, same answers after: the mapping below is
      shared, so a mismatch or a refusal reads identically whichever way the
      invoice came in. The multipart form stays for the web and for every
      phone build that predates this.
    */
    if (request.headers.get('content-type')?.includes('application/json')) {
      const json = (await request.json().catch(() => null)) as {
        vehicleId?: unknown;
        pagePaths?: unknown;
        bypassVehicleCheck?: unknown;
      } | null;
      const vehicleId = typeof json?.vehicleId === 'string' ? json.vehicleId : '';
      if (!vehicleId || !Array.isArray(json?.pagePaths)) {
        return NextResponse.json(
          { success: false, error: UNREADABLE_REQUEST } as ApiResponse,
          { status: 400 }
        );
      }

      const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
      if (!access.ok) {
        return access.response;
      }

      const bypassFlag = json?.bypassVehicleCheck === true;
      logger.info('API:UPLOAD_INVOICE', 'Processing pages', {
        pageCount: json?.pagePaths.length,
        bypassVehicleCheck: bypassFlag,
        vehicleId,
      });

      const result = await uploadInvoicePages(vehicleId, json?.pagePaths, bypassFlag);

      /*
        Two refusals only this form can reach, both 400s the phone reads by
        name: a path list that is not this car's pages, and a page that is no
        longer there — which the phone answers by sending that page again.
      */
      /*
        Audit 360, TL-2: a retry that overtook the filing it repeats. 409 with
        a sentence a build-2 phone shows as it stands (it reads `error`), and
        a `code` a later build can read; the next Try again gets the filed
        document (`lib/invoice-filing-replay.ts`).
      */
      // `FILING_IN_PROGRESS` → 409 lives in `respond`: since TL-31 both forms reach it.

      if (!result.success && (result.error === 'INVALID_PAGES' || result.error === 'PAGE_MISSING')) {
        return NextResponse.json(
          {
            success: false,
            error: result.error,
            // The machine-readable half, which the phone reads — never the sentence.
            code: result.error === 'PAGE_MISSING' ? 'page-missing' : 'invalid-pages',
            missingPath: result.missingPath,
          },
          { status: 400 }
        );
      }

      return respond(result, vehicleId);
    }

    // A body that is neither JSON nor a readable form is a 400, not the 500
    // the catch-all below would give it (28 Sep, as `/invoice-pages`).
    const formData = await request.formData().catch(() => null);
    if (!formData) {
      return NextResponse.json(
        { success: false, error: 'Expected a multipart form or JSON' } as ApiResponse,
        { status: 400 }
      );
    }
    const file = formData.get('file') as File;
    const vehicleId = formData.get('vehicleId') as string;
    const bypassVehicleCheck = formData.get('bypassVehicleCheck') as string;

    logger.debug('API:UPLOAD_INVOICE', 'Parsing form data', {
      hasFile: !!file,
      hasVehicleId: !!vehicleId,
      fileName: file?.name
    });

    if (!file || !vehicleId) {
      logger.warn('API:UPLOAD_INVOICE', 'Missing required fields', {
        hasFile: !!file,
        hasVehicleId: !!vehicleId
      });
      return NextResponse.json(
        { success: false, error: UNREADABLE_REQUEST } as ApiResponse,
        { status: 400 }
      );
    }

    /*
      ── Authorized here as well as in the action, and for the status code ─────

      Not redundancy, and not distrust of `uploadInvoice` — it authorizes
      because a server action is an independently reachable POST endpoint and
      always must. This route authorizes because it needs the **HTTP status**,
      which is the same argument `/api/v1/consultant` sets out at length.

      What it was doing instead: the action returns `{ success: false, error }`
      with no status, and the mapping below falls through to **500** for
      anything it does not recognise. So a caller whose session had expired got
      `500 Unauthorized`, and a caller reaching for someone else's vehicle got
      500 rather than 404.

      That is not cosmetic for Phase 3.3. The mobile client keys sign-out off
      `status === 401` (`apps/mobile/src/api/client.ts`), so on a 500 it would
      never fire — an expired session would show "try again" forever, and
      trying again cannot help. This is the one flow where that matters most:
      an invoice upload is the end of a photograph someone just took.

      Placed after the field check and before the file checks deliberately.
      Reading and validating a file body for a caller who may not touch the
      vehicle is work done on behalf of someone with no claim to it.
    */
    const access = await authorizeVehicleAccess(vehicleId, { intent: 'write' });
    if (!access.ok) {
      return access.response;
    }

    if (file.size > MAX_FILE_SIZE) {
      logger.warn('API:UPLOAD_INVOICE', 'File too large', {
        fileSize: file.size,
        maxSize: MAX_FILE_SIZE
      });
      return NextResponse.json(
        { success: false, error: `File size must be less than ${MAX_FILE_SIZE / 1024 / 1024}MB` } as ApiResponse,
        { status: 400 }
      );
    }

    if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
      logger.warn('API:UPLOAD_INVOICE', 'Invalid file type', {
        fileType: file.type,
        allowedTypes: ALLOWED_DOCUMENT_TYPES
      });
      return NextResponse.json(
        { success: false, error: 'That file type cannot be read. Choose a photo or a PDF.' } as ApiResponse,
        { status: 400 }
      );
    }

    const bypassFlag = bypassVehicleCheck === 'true';
    logger.info('API:UPLOAD_INVOICE', 'Processing file', {
      fileName: file.name,
      fileSize: file.size,
      bypassVehicleCheck: bypassFlag,
      vehicleId
    });

    const uploadFormData = new FormData();
    uploadFormData.append('file', file);
    uploadFormData.append('vehicleId', vehicleId);
    if (bypassFlag) {
      uploadFormData.append('bypassVehicleCheck', 'true');
    }
    /*
      Audit 360, TL-31: the website's filing key, passed through as it came —
      `uploadInvoice` validates it and replays an earlier filing that carried
      it. A caller that sends none files exactly as before.
    */
    const filingKey = formData.get('filingKey');
    if (typeof filingKey === 'string' && filingKey) {
      uploadFormData.append('filingKey', filingKey);
    }

    const result = await uploadInvoice(uploadFormData);
    return respond(result, vehicleId);
  } catch (error) {
    logger.error('API:UPLOAD_INVOICE', error as Error);
    return NextResponse.json(
      { success: false, error: 'Tappet could not store that invoice just now. Try again in a moment.' } as ApiResponse,
      { status: 500 }
    );
  }
}

/** One mapping from a filing to HTTP, for both forms. */
function respond(result: InvoiceFilingResult, vehicleId: string): Response {
  /*
    Audit 360, TL-2 / TL-31: a retry that overtook the filing it repeats.
    409 with a sentence a build-2 phone shows as it stands (it reads `error`),
    and a `code` the website and a later build read; the next Try again gets
    the filed document (`lib/invoice-filing-replay.ts`).
  */
  if (!result.success && result.error === 'FILING_IN_PROGRESS') {
    return NextResponse.json(
      { success: false, error: FILING_IN_PROGRESS_MESSAGE, code: 'filing-in-progress' },
      { status: 409 }
    );
  }

  if (!result.success) {
    logger.warn('API:UPLOAD_INVOICE', 'Upload failed', {
      error: result.error,
      vehicleId
    });

    if (result.error === 'VEHICLE_MISMATCH') {
      return NextResponse.json({
        success: false,
        error: 'VEHICLE_MISMATCH',
        message: result.message,
        extractedVehicle: result.extractedVehicle,
        expectedVehicle: result.expectedVehicle,
      } as ApiResponse);
    }

    if (result.error === 'NOT_AUTOMOTIVE_INVOICE') {
      return NextResponse.json({
        success: false,
        error: 'NOT_AUTOMOTIVE_INVOICE',
        message: result.message,
      } as ApiResponse);
    }

    /*
      E6's wire: the feature gate's refusal, as 402 with `code` and
      `feature` beside the sentence — the consultant route carries the
      argument. Ahead of the string matching below, which would otherwise
      file it under 500 "Upload failed".
    */
    if (result.code === 'needs-subscription') {
      return NextResponse.json(
        { success: false, error: result.error, code: result.code, feature: result.feature },
        { status: 402 }
      );
    }

    /*
      Audit 360, TL-35: the AI tier's limiter, as 429 with its `code` — the
      consultant route's shape. It was a 500 under the limiter's sentence. A
      phone reads 429 as "Too many uploads just now" (`documents.ts`), on
      build 2 as on build 3.
    */
    if (result.code === RATE_LIMITED_CODE) {
      return NextResponse.json(
        { success: false, error: result.error, code: result.code },
        { status: 429 }
      );
    }

    let errorMessage = result.error || 'Tappet could not store that invoice just now. Try again in a moment.';
    let statusCode = 500;

    if (errorMessage.includes('Bucket not found')) {
      errorMessage = 'Invoice storage is unavailable right now. Your photo was not lost — try again later.';
      statusCode = 503;
    } else if (errorMessage.includes('Failed to upload file')) {
      errorMessage = 'Tappet could not store that invoice just now. Try again in a moment.';
    } else if (errorMessage.includes('Failed to create document record')) {
      errorMessage = 'Tappet could not save that invoice just now. Try again in a moment.';
    }

    return NextResponse.json(
      { success: false, error: errorMessage } as ApiResponse,
      { status: statusCode }
    );
  }

  logger.info('API:UPLOAD_INVOICE', 'Upload successful', {
    itemsExtracted: result.itemsExtracted || 0,
    documentId: result.documentId,
    vehicleId
  });

  return NextResponse.json({
    success: true,
    itemsExtracted: result.itemsExtracted || 0,
    documentId: result.documentId,
    ...(result.pageCount ? { pageCount: result.pageCount } : {}),
  } as ApiResponse);
}
