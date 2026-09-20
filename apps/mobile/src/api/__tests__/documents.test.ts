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
import { uploadInvoice } from '../documents';

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
