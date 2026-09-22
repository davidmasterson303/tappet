import { act, render, userEvent, waitFor } from '@testing-library/react-native';
import * as RN from 'react-native';

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

/**
 * ── The photograph's acts, here since 22 Sep ────────────────────────────────
 *
 * They lived on the hub — one control in the nav over the plate, a sheet
 * holding Remove, an optimistic plate with its revert. Off the hub (the
 * lenses' cut, twice) they are two plain buttons on the car's details: add
 * or change, and remove where there is an owner's photograph to remove.
 * Pinned: a dismissed picker is not an error; a pick uploads through
 * `POST /upload-photo` and reloads; Remove asks first in words that say what
 * the car will show, then deletes and reloads; a refusal is a banner and the
 * screen stays; a car on its plate offers no Remove.
 */
describe('the photograph', () => {
  const PHOTO = 'https://signed.test/car.jpg';

  function serve(vehicle: Record<string, unknown>, onWrite: (init?: { method?: string }) => Promise<unknown> = () => Promise.resolve({ success: true })) {
    request.mockImplementation((path: string, init?: { method?: string }) => {
      if (path.startsWith('/upload-photo')) return onWrite(init) as never;
      if (path.startsWith('/load-vehicle')) return Promise.resolve({ vehicle: { ...VEHICLE.vehicle, ...vehicle } }) as never;
      return Promise.resolve({ success: true }) as never;
    });
  }
  const loads = () => request.mock.calls.filter(([p]) => String(p).startsWith('/load-vehicle')).length;

  it('offers Add photo on a plate, and nothing to remove', async () => {
    serve({ photo_url: PHOTO, photo_kind: 'plate' });
    const { view } = await mount({ pickPhoto: jest.fn() });
    await (await view).findByText('The car stands on its plate.');
    expect((await view).getByLabelText('Add photo')).toBeTruthy();
    expect((await view).queryByLabelText(/Remove photo/)).toBeNull();
  });

  it('a dismissed picker is not an error', async () => {
    const user = userEvent.setup();
    const pickPhoto = jest.fn().mockResolvedValue(null);
    serve({ photo_url: PHOTO, photo_kind: 'plate' });
    const { view } = await mount({ pickPhoto });
    await user.press(await (await view).findByLabelText('Add photo'));
    expect(pickPhoto).toHaveBeenCalledTimes(1);
    expect((await view).queryByText(/was not saved/)).toBeNull();
    expect(request.mock.calls.some(([p]) => String(p).startsWith('/upload-photo'))).toBe(false);
  });

  it('uploads the pick and asks the API what stands on the car', async () => {
    const user = userEvent.setup();
    const pickPhoto = jest.fn().mockResolvedValue({ uri: 'file:///tmp/car.jpg', name: 'car.jpg', type: 'image/jpeg' });
    serve({ photo_url: PHOTO, photo_kind: 'plate' });
    const { view } = await mount({ pickPhoto });
    const add = await (await view).findByLabelText('Add photo');
    const before = loads();
    await user.press(add);

    await waitFor(() => expect(loads()).toBe(before + 1));
    expect(request.mock.calls.some(([p, init]) => String(p).startsWith('/upload-photo') && (init as { method?: string } | undefined)?.method === 'POST')).toBe(true);
  });

  it('asks once, in words that say what the car will show, then removes and reloads', async () => {
    const user = userEvent.setup();
    const alert = jest.spyOn(RN.Alert, 'alert').mockImplementation(() => {});
    serve({ photo_url: PHOTO, photo_kind: 'owner' });
    const { view } = await mount({ pickPhoto: jest.fn() });
    await (await view).findByText('Your photograph is on the car.');
    const before = loads();

    await user.press((await view).getByLabelText('Remove photo. Asks first.'));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe('Remove this photo?');
    expect(alert.mock.calls[0][1]).toBe('The car will stand on its plate.');
    // Nothing sent until the confirm.
    expect(request.mock.calls.some(([, init]) => (init as { method?: string } | undefined)?.method === 'DELETE')).toBe(false);

    const buttons = alert.mock.calls[0][2] as Array<{ text?: string; onPress?: () => void }>;
    await act(async () => buttons.find((b) => b.text === 'Remove')?.onPress?.());

    await waitFor(() => expect(loads()).toBe(before + 1));
    expect(request.mock.calls.some(([p, init]) => String(p).startsWith('/upload-photo') && (init as { method?: string } | undefined)?.method === 'DELETE')).toBe(true);
    alert.mockRestore();
  });

  it('says so and keeps the screen when the removal fails', async () => {
    const user = userEvent.setup();
    const alert = jest.spyOn(RN.Alert, 'alert').mockImplementation(() => {});
    serve({ photo_url: PHOTO, photo_kind: 'owner' }, (init) =>
      init?.method === 'DELETE' ? Promise.reject(new Error('Storage refused it')) : Promise.resolve({ success: true })
    );
    const { view } = await mount({ pickPhoto: jest.fn() });
    await user.press(await (await view).findByLabelText('Remove photo. Asks first.'));
    const buttons = alert.mock.calls[0][2] as Array<{ text?: string; onPress?: () => void }>;
    await act(async () => buttons.find((b) => b.text === 'Remove')?.onPress?.());

    await (await view).findByText('That photo was not removed');
    await (await view).findByText('Storage refused it');
    // Still the owner's photograph, still a Remove to try again.
    expect((await view).getByLabelText('Remove photo. Asks first.')).toBeTruthy();
    alert.mockRestore();
  });
});
