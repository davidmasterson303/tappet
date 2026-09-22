import { render, userEvent, waitFor } from '@testing-library/react-native';

import { VehicleProfileScreen } from '../VehicleProfileScreen';
import { apiRequest } from '../../api/client';

/**
 * THIS CAR — the car's details (22 Sep).
 *
 * The profile was the owner's answers alone. The hub's three lenses put the
 * odometer here with its as-of (value V1: *"every countdown is only as true
 * as 168,400, and nothing says when that was set or lets the owner set it"*)
 * and the removal at the foot (UX U8, IA I7, value V8: *"once per car, not
 * daily; behind the edit door"*). What this pins: the odometer is a field
 * with the reading's age in its hint; a changed reading goes through the
 * route's mileage path on its own — `currentMileage` alone in the body, the
 * split the route branches on — before the answers; a reading that goes
 * backwards is refused by the rule's own sentence and nothing is sent; the
 * removal is offered last and opens the confirmation rather than acting.
 */

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});
const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

const VEHICLE = {
  vehicle: {
    id: 'v1',
    current_mileage: 168_400,
    last_mileage_update_date: new Date(Date.now() - 21 * 86_400_000).toISOString(),
    avg_miles_per_month: 500,
    vehicle_status: 'daily_driver',
    performance_mindedness: 'mild',
    ownership_objective: 'Keep forever',
  },
};

function mount(extra: Partial<Parameters<typeof VehicleProfileScreen>[0]> = {}) {
  const props = { vehicleId: 'v1', onSignOut: jest.fn(), onSaved: jest.fn(), ...extra };
  return { props, view: render(<VehicleProfileScreen {...props} />) };
}

beforeEach(() => {
  request.mockReset();
  request.mockImplementation((path: string) => {
    if (path.startsWith('/load-vehicle')) return Promise.resolve(VEHICLE) as never;
    return Promise.resolve({ success: true }) as never;
  });
});

describe('the odometer', () => {
  it('is a field, with the reading and how old it is', async () => {
    const { view } = await mount();
    const field = await (await view).findByLabelText(/^Odometer/);
    expect(field.props.value).toBe('168400');
    await (await view).findByText(/miles · set 3 wk ago/);
  });

  it('sends a changed reading through the mileage path on its own, before the answers', async () => {
    const user = userEvent.setup();
    const { props, view } = await mount();
    const field = await (await view).findByLabelText(/^Odometer/);

    await user.clear(field);
    await user.type(field, '169100');
    await user.press((await view).getByText('Save'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    const patches = request.mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    // `currentMileage` alone: the route reads its presence as "a reading, not the profile".
    expect(patches[0][1]).toMatchObject({ body: { vehicleId: 'v1', currentMileage: 169_100 } });
    expect((patches[0][1] as { body: Record<string, unknown> }).body).not.toHaveProperty('avgMilesPerMonth');
  });

  it('refuses a reading that goes backwards with the rule\'s own words, and sends nothing', async () => {
    const user = userEvent.setup();
    const { props, view } = await mount();
    const field = await (await view).findByLabelText(/^Odometer/);

    await user.clear(field);
    await user.type(field, '160000');
    await user.press((await view).getByText('Save'));

    await (await view).findByText('Not saved');
    await (await view).findByText(/below the 168,400 miles already recorded/);
    expect(props.onSaved).not.toHaveBeenCalled();
    expect(request.mock.calls.some(([, init]) => (init as { method?: string } | undefined)?.method === 'PATCH')).toBe(false);
  });

  it('is left alone when it did not change — the answers save as before', async () => {
    const user = userEvent.setup();
    const { props, view } = await mount();
    const avg = await (await view).findByLabelText(/^Average per month/);

    await user.clear(avg);
    await user.type(avg, '600');
    await user.press((await view).getByText('Save'));

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledTimes(1));
    const patches = request.mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method === 'PATCH');
    expect(patches).toHaveLength(1);
    expect(patches[0][1]).toMatchObject({ body: { vehicleId: 'v1', avgMilesPerMonth: 600 } });
    expect((patches[0][1] as { body: Record<string, unknown> }).body).not.toHaveProperty('currentMileage');
  });
});

describe('removing the car', () => {
  it('offers the removal last, and it opens the confirmation rather than acting', async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    const { view } = await mount({ onRemove });

    await user.press(await (await view).findByText('Remove this car'));

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(request.mock.calls.some(([, init]) => (init as { method?: string } | undefined)?.method === 'DELETE')).toBe(false);
  });

  it('offers nothing to remove where the navigator handed no way to', async () => {
    const { view } = await mount();
    await (await view).findByLabelText(/^Odometer/);
    expect((await view).queryByText('Remove this car')).toBeNull();
  });
});
