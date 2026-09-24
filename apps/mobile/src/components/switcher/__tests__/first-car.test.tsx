/**
 * `FirstCar` tells the two empty states apart, and says nothing in between.
 *
 * ── 23 Sep · "No cars yet" for every returning owner ─────────────────────────
 *
 * `useCarSet` returned only the rows, so an empty hold on a cold start and
 * "read, and there are none" were the same value — and every returning owner
 * saw the invitation with ADD A CAR as its primary for the length of the
 * first round trip, and permanently when the read failed. The hook now
 * reports a status; this pins what the screen does with each one.
 */
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import FirstCar from '../FirstCar';
import { apiRequest } from '../../../api/client';

jest.mock('../../../api/client', () => {
  const actual = jest.requireActual('../../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

beforeEach(() => {
  request.mockReset();
});

describe('FirstCar', () => {
  it('says the read failed rather than that there are no cars', async () => {
    request.mockRejectedValue(new Error('offline'));
    const onAddCar = jest.fn();
    const view = await render(<FirstCar onOpenCar={jest.fn()} onAddCar={onAddCar} />);

    expect(await view.findByText('Could not read your cars')).toBeTruthy();
    expect(view.queryByText('No cars yet')).toBeNull();

    // The way out is the read again, not a new car.
    await fireEvent.press(view.getByText('Try again'));
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(onAddCar).not.toHaveBeenCalled();
  });

  it('draws nothing while the set is in flight', async () => {
    request.mockReturnValue(new Promise(() => undefined) as never);
    const view = await render(<FirstCar onOpenCar={jest.fn()} onAddCar={jest.fn()} />);

    expect(view.queryByText('No cars yet')).toBeNull();
    expect(view.queryByText('Could not read your cars')).toBeNull();
  });

  it('invites once the set has been read and is empty', async () => {
    request.mockResolvedValue({ vehicles: [] } as never);
    const view = await render(<FirstCar onOpenCar={jest.fn()} onAddCar={jest.fn()} />);

    expect(await view.findByText('No cars yet')).toBeTruthy();
    expect(view.getByText('Add a car')).toBeTruthy();
  });

  it('opens the first car when there is one', async () => {
    // Last, because a successful read seeds the module-level hold.
    request.mockResolvedValue({
      vehicles: [{ id: 'v1', year: 2003, make: 'Honda', model: 'Accord', vehicle_health_summary: null }],
    } as never);
    const onOpenCar = jest.fn();
    const view = await render(<FirstCar onOpenCar={onOpenCar} onAddCar={jest.fn()} />);

    await waitFor(() => expect(onOpenCar).toHaveBeenCalledWith('v1', expect.stringContaining('Accord')));
    expect(view.queryByText('No cars yet')).toBeNull();
  });
});
