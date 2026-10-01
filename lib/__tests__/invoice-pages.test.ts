/**
 * A multi-page invoice — the server half (27 Sep).
 *
 * @jest-environment node
 *
 * The phone uploads each page to `/api/v1/invoice-pages` as it is
 * photographed and files the paths at Done (`uploadInvoicePages`). Three
 * properties carry the weight, and each is a way to leak or lose somebody's
 * data if it slips:
 *
 *   1. **A path is only ever this vehicle's pending page.** The routes
 *      authorize the vehicle; `isInvoicePagePath` is what ties a
 *      caller-supplied path to it. A prefix test would take a traversal.
 *   2. **The stored invoice is every page**, in order — a PDF whose page count
 *      is the scan's, because every viewer opens `file_url` whole.
 *   3. **The model reads every page in one call**, which is the reason for
 *      the feature: the prompt's cross-page dedupe could never act while each
 *      page arrived as its own invoice.
 *
 * (2) is executed; (1) is executed; (3) and the routes' ordering are read
 * from source, for the reason `upload-route-status-codes.test.ts` gives —
 * executing them means a live bucket and a vision model.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';

import { invoicePagePath, isInvoicePagePath } from '@tappet/core/storage-paths';
import { INVOICE_PAGE_LIMIT, ALLOWED_INVOICE_PAGE_TYPES } from '@tappet/core/validation';
import { stitchInvoicePdf } from '@/lib/invoice-pdf';

const CAR = '7f4c2a10-1111-4222-8333-944455556666';
const OTHER = '0a0b0c0d-1111-4222-8333-944455556666';

const read = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', ...parts), 'utf8');

describe('isInvoicePagePath — the path is this car’s pending page, exactly', () => {
  it('accepts what invoicePagePath writes', () => {
    const path = invoicePagePath(CAR, 'invoice 1790000000.jpg');
    expect(path.startsWith(`${CAR}/invoices/pages/`)).toBe(true);
    expect(isInvoicePagePath(CAR, path)).toBe(true);
  });

  it.each([
    ['another car’s page', () => invoicePagePath(OTHER, 'p.jpg')],
    ['a filed invoice', () => `${CAR}/invoices/1790000000-abc-invoice.jpg`],
    ['a traversal', () => `${CAR}/invoices/pages/../../${OTHER}/invoices/x.jpg`],
    ['a nested folder', () => `${CAR}/invoices/pages/a/b.jpg`],
    ['a photo', () => `${CAR}/photos/1-a.jpg`],
    ['nothing', () => ''],
    ['not a string', () => 42 as unknown as string],
  ])('refuses %s', (_, path) => {
    expect(isInvoicePagePath(CAR, path())).toBe(false);
  });
});

describe('the limit and the page types are one number each, shared', () => {
  it('holds six pages, JPEG or PNG', () => {
    expect(INVOICE_PAGE_LIMIT).toBe(6);
    expect(ALLOWED_INVOICE_PAGE_TYPES).toEqual(expect.arrayContaining(['image/jpeg', 'image/png']));
    expect(ALLOWED_INVOICE_PAGE_TYPES).not.toContain('application/pdf');
  });

  it('is the phone’s number too — the strip reads the same export', () => {
    const screen = read('apps', 'mobile', 'src', 'screens', 'InvoiceScanScreen.tsx');
    expect(screen).toMatch(/import \{ INVOICE_PAGE_LIMIT \} from '@tappet\/core\/validation'/);
    expect(screen).not.toMatch(/\b6 pages\b|=\s*6;/);
  });
});

describe('stitchInvoicePdf — one document, every page, in order', () => {
  /** A real JPEG of a given size — the shape the phone's shutter produces. */
  const jpeg = async (width: number, height: number) =>
    new Uint8Array(
      await sharp({ create: { width, height, channels: 3, background: '#eee8dc' } }).jpeg().toBuffer()
    );

  it('makes one page per photograph', async () => {
    const pages = await Promise.all([jpeg(30, 40), jpeg(30, 40), jpeg(30, 40)]);
    const bytes = await stitchInvoicePdf(pages.map((b) => ({ bytes: b, type: 'image/jpeg' })));

    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
  });

  it('can still tell one page from three — the count is real', async () => {
    const bytes = await stitchInvoicePdf([{ bytes: await jpeg(30, 40), type: 'image/jpeg' }]);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(1);
  });

  it('sizes each page to Letter’s long edge, keeping the photograph’s proportions', async () => {
    const bytes = await stitchInvoicePdf([
      { bytes: await jpeg(30, 40), type: 'image/jpeg' },
      { bytes: new Uint8Array(await sharp({ create: { width: 40, height: 30, channels: 3, background: '#fff' } }).png().toBuffer()), type: 'image/png' },
    ]);
    const doc = await PDFDocument.load(bytes);
    const portrait = doc.getPage(0).getSize();
    const landscape = doc.getPage(1).getSize();
    expect(portrait.height).toBeCloseTo(792, 3);
    expect(portrait.width).toBeCloseTo(594, 3);
    expect(landscape.width).toBeCloseTo(792, 3);
    expect(landscape.height).toBeCloseTo(594, 3);
  });

  it('refuses to make an empty invoice', async () => {
    await expect(stitchInvoicePdf([])).rejects.toThrow();
  });
});

describe('uploadInvoicePages — read from source', () => {
  const actions = read('app', 'actions.ts');
  const body = (() => {
    const start = actions.indexOf('export async function uploadInvoicePages(');
    expect(start).toBeGreaterThan(-1);
    return actions.slice(start, actions.indexOf('\n}\n', start));
  })();

  it('authorizes the vehicle, then refuses any path that is not its page, before reading one', () => {
    const auth = body.indexOf("authorizeVehicleAccess(vehicleId, { intent: 'write' })");
    const check = body.indexOf('isInvoicePagePath(vehicleId, path)');
    const download = body.indexOf('.download(');
    expect(auth).toBeGreaterThan(-1);
    expect(check).toBeGreaterThan(auth);
    expect(download).toBeGreaterThan(check);
    expect(body).toMatch(/pagePaths\.length > INVOICE_PAGE_LIMIT/);
  });

  it('removes the pending pages only once the invoice is filed', () => {
    /*
      Every removal, not the first: since audit 360 TL-2 there are two — the
      filing's own, and a repeat filing answered from the filed document
      (`prior.state === 'filed'`). Each must sit inside its own filed branch.
    */
    const removals = Array.from(body.matchAll(/\.remove\(paths\)/g), (m) => m.index ?? -1);
    expect(removals.length).toBeGreaterThanOrEqual(1);
    for (const remove of removals) {
      const guard = Math.max(
        body.lastIndexOf('if (result.success)', remove),
        body.lastIndexOf("if (prior.state === 'filed')", remove)
      );
      expect(guard).toBeGreaterThan(-1);
      // No other branch opened between the guard and the removal.
      expect(body.slice(guard, remove).match(/\n    \}/g)).toBeNull();
    }
  });

  it('hands the model every page, in one call', () => {
    const parse = actions.slice(actions.indexOf('export async function parseInvoiceLineItems('));
    expect(parse).toMatch(/morePages: \{ data: string; mimeType: string \}\[\] = \[\]/);
    // Capped where the public endpoint is, not only where the phone is.
    expect(parse).toMatch(/morePages\.slice\(0, INVOICE_PAGE_LIMIT - 1\)/);
    // One generateContent for the whole invoice.
    const call = parse.slice(0, parse.indexOf('recordAiUsageInBackground'));
    expect(call.match(/generateContent\(/g)).toHaveLength(1);
  });
});

describe('/api/v1/invoice-pages — read from source', () => {
  const route = read('app', 'api', 'v1', 'invoice-pages', 'route.ts');

  it('authorizes with write intent before it inspects the file', () => {
    const auth = route.indexOf("authorizeVehicleAccess(vehicleId, { intent: 'write' })");
    expect(auth).toBeGreaterThan(-1);
    expect(route.indexOf('file.size > MAX_FILE_SIZE')).toBeGreaterThan(auth);
    expect(route).not.toMatch(/intent:\s*'read'/);
  });

  it('stores under the pending-page path, never the filed one', () => {
    expect(route).toMatch(/invoicePagePath\(vehicleId,/);
    expect(route).not.toMatch(/vehicleStoragePath\(/);
  });

  it('deletes only paths that are this car’s pages', () => {
    const del = route.slice(route.indexOf('export async function DELETE'));
    expect(del.indexOf('isInvoicePagePath(vehicleId, path)')).toBeLessThan(del.indexOf('.remove('));
    expect(del.indexOf('isInvoicePagePath(vehicleId, path)')).toBeGreaterThan(-1);
  });

  it('spends the page tier, not the upload tier’s five a minute', () => {
    expect(route).toMatch(/checkRateLimit\([^)]*'page'\)/);
    expect(read('lib', 'rate-limit.ts')).toMatch(/page:\s*\{\s*windowSeconds: 60,\s*maxRequests: 30/);
  });
});
