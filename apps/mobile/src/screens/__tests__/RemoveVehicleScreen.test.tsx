/**
 * The removal confirmation quotes rows, removes through the route, and
 * keeps the car when the route refuses.
 */
import { act, render, userEvent, waitFor } from '@testing-library/react-native';
import { apiRequest, ApiRequestError } from '../../api/client';
import { RemoveVehicleScreen } from '../RemoveVehicleScreen';

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

const INVENTORY = {
  vehicle: { id: 'v1', year: 2003, make: 'Honda', model: 'Accord' },
  openRecalls: 24,
  markedRepaired: 1,
  serviceRecords: 6,
  receiptPhotographs: 3,
  hasHealthScore: true,
  hasSchedule: true,
  advisorThreads: 0,
  needs: 0,
};

function respond(inventory: unknown = INVENTORY) {
  request.mockImplementation(async (path: string, init?: { method?: string }) => {
    if (init?.method === 'DELETE') return { success: true, removed: { storageObjects: 3 } } as never;
    if (String(path).startsWith('/vehicle-removal')) return { inventory } as never;
    return {} as never;
  });
}

async function mount(extra: Partial<Parameters<typeof RemoveVehicleScreen>[0]> = {}) {
  const props = { vehicleId: 'v1', onSignOut: jest.fn(), onRemoved: jest.fn(), onKeep: jest.fn(), ...extra };
  const view = await render(<RemoveVehicleScreen {...props} />);
  return { props, view };
}

beforeEach(() => request.mockReset());

describe('what it says', () => {
  it('names the car and quotes what goes, from the inventory', async () => {
    respond();
    const { view } = await mount();
    await waitFor(() => view.getByText('Remove the 2003 Honda Accord?'));
    view.getByText('24 open recalls and what you have marked repaired');
    view.getByText('6 service records');
    view.getByText('3 receipt photographs');
    view.getByText('its health score and maintenance schedule');
    view.getByText('This cannot be undone.');
    expect(view.queryByText(/advisor thread/)).toBeNull();
    expect(request.mock.calls[0][0]).toBe('/vehicle-removal?vehicleId=v1');
  });

  it('draws no line for a count it could not read, and says the list is incomplete', async () => {
    respond({ ...INVENTORY, receiptPhotographs: null });
    const { view } = await mount();
    await waitFor(() => view.getByText('Remove the 2003 Honda Accord?'));
    expect(view.queryByText(/photograph/)).toBeNull();
    view.getByText(/could not be counted just now/);
  });

  it('a car with nothing on file says so rather than listing zeros', async () => {
    respond({ ...INVENTORY, openRecalls: 0, markedRepaired: 0, serviceRecords: 0, receiptPhotographs: 0, hasHealthScore: false, hasSchedule: false });
    const { view } = await mount();
    await waitFor(() => view.getByText('Nothing else is on file for it.'));
    expect(view.queryByText(/This also removes/)).toBeNull();
  });
});

describe('what it does', () => {
  it('removes through DELETE on the same route, then hands off to the garage', async () => {
    respond();
    const user = userEvent.setup();
    const { props, view } = await mount();
    await waitFor(() => view.getByText('Remove the 2003 Honda Accord?'));
    await user.press(view.getByText('Remove this car'));
    await waitFor(() => expect(props.onRemoved).toHaveBeenCalledTimes(1));
    const del = request.mock.calls.find(([, init]) => (init as { method?: string } | undefined)?.method === 'DELETE');
    expect(del?.[0]).toBe('/vehicle-removal?vehicleId=v1');
  });

  it('keeps the car and shows the route’s own sentence when the purge is refused', async () => {
    request.mockImplementation(async (path: string, init?: { method?: string }) => {
      if (init?.method === 'DELETE') {
        throw new ApiRequestError({ status: 409, message: 'Could not remove every receipt photograph, so nothing was removed. Try again.', origin: 'server' });
      }
      return { inventory: INVENTORY } as never;
    });
    const user = userEvent.setup();
    const { props, view } = await mount();
    await waitFor(() => view.getByText('Remove the 2003 Honda Accord?'));
    await user.press(view.getByText('Remove this car'));
    await waitFor(() => view.getByText(/nothing was removed/));
    expect(props.onRemoved).not.toHaveBeenCalled();
    // The car is still there to keep.
    view.getByText('Keep it');
  });

  it('Keep it goes back without touching the route', async () => {
    respond();
    const user = userEvent.setup();
    const { props, view } = await mount();
    await waitFor(() => view.getByText('Keep it'));
    await user.press(view.getByText('Keep it'));
    expect(props.onKeep).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.some(([, init]) => (init as { method?: string } | undefined)?.method === 'DELETE')).toBe(false);
  });

  it('signs out on a device 401 rather than showing an error nobody can act on', async () => {
    request.mockImplementation(async () => {
      throw new ApiRequestError({ status: 401, message: 'Not signed in', origin: 'device' });
    });
    const { props } = await mount();
    await waitFor(() => expect(props.onSignOut).toHaveBeenCalled());
  });
});
