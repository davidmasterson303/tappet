/**
 * Audit 360, TL-2 (1 Oct) — a filing whose answer was lost is answered with
 * the filed document, never filed twice.
 *
 * @jest-environment node
 *
 * The decision is executed against a recorded client; the wiring into
 * `uploadInvoicePages` (before any page is read) and the route's 409 are read
 * from source, for the reason `invoice-pages.test.ts` gives — executing the
 * action means a live bucket and a vision model.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { invoicePagePath, storedUrl, vehicleStoragePath } from '@tappet/core/storage-paths';
import {
  FILING_IN_FLIGHT_MS,
  PHONE_FILING_WAIT_MS,
  filedInvoiceName,
  priorFiling,
  scanToken,
  type ReplayClient,
} from '@/lib/invoice-filing-replay';

const CAR = '7f4c2a10-1111-4222-8333-944455556666';
const read = (...parts: string[]) => readFileSync(join(__dirname, '..', '..', ...parts), 'utf8');

type Row = { id: string; vehicle_id: string; file_url: string; extraction_status: string; upload_date: string };

/** A client over an in-memory table, applying `eq` and `like` as PostgREST would. */
function client(documents: Row[], itemsPerDocument: Record<string, number> = {}) {
  const calls: string[] = [];
  const likeToRegex = (pattern: string) =>
    new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`);
  const fake: ReplayClient = {
    from: (table) => ({
      select: (_columns, options) => {
        let rows: Record<string, unknown>[] =
          table === 'vehicle_documents'
            ? [...documents]
            : Object.entries(itemsPerDocument).flatMap(([doc, n]) =>
                Array.from({ length: n }, (_, i) => ({ id: `${doc}-${i}`, source_document_id: doc }))
              );
        const query: any = {
          eq: (column: string, value: string) => {
            calls.push(`${table}.eq.${column}`);
            rows = rows.filter((r) => r[column] === value);
            return query;
          },
          like: (column: string, pattern: string) => {
            calls.push(`${table}.like.${pattern}`);
            rows = rows.filter((r) => likeToRegex(pattern).test(String(r[column])));
            return query;
          },
          order: (column: string, { ascending }: { ascending: boolean }) => {
            rows.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1));
            return query;
          },
          limit: (n: number) => {
            rows = rows.slice(0, n);
            return query;
          },
          then: (resolve: (v: unknown) => unknown) =>
            resolve(options?.head ? { data: null, error: null, count: rows.length } : { data: rows, error: null }),
        };
        return query;
      },
    }),
  };
  return { fake, calls };
}

const NOW = Date.parse('2026-10-01T12:00:00Z');
const pages = [invoicePagePath(CAR, 'page-1.jpg'), invoicePagePath(CAR, 'page-2.jpg')];

function filedFrom(paths: string[], status: string, at = NOW - 60_000): Row {
  const single = paths.length === 1;
  const storagePath = single
    ? vehicleStoragePath(CAR, 'invoices', paths[0].split('/').pop()!)
    : vehicleStoragePath(CAR, 'invoices', filedInvoiceName(paths[0], paths.length));
  return {
    id: 'doc-1',
    vehicle_id: CAR,
    file_url: storedUrl(storagePath),
    extraction_status: status,
    upload_date: new Date(at).toISOString(),
  };
}

describe('the scan token', () => {
  it('is the first page’s stamp, and the stored names carry it', () => {
    const token = scanToken(pages[0]);
    expect(token).toMatch(/^\d{13}-[a-z0-9]+$/);
    expect(filedInvoiceName(pages[0], 2)).toContain(`-${token}-`);
    // A single page is stored under its own name, which already carries it.
    expect(vehicleStoragePath(CAR, 'invoices', pages[0].split('/').pop()!)).toContain(`-${token}-`);
  });

  it('is null for a path with no stamp', () => {
    expect(scanToken(`${CAR}/invoices/pages/page.jpg`)).toBeNull();
  });
});

describe('priorFiling — audit 360, TL-2', () => {
  it('finds a completed filing of these pages and answers with it', async () => {
    for (const paths of [pages, pages.slice(0, 1)]) {
      const { fake } = client([filedFrom(paths, 'completed')], { 'doc-1': 16 });
      await expect(priorFiling(fake, CAR, paths, NOW)).resolves.toEqual({
        state: 'filed',
        documentId: 'doc-1',
        itemsExtracted: 16,
      });
    }
  });

  it('says a recent pending filing is still in flight', async () => {
    const { fake } = client([filedFrom(pages, 'pending')]);
    await expect(priorFiling(fake, CAR, pages, NOW)).resolves.toEqual({ state: 'in-flight' });
  });

  it('files again after a pending filing the platform must have killed', async () => {
    const { fake } = client([filedFrom(pages, 'pending', NOW - FILING_IN_FLIGHT_MS - 1)]);
    await expect(priorFiling(fake, CAR, pages, NOW)).resolves.toEqual({ state: 'none' });
  });

  it('does not call a filing killed three minutes ago "still reading" (TL-14)', async () => {
    /*
      Was ten minutes: a filing the platform killed answered every Try again
      with "still reading… check in a minute" for ten minutes. Three minutes
      is past the phone's wait and any synchronous function ceiling.
    */
    const { fake } = client([filedFrom(pages, 'pending', NOW - 3 * 60_000)]);
    await expect(priorFiling(fake, CAR, pages, NOW)).resolves.toEqual({ state: 'none' });
  });

  it('still refuses a retry the phone makes while its own request could be answered', async () => {
    expect(FILING_IN_FLIGHT_MS).toBeGreaterThan(PHONE_FILING_WAIT_MS);
    const { fake } = client([filedFrom(pages, 'pending', NOW - PHONE_FILING_WAIT_MS)]);
    await expect(priorFiling(fake, CAR, pages, NOW)).resolves.toEqual({ state: 'in-flight' });
  });

  it('pins the phone wait it is measured against', () => {
    const phone = readFileSync(join(__dirname, '..', '..', 'apps', 'mobile', 'src', 'api', 'documents.ts'), 'utf8');
    const waits = [...phone.matchAll(/timeoutMs:\s*([\d_]+)/g)].map((m) => Number(m[1].replace(/_/g, '')));
    expect(waits.length).toBeGreaterThan(0);
    expect(Math.max(...waits)).toBe(PHONE_FILING_WAIT_MS);
  });

  it('does not take another scan’s document for this one (anti-vacuous)', async () => {
    const other = [invoicePagePath(CAR, 'other-1.jpg'), invoicePagePath(CAR, 'other-2.jpg')];
    // Different first-page stamps, guaranteed even within one millisecond.
    other[0] = other[0].replace(/pages\/(\d+)-[a-z0-9]+-/, 'pages/$1-zzzzzz-');
    const { fake } = client([filedFrom(other, 'completed')], { 'doc-1': 3 });
    await expect(priorFiling(fake, CAR, pages, NOW)).resolves.toEqual({ state: 'none' });
  });

  it('scopes the lookup to the car and to filed invoices, not pending pages', async () => {
    const { fake, calls } = client([]);
    await priorFiling(fake, CAR, pages, NOW);
    expect(calls).toContain('vehicle_documents.eq.vehicle_id');
    expect(calls.find((c) => c.includes('.like.'))).toMatch(/%\/invoices\/%-\d{13}-[a-z0-9]+-%$/);
  });
});

describe('the wiring', () => {
  const actions = read('app', 'actions.ts');
  const start = actions.indexOf('export async function uploadInvoicePages');
  const body = actions.slice(start, actions.indexOf('\nexport ', start + 10));

  it('found the action', () => {
    expect(start).toBeGreaterThan(-1);
    expect(body.length).toBeGreaterThan(500);
  });

  it('asks about a prior filing before any page is read', () => {
    const asked = body.indexOf('priorFiling(');
    const download = body.indexOf('.download(');
    expect(asked).toBeGreaterThan(-1);
    expect(download).toBeGreaterThan(-1);
    expect(asked).toBeLessThan(download);
  });

  it('stores a multi-page scan under a name that carries its token', () => {
    expect(body).toMatch(/filedInvoiceName\(paths\[0\], pages\.length\)/);
    expect(body).not.toMatch(/`invoice-\$\{pages\.length\}-pages\.pdf`/);
  });

  it('the route answers an in-flight retry with 409 and a sentence', () => {
    const route = read('app', 'api', 'v1', 'upload-document', 'route.ts');
    const at = route.indexOf("result.error === 'FILING_IN_PROGRESS'");
    expect(at).toBeGreaterThan(-1);
    expect(route.slice(at, at + 400)).toMatch(/status: 409/);
  });
});
