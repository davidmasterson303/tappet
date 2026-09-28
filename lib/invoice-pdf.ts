import { PDFDocument } from 'pdf-lib';

/**
 * One document from the pages of a multi-page scan.
 *
 * ── Why a PDF, and not the pages side by side ───────────────────────────────
 *
 * `vehicle_documents.file_url` holds one path, and every reader of an invoice
 * — `/api/v1/document-url`, the web document library, the phone's VIEW
 * INVOICE — signs that one path and opens it. Storing the pages separately
 * would mean a second column (DDL, which is David's to run) and a pager in
 * three viewers, each able to show page 1 alone and look finished. A PDF is
 * the shape every one of them already opens whole, today.
 *
 * The model is **not** handed this PDF: it gets the page images themselves
 * (`parseInvoiceLineItems`), which is what it was reading before and what the
 * vision corpus measured. The PDF is the record; the images are the reading.
 *
 * Each page keeps its photograph's own proportions, scaled so its long edge
 * is US Letter's (11 in, 792 pt). No re-encode — pdf-lib embeds the JPEG
 * bytes as they came off the phone, so the stored page is the photographed
 * one, byte for byte.
 */
export interface InvoicePageImage {
  bytes: Uint8Array;
  /** `image/jpeg` or `image/png` — the two pdf-lib can embed. */
  type: string;
}

const LONG_EDGE_PT = 792;

export async function stitchInvoicePdf(pages: InvoicePageImage[]): Promise<Uint8Array> {
  if (pages.length === 0) throw new Error('No pages to stitch');

  const pdf = await PDFDocument.create();
  pdf.setTitle('Invoice');
  pdf.setProducer('Tappet');

  for (const page of pages) {
    const image =
      page.type === 'image/png' ? await pdf.embedPng(page.bytes) : await pdf.embedJpg(page.bytes);
    const scale = LONG_EDGE_PT / Math.max(image.width, image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    pdf.addPage([width, height]).drawImage(image, { x: 0, y: 0, width, height });
  }

  return pdf.save();
}

/** Whether pdf-lib can embed this page's type. WebP it cannot. */
export function isStitchable(type: string): boolean {
  return type === 'image/jpeg' || type === 'image/jpg' || type === 'image/png';
}
