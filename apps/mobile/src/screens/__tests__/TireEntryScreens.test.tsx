/**
 * The three entry screens — what they require, what they refuse, what they send.
 *
 * Every rule they apply lives in `@tappet/core/tires` and is proved there; these
 * hold the screens to *using* it: problems appear only after a save is
 * attempted, the payload is core's, nothing prefills the interval, and a
 * refusal from the route lands on the form rather than in an alert.
 */
import { render, userEvent, waitFor } from '@testing-library/react-native';

import { TireIntervalScreen } from '../TireIntervalScreen';
import { TireRotationScreen } from '../TireRotationScreen';
import { TireSetFormScreen } from '../TireSetFormScreen';
import { apiRequest, ApiRequestError } from '../../api/client';
import type { TireRotation, TireSet } from '@tappet/core/tires';
import { localToday } from '@tappet/core/garage-next-service';

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

const GOLF: TireSet = {
  id: 'set-1',
  vehicleId: 'v1',
  brand: 'Michelin',
  line: 'Pilot Sport 4S',
  sizeFront: '245/35R19',
  sizeRear: '245/35R19',
  installedOn: '2025-03-12',
  installOdometer: 54_232,
  purchasePlace: 'Discount Tire',
  rotationIntervalMiles: null,
  intervalSource: null,
  treadwearMilesEntered: null,
  provenance: 'typed',
};
const ROTATIONS: TireRotation[] = [
  { id: 'r1', setId: 'set-1', rotatedOn: '2025-06-28', odometer: 60_140, provenance: 'invoice' },
  { id: 'r2', setId: 'set-1', rotatedOn: '2025-11-09', odometer: 67_012, provenance: 'typed' },
];

const SET_ROW = {
  id: 'set-1', vehicle_id: 'v1', brand: 'Michelin', line: 'Pilot Sport 4S', size_front: '245/35R19', size_rear: '245/35R19',
  installed_on: null, install_odometer: null, purchase_place: null, rotation_interval_miles: null, interval_source: null,
  treadwear_miles_entered: null, provenance: 'typed',
};

beforeEach(() => {
  request.mockReset();
});

describe('the set form', () => {
  it('says nothing is wrong until a save is attempted, then names the three required fields', async () => {
    const view = await render(<TireSetFormScreen vehicleId="v1" onSaved={jest.fn()} onSignOut={jest.fn()} />);
    expect(view.queryByText('Say who makes the tire.')).toBeNull();
    await userEvent.setup().press(view.getByLabelText('Save the set'));
    expect(view.getByText('Say who makes the tire.')).toBeTruthy();
    expect(view.getByText('Say which tire it is — the name on the sidewall.')).toBeTruthy();
    expect(view.getByText('The size is on the sidewall — 245/35R19, for example.')).toBeTruthy();
    // Nothing written — the one call on mount is the help reading the car's schedule (21 Sep).
    expect(request.mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method)).toHaveLength(0);
  });

  it('prefills nothing in the interval, and sends the payload core builds — blank rear is the front', async () => {
    request.mockResolvedValue({ set: SET_ROW } as never);
    const onSaved = jest.fn();
    const view = await render(<TireSetFormScreen vehicleId="v1" onSaved={onSaved} onSignOut={jest.fn()} />);
    const user = userEvent.setup();
    expect(view.getByLabelText('Rotation interval, miles, from your warranty card').props.value).toBe('');
    await user.type(view.getByLabelText('Brand'), 'Michelin');
    await user.type(view.getByLabelText('Tire, the name on the sidewall'), 'Pilot Sport 4S');
    await user.type(view.getByLabelText('Size, front'), '245/35 r19');
    await user.press(view.getByLabelText('Save the set'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith('/tires', {
      method: 'POST',
      body: {
        vehicleId: 'v1',
        brand: 'Michelin',
        line: 'Pilot Sport 4S',
        sizeFront: '245/35R19',
        sizeRear: '245/35R19',
        installedOn: null,
        installOdometer: null,
        purchasePlace: null,
        rotationIntervalMiles: null,
        treadwearMilesEntered: null,
      },
    });
  });

  it('opens on the stored set when editing, and PATCHes it', async () => {
    request.mockResolvedValue({ set: SET_ROW } as never);
    const onSaved = jest.fn();
    const view = await render(<TireSetFormScreen vehicleId="v1" set={GOLF} onSaved={onSaved} onSignOut={jest.fn()} />);
    expect(view.getByLabelText('Brand').props.value).toBe('Michelin');
    expect(view.getByLabelText('Size, rear, blank if the same').props.value).toBe('');
    await userEvent.setup().press(view.getByLabelText('Save the changes'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const patch = request.mock.calls.find(([path]) => String(path).startsWith('/tires?setId='));
    expect(patch?.[0]).toBe('/tires?setId=set-1');
    expect(patch?.[1]).toMatchObject({ method: 'PATCH' });
  });

  it('lands a refusal from the route on the form', async () => {
    request.mockRejectedValue(new ApiRequestError({ status: 409, message: 'This car already has a set on record' }));
    const view = await render(<TireSetFormScreen vehicleId="v1" set={GOLF} onSaved={jest.fn()} onSignOut={jest.fn()} />);
    await userEvent.setup().press(view.getByLabelText('Save the changes'));
    await waitFor(() => expect(view.getByText('This car already has a set on record')).toBeTruthy());
  });
});

describe('the interval screen', () => {
  /** The writes only — the help under the field reads the car's schedule on mount (21 Sep). */
  const writes = () => request.mock.calls.filter(([, init]) => (init as { method?: string } | undefined)?.method === 'PATCH');

  it('refuses a blank, names the card, and sends only the interval', async () => {
    request.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/load-vehicle')) return { knowledge: { maintenance_schedule: [] } } as never;
      return { set: { ...SET_ROW, rotation_interval_miles: 6000, interval_source: 'owner' } } as never;
    });
    const onSaved = jest.fn();
    const view = await render(<TireIntervalScreen vehicleId="v1" set={GOLF} onSaved={onSaved} onSignOut={jest.fn()} />);
    const user = userEvent.setup();
    const field = view.getByLabelText('Rotation interval, miles, from your warranty card');
    expect(field.props.value).toBe('');
    expect(field.props.placeholder).toBeUndefined();
    await user.press(view.getByLabelText('Save the interval'));
    expect(view.getByText('Enter the interval from your warranty card.')).toBeTruthy();
    expect(writes()).toHaveLength(0);
    // A schedule with no rotation entry offers nothing; the fold still says where to look.
    expect(view.queryByText(/Your car's own schedule says/)).toBeNull();
    await user.press(view.getByLabelText('Show where to find the interval'));
    expect(view.getByText(/On the tire's warranty card/)).toBeTruthy();

    await user.type(field, '600');
    await user.press(view.getByLabelText('Save the interval'));
    expect(view.getByText(/Check the digits/)).toBeTruthy();

    await user.clear(field);
    await user.type(field, '6,000');
    await user.press(view.getByLabelText('Save the interval'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith('/tires?setId=set-1', { method: 'PATCH', body: { rotationIntervalMiles: 6000 } });
  });

  it('offers the car\'s own schedule figure, never fills it, and marks it as the vehicle\'s only when used as-is (21 Sep)', async () => {
    /*
      David: "I thought we were going to research the interval?" No — the
      module's rule holds, and the honest offer is the dossier's own figure
      where it has one. One tap uses it; the server checks the claim.
    */
    request.mockImplementation(async (path: string) => {
      if (String(path).startsWith('/load-vehicle')) {
        return { knowledge: { maintenance_schedule: [{ service: 'Tire Rotation', interval_miles: 6000 }] } } as never;
      }
      return { set: { ...SET_ROW, rotation_interval_miles: 6000, interval_source: 'vehicle' } } as never;
    });
    const onSaved = jest.fn();
    const view = await render(<TireIntervalScreen vehicleId="v1" set={GOLF} onSaved={onSaved} onSignOut={jest.fn()} />);
    const user = userEvent.setup();
    const field = view.getByLabelText('Rotation interval, miles, from your warranty card');

    await view.findByText(/Your car's own schedule says every 6,000 miles/);
    expect(field.props.value).toBe('');

    await user.press(view.getByLabelText('Use 6,000 MI'));
    expect(view.getByLabelText('Rotation interval, miles, from your warranty card').props.value).toBe('6000');
    await user.press(view.getByLabelText('Save the interval'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(writes()[0]).toEqual(['/tires?setId=set-1', { method: 'PATCH', body: { rotationIntervalMiles: 6000, intervalSource: 'vehicle' } }]);

    // Typed over: the number is the owner's, and no source is claimed.
    const again = await render(<TireIntervalScreen vehicleId="v1" set={GOLF} onSaved={onSaved} onSignOut={jest.fn()} />);
    await again.findByText(/Your car's own schedule says/);
    await user.type(again.getByLabelText('Rotation interval, miles, from your warranty card'), '5000');
    await user.press(again.getByLabelText('Save the interval'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    expect(writes()[1][1]).toEqual({ method: 'PATCH', body: { rotationIntervalMiles: 5000, intervalSource: undefined } });
  });
});

describe('the rotation screen', () => {
  it('opens on today at the car’s reading, refuses a reading below the record by name, and logs', async () => {
    request.mockResolvedValue({ rotation: { id: 'r3', set_id: 'set-1', rotated_on: localToday(), odometer: 78_412, provenance: 'typed' } } as never);
    const onSaved = jest.fn();
    const view = await render(
      <TireRotationScreen set={GOLF} rotations={ROTATIONS} currentMileage={78_412} onSaved={onSaved} onSignOut={jest.fn()} />
    );
    const user = userEvent.setup();
    const date = view.getByLabelText('Rotated on, YYYY-MM-DD');
    const odometer = view.getByLabelText('Odometer, miles, at least 67,012 mi');
    expect(date.props.value).toBe(localToday());
    expect(odometer.props.value).toBe('78412');

    await user.clear(odometer);
    await user.type(odometer, '66000');
    await user.press(view.getByLabelText('Log the rotation'));
    expect(view.getByText('Below the 67,012 miles already on record for this set.')).toBeTruthy();
    expect(request).not.toHaveBeenCalled();

    await user.clear(odometer);
    await user.type(odometer, '78412');
    await user.press(view.getByLabelText('Log the rotation'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith('/tires/rotations', {
      method: 'POST',
      body: { setId: 'set-1', rotatedOn: localToday(), odometer: 78_412 },
    });
  });

  it('opens blank when the car has no reading, and says what the floor is', async () => {
    const view = await render(
      <TireRotationScreen set={GOLF} rotations={[]} currentMileage={null} onSaved={jest.fn()} onSignOut={jest.fn()} />
    );
    expect(view.getByLabelText('Odometer, miles, at least 54,232 mi').props.value).toBe('');
  });
});
