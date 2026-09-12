/**
 * Taking the photograph back off the car.
 *
 * The upload half of this module is tested from the root runner
 * (`lib/__tests__/vehicle-photo-upload.test.ts`), beside the route it talks
 * to. This is the removal half, added 11 Sep for David's *"i can't delete the
 * image i uploaded on the app"* — and what is worth pinning is the shape on
 * the wire and the two things the function refuses to do: invent a URL for
 * what now stands on the car, and swallow the error the screen keys sign-out
 * off.
 */

/* Must be `mock`-prefixed: jest hoists the factory above this declaration. */
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
  return {
    ApiRequestError,
    apiRequest: (...args: unknown[]) => mockApiRequest(...args),
  };
});

import { ApiRequestError } from '../client';
import { VehiclePhotoError, removeVehiclePhoto } from '../photos';

beforeEach(() => mockApiRequest.mockReset());

describe('removeVehiclePhoto', () => {
  it('sends DELETE to the upload route with the vehicle in a JSON body', async () => {
    /*
      The route reads `request.json()`, and the body is the web action's own
      `{ vehicleId }` — not the query-string shape `recalls` uses, and not the
      multipart the upload sends. The wrong one of those is a 400 that reads
      as "Missing vehicleId" on a call that plainly supplied it.
    */
    mockApiRequest.mockResolvedValue({ success: true });

    await removeVehiclePhoto('vehicle-1');

    expect(mockApiRequest).toHaveBeenCalledWith('/upload-photo', {
      method: 'DELETE',
      body: { vehicleId: 'vehicle-1' },
    });
  });

  it('resolves to nothing rather than guessing what now stands on the car', async () => {
    /*
      The upload returns a signed URL; a removal must not return one. What
      replaces the photograph — stock image, generation plate, house plate —
      is the API's decision on the next read, and a value returned here would
      be this client's second opinion. Callers refetch.
    */
    mockApiRequest.mockResolvedValue({ success: true });

    await expect(removeVehiclePhoto('vehicle-1')).resolves.toBeUndefined();
  });

  it('prefers the server’s sentence on a 200-shaped failure', async () => {
    mockApiRequest.mockResolvedValue({ success: false, error: 'Failed to remove photo' });

    await expect(removeVehiclePhoto('vehicle-1')).rejects.toThrow('Failed to remove photo');
    await expect(removeVehiclePhoto('vehicle-1')).rejects.toBeInstanceOf(VehiclePhotoError);
  });

  it('has a sentence of its own when the failure carries none', async () => {
    mockApiRequest.mockResolvedValue({ success: false });

    await expect(removeVehiclePhoto('vehicle-1')).rejects.toThrow('That photo could not be removed.');
  });

  it('lets a request failure through untouched', async () => {
    /*
      Anti-vacuous for the rule above: the belt only catches the 200-shaped
      `success: false`. A thrown `ApiRequestError` keeps its class and its
      status, because the screen reads `isLocallySignedOut` off it and a
      re-wrapped error would turn a signed-out device into a banner.
    */
    mockApiRequest.mockRejectedValue(new ApiRequestError({ status: 401, message: 'Not signed in', origin: 'device' }));

    await expect(removeVehiclePhoto('vehicle-1')).rejects.toMatchObject({ status: 401, origin: 'device' });
    await expect(removeVehiclePhoto('vehicle-1')).rejects.toBeInstanceOf(ApiRequestError);
  });
});
