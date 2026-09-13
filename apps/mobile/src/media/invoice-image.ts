import type { InvoiceFile } from '../api/documents';

/**
 * What an invoice photograph is, whichever way it was taken.
 *
 * ── Two sources, one file ───────────────────────────────────────────────────
 *
 * Until 12 Sep the only camera was the system's, opened through
 * `expo-image-picker` in `pick-image.ts`, and that file held the one number
 * every invoice image was encoded at. B9 gave the scan its own viewfinder
 * (`components/Viewfinder.tsx`, `expo-camera`), which encodes its capture
 * itself — so a second module now produces an `InvoiceFile`, and the quality
 * had to move out of the picker or be written twice. Two literals that agree
 * today are the drift nobody notices; one export is not.
 *
 * Nothing native is imported here on purpose: the viewfinder and the picker
 * each import their own module and share this, and the tests for the shape
 * both produce (`lib/__tests__/mobile-invoice-picker.test.ts`) run under node.
 */

/**
 * Reduce the capture before it is encoded.
 *
 * 0.7 rather than 1.0. The extractor reads text off an invoice, which survives
 * JPEG compression easily, and the alternative is uploading several megabytes
 * over cellular from a car park. `pick-image.ts` carries the M235i story —
 * a 2.3 MB original that has never once decoded on the simulator — which is
 * the other half of the reason.
 */
export const INVOICE_QUALITY = 0.7;

/**
 * The viewfinder's capture, as the upload wants it.
 *
 * `expo-camera` hands back a `uri`, its dimensions and a `format`; the upload
 * wants a `uri`, a **name with an extension**, and a MIME type on
 * `ALLOWED_DOCUMENT_TYPES`. The extension is what tells the server the type —
 * an untyped blob is the upload that fails after the model has already been
 * paid for — so the generated name carries one, and it is derived from what
 * actually came back rather than assumed: a capture that arrived as PNG must
 * not be sent as `.jpg`.
 *
 * `size` is deliberately absent. The camera does not report bytes, and an
 * unknown size is not a reason to refuse — `uploadInvoice` lets it through and
 * leaves the server to say no. Inventing a figure here would be the one
 * thing worse than not knowing.
 */
export function invoiceFileFromCapture(picture: { uri: string; format?: 'jpg' | 'png' }): InvoiceFile {
  const png = picture.format === 'png';
  return {
    uri: picture.uri,
    name: `invoice-${Date.now()}.${png ? 'png' : 'jpg'}`,
    type: png ? 'image/png' : 'image/jpeg',
  };
}
