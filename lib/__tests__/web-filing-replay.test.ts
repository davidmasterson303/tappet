/**
 * The website's single-file filing is answered, not filed again, when it
 * carries the key of a filing that landed (audit 360, TL-31).
 *
 * @jest-environment node
 *
 * Executed: the route's multipart form and `uploadInvoice` behind it, over a
 * stubbed vehicle and an in-memory `vehicle_documents`. Storage refuses every
 * upload ("stop here"), so a filing that would reach the model stops at the
 * write — and the assertion is whether it reached the write at all, and under
 * which name. A filing that landed is modelled by the row it leaves: the
 * stored path the first attempt chose, `completed`.
 *
 * The legitimate cases are executed beside the retry: a different key (the
 * same invoice chosen again later, or another invoice) and no key (a caller
 * that predates this) both reach the write.
 */

jest.mock('@/lib/supabase', () => ({
  getServiceRoleClient: jest.fn(),
  createServerActionClient: jest.fn(),
  getServerClient: jest.fn(),
  supabase: {},
}));
jest.mock('@/lib/api-auth', () => ({
  requireSession: jest.fn(),
  requireCaller: jest.fn(),
  authorizeVehicleAccess: jest.fn(),
}));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true }),
  getClientIdentifier: () => 'test',
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));

import { NextRequest } from 'next/server';
import { authorizeVehicleAccess } from '@/lib/api-auth';
import { POST } from '@/app/api/v1/upload-document/route';
import { storedUrl } from '@tappet/core/storage-paths';
import {
  FILING_IN_FLIGHT_MS,
  FILING_IN_PROGRESS_MESSAGE,
  filingKeyToken,
  mintFilingKey,
} from '@/lib/invoice-filing-replay';

const CAR = '7f4c2a10-1111-4222-8333-944455556666';
const authorize = authorizeVehicleAccess as jest.Mock;

type Row = { id: string; vehicle_id: string; file_url: string; extraction_status: string; upload_date: string };
let rows: Row[];
let uploads: string[];

const likeToRegex = (pattern: string) =>
  new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`);

function stubClient() {
  return {
    from: (table: string) => ({
      select: (_columns: string, options?: { head?: boolean }) => {
        let found: Record<string, unknown>[] =
          table === 'vehicle_documents' ? [...rows] : rows.map((r) => ({ id: `${r.id}-item`, source_document_id: r.id }));
        const query: any = {
          eq: (column: string, value: string) => ((found = found.filter((r) => r[column] === value)), query),
          like: (column: string, pattern: string) =>
            ((found = found.filter((r) => likeToRegex(pattern).test(String(r[column])))), query),
          order: () => query,
          limit: (n: number) => ((found = found.slice(0, n)), query),
          then: (resolve: (v: unknown) => unknown) =>
            resolve(options?.head ? { data: null, error: null, count: found.length } : { data: found, error: null }),
        };
        return query;
      },
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          uploads.push(path);
          return { error: { message: 'stop here' } };
        },
      }),
    },
  };
}

beforeEach(() => {
  rows = [];
  uploads = [];
  authorize.mockReset().mockImplementation(async () => ({ ok: true, userId: 'u1', client: stubClient() }));
});

async function post(fileName: string, filingKey?: string) {
  const form = new FormData();
  form.append('file', new File(['%PDF-1.4 receipt'], fileName, { type: 'application/pdf' }));
  form.append('vehicleId', CAR);
  if (filingKey) form.append('filingKey', filingKey);
  const response = await POST(
    new NextRequest('http://localhost/api/v1/upload-document', { method: 'POST', body: form })
  );
  return { status: response.status, body: await response.json() };
}

/** The row a filing that landed leaves behind, at the path it chose. */
function landed(path: string, status = 'completed', at = Date.now() - 30_000) {
  rows.push({
    id: `doc-${rows.length + 1}`,
    vehicle_id: CAR,
    file_url: storedUrl(path),
    extraction_status: status,
    upload_date: new Date(at).toISOString(),
  });
}

describe('the filing key', () => {
  it('is minted in the shape the server accepts, and nothing else is accepted', () => {
    const key = mintFilingKey();
    expect(filingKeyToken(key)).toBe(key);
    expect(filingKeyToken(mintFilingKey(1_759_300_000_000, () => 0))).toBe('1759300000000-0');
    for (const bad of ['', 'abc', '123-abc', `${Date.now()}-ABC`, `${Date.now()}-abc-def`, `${Date.now()}-%`, null, 42]) {
      expect(filingKeyToken(bad)).toBeNull();
    }
  });
});

describe('a retry of a filing whose answer was lost (TL-31)', () => {
  it('is answered with the filed document, and nothing is stored again', async () => {
    const key = mintFilingKey();

    // The first attempt: stored under a name that carries the key.
    await post('saturday.pdf', key);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toContain(`-${key}-saturday.pdf`);

    // It landed — and the answer never arrived.
    landed(uploads[0]);

    const retry = await post('saturday.pdf', key);
    expect(retry).toEqual({ status: 200, body: { success: true, itemsExtracted: 1, documentId: 'doc-1' } });
    expect(uploads).toHaveLength(1);
  });

  it('keeps the key in the stored name however long the owner’s file name is', async () => {
    const key = mintFilingKey();
    const long = `${'Very Long Dealer Invoice Name '.repeat(8)}.pdf`;
    await post(long, key);
    expect(uploads[0]).toContain(`-${key}-`);
    landed(uploads[0]);
    await post(long, key);
    expect(uploads).toHaveLength(1);
  });

  it('a retry that overtook a filing still reading is a 409 with the sentence, and stores nothing', async () => {
    const key = mintFilingKey();
    await post('saturday.pdf', key);
    landed(uploads[0], 'pending');

    const retry = await post('saturday.pdf', key);
    expect(retry.status).toBe(409);
    expect(retry.body).toEqual({ success: false, error: FILING_IN_PROGRESS_MESSAGE, code: 'filing-in-progress' });
    expect(uploads).toHaveLength(1);
  });

  it('files again after a pending filing the platform must have killed', async () => {
    const key = mintFilingKey();
    await post('saturday.pdf', key);
    landed(uploads[0], 'pending', Date.now() - FILING_IN_FLIGHT_MS - 1_000);

    await post('saturday.pdf', key);
    expect(uploads).toHaveLength(2);
  });
});

describe('what must still file', () => {
  it('the same invoice chosen again later — a new key — is stored again', async () => {
    const first = mintFilingKey(Date.now() - 86_400_000);
    await post('receipt.pdf', first);
    landed(uploads[0]);

    await post('receipt.pdf', mintFilingKey());
    expect(uploads).toHaveLength(2);
  });

  it('a different invoice is stored, whatever was filed before it', async () => {
    const key = mintFilingKey();
    await post('brakes.pdf', key);
    landed(uploads[0]);

    await post('tyres.pdf', key.replace(/-[a-z0-9]+$/, '-zzzzzz'));
    expect(uploads).toHaveLength(2);
  });

  it('a caller that sends no key files exactly as before', async () => {
    await post('old-client.pdf');
    landed(uploads[0]);
    await post('old-client.pdf');
    expect(uploads).toHaveLength(2);
    expect(uploads[1]).toMatch(/\/invoices\/\d+-[a-z0-9]+-old-client\.pdf$/);
  });

  it('a malformed key is ignored, never matched as a pattern', async () => {
    landed(`${CAR}/invoices/1759300000000-abc123-anything.pdf`);
    await post('x.pdf', '%');
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).not.toContain('%');
  });
});
