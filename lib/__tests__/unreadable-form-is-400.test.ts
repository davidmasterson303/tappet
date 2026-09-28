/**
 * An upload whose body cannot be read is the caller's mistake: 400, not 500.
 *
 * @jest-environment node
 *
 * Found probing the live `/api/v1/invoice-pages` on 28 Sep: a POST with no
 * multipart body answered **500 "Failed to store the page."** The form parse
 * sat inside the route's catch-all, so a request that never reached storage
 * reported a storage failure. `/api/v1/upload-document` had the same shape.
 *
 * Executed, not read from source — the defect was in what the route
 * *answers*. Rate limiting and authorization are stubbed to "allowed" and
 * "denied (401)": the unreadable case must answer before either matters, and
 * the readable case proves the parse lets a real form through to the next
 * step, so a route that refused every body could not pass.
 */

jest.mock('@/lib/rate-limit', () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true })),
  getClientIdentifier: jest.fn(() => 'test'),
  rateLimitResponse: jest.fn(),
}));

jest.mock('@/lib/api-auth', () => ({
  authorizeVehicleAccess: jest.fn(async () => ({
    ok: false,
    response: new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 }),
  })),
}));

// Never reached by these requests; stubbed so importing the route stays cheap.
jest.mock('@/app/actions', () => ({ uploadInvoice: jest.fn(), uploadInvoicePages: jest.fn() }));

import type { NextRequest } from 'next/server';
import { POST as postPage } from '@/app/api/v1/invoice-pages/route';
import { POST as postDocument } from '@/app/api/v1/upload-document/route';

const ROUTES = [
  ['/api/v1/invoice-pages', postPage],
  ['/api/v1/upload-document', postDocument],
] as const;

const request = (path: string, init: RequestInit) =>
  new Request(`http://localhost${path}`, { method: 'POST', ...init }) as unknown as NextRequest;

describe.each(ROUTES)('%s', (path, post) => {
  it('answers 400 to a POST with no body', async () => {
    const response = await post(request(path, {}));
    expect(response.status).toBe(400);
  });

  it('answers 400 to a body that claims to be a form and is not one', async () => {
    const response = await post(
      request(path, { headers: { 'content-type': 'multipart/form-data; boundary=x' }, body: 'not a form' })
    );
    expect(response.status).toBe(400);
  });

  it('can still read a real form — it gets past the parse to authorization', async () => {
    const form = new FormData();
    form.append('vehicleId', '00000000-0000-4000-8000-000000000000');
    form.append('file', new File(['x'], 'page.jpg', { type: 'image/jpeg' }));

    const response = await post(request(path, { body: form }));

    // The stubbed authorizer's 401: the form was read, and nothing refused it early.
    expect(response.status).toBe(401);
  });
});
