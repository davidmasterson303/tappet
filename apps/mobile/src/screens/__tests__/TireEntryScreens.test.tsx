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
    expect(request).not.toHaveBeenCalled();
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
    expect(request.mock.calls[0][0]).toBe('/tires?setId=set-1');
    expect(request.mock.calls[0][1]).toMatchObject({ method: 'PATCH' });
  });

  it('lands a refusal from the route on the form', async () => {
    request.mockRejectedValue(new ApiRequestError({ status: 409, message: 'This car already has a set on record' }));
    const view = await render(<TireSetFormScreen vehicleId="v1" set={GOLF} onSaved={jest.fn()} onSignOut={jest.fn()} />);
    await userEvent.setup().press(view.getByLabelText('Save the changes'));
    await waitFor(() => expect(view.getByText('This car already has a set on record')).toBeTruthy());
  });
});

describe('the interval screen', () => {
  it('refuses a blank, names the card, and sends only the interval', async () => {
    request.mockResolvedValue({ set: { ...SET_ROW, rotation_interval_miles: 6000, interval_source: 'owner' } } as never);
    const onSaved = jest.fn();
    const view = await render(<TireIntervalScreen set={GOLF} onSaved={onSaved} onSignOut={jest.fn()} />);
    const user = userEvent.setup();
    const field = view.getByLabelText('Rotation interval, miles, from your warranty card');
    expect(field.props.value).toBe('');
    expect(field.props.placeholder).toBeUndefined();
    await user.press(view.getByLabelText('Save the interval'));
    expect(view.getByText('Enter the interval from your warranty card.')).toBeTruthy();
    expect(request).not.toHaveBeenCalled();

    await user.type(field, '600');
    await user.press(view.getByLabelText('Save the interval'));
    expect(view.getByText(/Check the digits/)).toBeTruthy();

    await user.clear(field);
    await user.type(field, '6,000');
    await user.press(view.getByLabelText('Save the interval'));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(request).toHaveBeenCalledWith('/tires?setId=set-1', { method: 'PATCH', body: { rotationIntervalMiles: 6000 } });
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
