/**
 * The upload's mismatch answer names both cars (QE 2.14, 20 Sep).
 *
 * The route sends `extractedVehicle` and `expectedVehicle` as strings —
 * "2020 Subaru WRX", "2009 Mazda Mazda3" — and the parser wanted objects,
 * so a real mismatch read "for an unrecognised vehicle, but you are adding
 * it to an unrecognised vehicle".
 */
const mockApiRequest = jest.fn();

jest.mock('../client', () => {
  class ApiRequestError extends Error {
    status: number;
    origin: string;
    constructor({ status, origin = 'server' }: { status: number; message: string; origin?: string }) {
      super(`status ${status}`);
      this.status = status;
      this.origin = origin;
    }
  }
  return { ApiRequestError, apiRequest: (...args: unknown[]) => mockApiRequest(...args) };
});
import { invoiceUrl, uploadInvoice } from '../documents';

const FILE = { uri: 'file:///invoice.jpg', name: 'invoice.jpg', type: 'image/jpeg', size: 1000 };

beforeEach(() => mockApiRequest.mockReset());

it('reads the route’s string labels into the mismatch prompt', async () => {
  mockApiRequest.mockResolvedValue({
    success: false,
    error: 'VEHICLE_MISMATCH',
    message: 'Vehicle information does not match',
    extractedVehicle: '2020 Subaru WRX',
    expectedVehicle: '2009 Mazda Mazda3',
  });
  const result = await uploadInvoice({ vehicleId: 'v1', file: FILE as never });
  expect(result.status).toBe('vehicle-mismatch');
  if (result.status !== 'vehicle-mismatch') return;
  expect(result.extracted?.label).toBe('2020 Subaru WRX');
  expect(result.expected?.label).toBe('2009 Mazda Mazda3');
});

it('still reads an object, and treats the route’s "Unknown vehicle" as unknown', async () => {
  mockApiRequest.mockResolvedValue({
    success: false,
    error: 'VEHICLE_MISMATCH',
    extractedVehicle: { year: 2015, make: 'BMW', model: 'M235i' },
    expectedVehicle: 'Unknown vehicle',
  });
  const result = await uploadInvoice({ vehicleId: 'v1', file: FILE as never });
  if (result.status !== 'vehicle-mismatch') throw new Error(result.status);
  expect(result.extracted).toMatchObject({ year: 2015, make: 'BMW', model: 'M235i' });
  expect(result.expected).toBeNull();
});

/*
  ── 27 Sep · pages ──────────────────────────────────────────────────────────

  A page is stored on its own and the filing names the stored paths. What
  must hold: the filing is JSON naming the paths in order, the mismatch's
  override travels only when the owner gave it, a server that lost a page
  says so by code and the phone hears it as `PageMissingError`, and a page
  the server cannot embed never leaves the phone.
*/
describe('pages', () => {
  // Required lazily so the mock above is the client they see.
  const docs = () => require('../documents') as typeof import('../documents');

  it('files the paths as JSON, in order, with no override unless confirmed', async () => {
    mockApiRequest.mockResolvedValue({ success: true, itemsExtracted: 9, documentId: 'd1', pageCount: 2 });
    const result = await docs().fileInvoicePages({ vehicleId: 'v1', pagePaths: ['a', 'b'] });

    expect(mockApiRequest).toHaveBeenCalledWith(
      '/upload-document',
      expect.objectContaining({ method: 'POST', body: { vehicleId: 'v1', pagePaths: ['a', 'b'] } })
    );
    expect(result).toMatchObject({ status: 'uploaded', itemsExtracted: 9, pageCount: 2 });
  });

  it('sends the override when the owner confirmed the car', async () => {
    mockApiRequest.mockResolvedValue({ success: true, itemsExtracted: 1 });
    await docs().fileInvoicePages({ vehicleId: 'v1', pagePaths: ['a'], confirmVehicle: true });
    expect(mockApiRequest.mock.calls[0][1].body).toEqual({ vehicleId: 'v1', pagePaths: ['a'], bypassVehicleCheck: true });
  });

  it('hears a lost page by its code', async () => {
    const { ApiRequestError } = jest.requireMock('../client');
    const lost = Object.assign(new ApiRequestError({ status: 400, message: 'PAGE_MISSING' }), { code: 'page-missing' });
    mockApiRequest.mockRejectedValue(lost);
    await expect(docs().fileInvoicePages({ vehicleId: 'v1', pagePaths: ['a'] })).rejects.toBeInstanceOf(
      docs().PageMissingError
    );
  });

  it('and does not mistake any other 400 for one', async () => {
    const { ApiRequestError } = jest.requireMock('../client');
    mockApiRequest.mockRejectedValue(new ApiRequestError({ status: 400, message: 'Missing pagePaths' }));
    await expect(docs().fileInvoicePages({ vehicleId: 'v1', pagePaths: ['a'] })).rejects.not.toBeInstanceOf(
      docs().PageMissingError
    );
  });

  it('refuses a page the server cannot embed before it leaves the phone', async () => {
    await expect(
      docs().uploadInvoicePage('v1', { uri: 'file:///x.webp', name: 'x.webp', type: 'image/webp' })
    ).rejects.toThrow('That file type cannot be read');
    expect(mockApiRequest).not.toHaveBeenCalled();
  });

  it('resolves a stored page to its path', async () => {
    mockApiRequest.mockResolvedValue({ success: true, path: 'v1/invoices/pages/1-a.jpg' });
    await expect(docs().uploadInvoicePage('v1', FILE as never)).resolves.toBe('v1/invoices/pages/1-a.jpg');
  });
});

describe('invoiceUrl — audit 360, TL-9', () => {
  it('says a 404 is the invoice being gone, not the API being old', async () => {
    const { ApiRequestError } = jest.requireMock('../client');
    mockApiRequest.mockRejectedValue(new ApiRequestError({ status: 404, message: 'Not found' }));

    const answer = await invoiceUrl('v1', 'd1');

    expect(answer).toEqual({ error: 'That invoice is no longer here.' });
    expect(JSON.stringify(answer)).not.toMatch(/newer version|API/);
  });

  it('still opens one that is there (anti-vacuous)', async () => {
    mockApiRequest.mockResolvedValue({ success: true, url: 'https://signed.example/invoice.pdf' });
    await expect(invoiceUrl('v1', 'd1')).resolves.toEqual({ url: 'https://signed.example/invoice.pdf' });
  });
});
