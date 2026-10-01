/**
 * A rate-limited invoice read is answered 429, not 500 (audit 360, TL-35).
 *
 * @jest-environment node
 *
 * `parseInvoiceLineItems` refuses with `code: 'rate-limited'` (COPY-18);
 * `fileStoredInvoice` dropped the code on its generic branch and the route's
 * `respond` had no mapping for it, so the limiter's sentence left as a 500.
 *
 * Executed: the route with the filing action stubbed to return what
 * `fileStoredInvoice` now returns, plus a source read of `fileStoredInvoice`
 * that the code survives its generic branch (the function is not exported:
 * it trusts its callers' proofs).
 */

jest.mock('@/lib/api-auth', () => ({
  authorizeVehicleAccess: jest.fn(async () => ({ ok: true })),
}));
jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: async () => ({ allowed: true }),
  getClientIdentifier: () => 'test',
  rateLimitResponse: () => new Response(null, { status: 429 }),
}));
const filing = jest.fn();
jest.mock('@/app/actions', () => ({
  uploadInvoice: (...a: unknown[]) => filing(...a),
  uploadInvoicePages: (...a: unknown[]) => filing(...a),
}));

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/upload-document/route';
import { AI_RATE_LIMITED_MESSAGE, RATE_LIMITED_CODE } from '@tappet/core/ai/advisor-failure';

const CAR = '7f4c2a10-1111-4222-8333-944455556666';

function pagesRequest() {
  return new NextRequest('http://localhost/api/v1/upload-document', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ vehicleId: CAR, pagePaths: [`${CAR}/invoices/pages/1700000000000-abc-p1.jpg`] }),
  });
}

describe('the upload route and the AI limiter (TL-35)', () => {
  it('answers 429 with the sentence and the code', async () => {
    filing.mockResolvedValue({ success: false, error: AI_RATE_LIMITED_MESSAGE, code: RATE_LIMITED_CODE });
    const response = await POST(pagesRequest());
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: AI_RATE_LIMITED_MESSAGE, code: RATE_LIMITED_CODE });
  });

  it('can still answer 500 — an uncoded failure is not read as the limiter', async () => {
    filing.mockResolvedValue({ success: false, error: 'Tappet could not read that invoice.' });
    const response = await POST(pagesRequest());
    expect(response.status).toBe(500);
  });

  it('fileStoredInvoice keeps the limiter’s code on the way out', () => {
    const source = readFileSync(join(__dirname, '..', '..', 'app', 'actions.ts'), 'utf8');
    const start = source.indexOf('async function fileStoredInvoice(');
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf('const itemsExtracted', start));
    expect(body.length).toBeGreaterThan(500);
    expect(body).toMatch(/parseResult\.code === RATE_LIMITED_CODE[\s\S]{0,200}code: parseResult\.code/);
  });
});
