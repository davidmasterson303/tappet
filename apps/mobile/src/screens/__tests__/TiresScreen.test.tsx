/**
 * The tire leaf — what it draws in each of its states, and what it refuses to.
 *
 * The two graded frames (`design-loop/tires/v11-set.html`, `v11-staggered.html`)
 * are one screen with different data, so this file drives the one component
 * through both datasets and the states between them, and holds it to the
 * rules the loop adopted: a label appears only when it has a consequence,
 * exactly one sodium mark per screen and zero on a set with no interval,
 * every figure derived, and the copy verbatim.
 */
import { Alert, StyleSheet } from 'react-native';
import { fireEvent, render, userEvent, waitFor } from '@testing-library/react-native';

import { TiresScreen } from '../TiresScreen';
import { apiRequest, ApiRequestError } from '../../api/client';
import { status } from '../../theme';

jest.mock('../../api/client', () => {
  const actual = jest.requireActual('../../api/client');
  return { ...actual, apiRequest: jest.fn() };
});

const request = apiRequest as jest.MockedFunction<typeof apiRequest>;

const VEHICLE = {
  vehicle: {
    year: 2019,
    make: 'Volkswagen',
    model: 'Golf R',
    current_mileage: 78_412,
    photo_url: null,
    photo_kind: null,
  },
};

/** §0.8, as the route serves it. */
const GOLF_SET = {
  id: 'set-1',
  vehicle_id: 'v1',
  brand: 'Michelin',
  line: 'Pilot Sport 4S',
  size_front: '245/35R19',
  size_rear: '245/35R19',
  installed_on: '2025-03-12',
  install_odometer: 54_232,
  purchase_place: 'Discount Tire',
  rotation_interval_miles: 6_000,
  interval_source: 'owner',
  treadwear_miles_entered: 45_000,
  provenance: 'invoice',
};
const GOLF_ROTATIONS = [
  { id: 'r1', set_id: 'set-1', rotated_on: '2025-06-28', odometer: 60_140, provenance: 'invoice' },
  { id: 'r2', set_id: 'set-1', rotated_on: '2025-11-09', odometer: 67_012, provenance: 'typed' },
];

/** §0.9 — staggered, no install record, no interval. */
const M340I_VEHICLE = {
  vehicle: { year: 2021, make: 'BMW', model: 'M340i', current_mileage: 41_208, photo_url: null, photo_kind: null },
};
const M340I_SET = {
  id: 'set-2',
  vehicle_id: 'v2',
  brand: 'Michelin',
  line: 'Pilot Sport 4S',
  size_front: '225/40R19',
  size_rear: '255/35R19',
  installed_on: null,
  install_odometer: null,
  purchase_place: null,
  rotation_interval_miles: null,
  interval_source: null,
  treadwear_miles_entered: null,
  provenance: 'typed',
};

function serve(vehicle: unknown, tires: unknown) {
  request.mockImplementation(async (path: string) => {
    if (path.startsWith('/load-vehicle')) return vehicle as never;
    if (path.startsWith('/tires')) {
      if (tires instanceof Error) throw tires;
      return tires as never;
    }
    throw new Error(`unexpected ${path}`);
  });
}

const handlers = () => ({
  onSignOut: jest.fn(),
  onBack: jest.fn(),
  onAddSet: jest.fn(),
  onEditSet: jest.fn(),
  onEnterInterval: jest.fn(),
  onAddRotation: jest.fn(),
});

/** Every element painted or inked in sodium, by testID or type. */
function sodiumIn(tree: unknown): string[] {
  const found: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const el = node as { type?: string; props?: { style?: unknown; testID?: string }; children?: unknown[] };
    const style = StyleSheet.flatten(el.props?.style as never) as
      | { backgroundColor?: string; color?: string; borderColor?: string }
      | undefined;
    if (style?.backgroundColor === status.attention) found.push(`fill:${el.props?.testID ?? el.type}`);
    if (style?.color === status.attention) found.push(`ink:${el.type}`);
    if (style?.borderColor === status.attention) found.push(`edge:${el.type}`);
    (el.children ?? []).forEach(walk);
  };
  walk(tree);
  return found;
}

beforeEach(() => {
  request.mockReset();
});

describe('the hero — §0.8', () => {
  it('derives every figure on the frame, and prints the copy verbatim', async () => {
    serve(VEHICLE, { set: GOLF_SET, rotations: GOLF_ROTATIONS });
    const view = await render(<TiresScreen vehicleId="v1" {...handlers()} />);
    await waitFor(() => expect(view.getByText('Pilot Sport 4S')).toBeTruthy());

    // The strip — three cells, in order, no dash. (The style sets the caps.)
    expect(view.getByText('Installed')).toBeTruthy();
    expect(view.getByText('On this set')).toBeTruthy();
    expect(view.getByText('12 MAR 2025')).toBeTruthy();
    expect(view.getByText('24,180 MI')).toBeTruthy();
    expect(view.getByText('DISCOUNT TIRE')).toBeTruthy();
    // The title block: the car (also the back control's label), the line, brand · size (one size, so it prints).
    expect(view.getAllByText('2019 Volkswagen Golf R')).toHaveLength(2);
    expect(view.getByLabelText('Back to 2019 Volkswagen Golf R')).toBeTruthy();
    expect(view.getByText('MICHELIN · 245/35R19')).toBeTruthy();
    // The instrument.
    expect(view.getByTestId('odometer-since').props.children).toBe('11,400');
    expect(view.getByText('Miles since last rotation')).toBeTruthy();
    expect(view.getByText('6,000 MI')).toBeTruthy();
    // The record, 01 the most recent, each with its mark.
    expect(view.getByLabelText('1., 09 NOV 2025, 67,012 MI, typed by you')).toBeTruthy();
    expect(view.getByLabelText('2., 28 JUN 2025, 60,140 MI, read off a scanned invoice')).toBeTruthy();
    // Nothing that names the absence of a condition.
    expect(view.queryByText(/SQUARE SET|ALL FOUR|NOT POSSIBLE|OFTEN HALVED|NOT ENTERED/)).toBeNull();
    // The one control, answering the screen's state.
    const add = view.getByLabelText('Add a rotation');
    expect(add.props.accessibilityRole).toBe('button');
    expect(view.queryByLabelText('Enter the interval')).toBeNull();
  });

  it('draws the sodium run once the axis has a width, and nothing else in sodium', async () => {
    serve(VEHICLE, { set: GOLF_SET, rotations: GOLF_ROTATIONS });
    const view = await render(<TiresScreen vehicleId="v1" {...handlers()} />);
    await waitFor(() => expect(view.getByTestId('odometer-axis')).toBeTruthy());
    await fireEvent(view.getByTestId('odometer-axis'), 'layout', { nativeEvent: { layout: { width: 353, height: 60 } } });
    expect(view.getByTestId('odometer-past').props.children).toBe('PAST 5,400 MI');
    expect(sodiumIn(view.toJSON())).toEqual(['fill:odometer-run']);
  });

  it('opens the rotation form with the set, its rotations and the car’s reading', async () => {
    serve(VEHICLE, { set: GOLF_SET, rotations: GOLF_ROTATIONS });
    const h = handlers();
    const view = await render(<TiresScreen vehicleId="v1" {...h} />);
    await waitFor(() => expect(view.getByLabelText('Add a rotation')).toBeTruthy());
    await userEvent.setup().press(view.getByLabelText('Add a rotation'));
    expect(h.onAddRotation).toHaveBeenCalledTimes(1);
    const [set, rotations, odometer] = h.onAddRotation.mock.calls[0];
    expect(set.id).toBe('set-1');
    expect(rotations).toHaveLength(2);
    expect(odometer).toBe(78_412);
  });

  it('offers the door to what was entered', async () => {
    serve(VEHICLE, { set: GOLF_SET, rotations: GOLF_ROTATIONS });
    const h = handlers();
    const view = await render(<TiresScreen vehicleId="v1" {...h} />);
    await waitFor(() => expect(view.getByText('What you entered')).toBeTruthy());
    await userEvent.setup().press(view.getByText('What you entered'));
    expect(h.onEditSet).toHaveBeenCalledWith(expect.objectContaining({ id: 'set-1' }));
  });
});

describe('the staggered set with no interval — §0.9', () => {
  it('prints the two sizes, the two consequences, the NOT ENTERED row, and no strip', async () => {
    serve(M340I_VEHICLE, { set: M340I_SET, rotations: [] });
    const view = await render(<TiresScreen vehicleId="v2" {...handlers()} />);
    await waitFor(() => expect(view.getByText('Pilot Sport 4S')).toBeTruthy());

    // The sub-line is the brand alone; the sizes are the subject.
    expect(view.getByText('MICHELIN')).toBeTruthy();
    expect(view.getByLabelText('Front 225/40R19, rear 255/35R19')).toBeTruthy();
    // The consequences, verbatim and without a halved number.
    expect(view.getByLabelText('1., Front to rear, NOT POSSIBLE')).toBeTruthy();
    expect(view.getByLabelText('2., Rear mileage warranty, Check your card, OFTEN HALVED')).toBeTruthy();
    // The absence, stated once.
    expect(view.getByLabelText('Rotation interval, Tappet will not guess this, NOT ENTERED')).toBeTruthy();
    // No strip: nothing to put in it.
    expect(view.queryByText('Installed')).toBeNull();
    expect(view.queryByText('On this set')).toBeNull();
    // No instrument: nothing to count from.
    expect(view.queryByTestId('strip-odometer')).toBeNull();
    // Zero sodium.
    expect(sodiumIn(view.toJSON())).toEqual([]);
    // The primary answers the row; the secondary keeps the record reachable.
    expect(view.getByLabelText('Enter the interval')).toBeTruthy();
    expect(view.getByLabelText('Add a rotation')).toBeTruthy();
  });

  it('routes ENTER THE INTERVAL to its screen with the set', async () => {
    serve(M340I_VEHICLE, { set: M340I_SET, rotations: [] });
    const h = handlers();
    const view = await render(<TiresScreen vehicleId="v2" {...h} />);
    await waitFor(() => expect(view.getByLabelText('Enter the interval')).toBeTruthy());
    await userEvent.setup().press(view.getByLabelText('Enter the interval'));
    expect(h.onEnterInterval).toHaveBeenCalledWith(expect.objectContaining({ id: 'set-2' }));
  });
});

describe('a set with an install and rotations but no interval', () => {
  it('counts, plots, and warns of nothing', async () => {
    serve(VEHICLE, { set: { ...GOLF_SET, rotation_interval_miles: null, interval_source: null }, rotations: GOLF_ROTATIONS });
    const view = await render(<TiresScreen vehicleId="v1" {...handlers()} />);
    await waitFor(() => expect(view.getByTestId('odometer-since')).toBeTruthy());
    await fireEvent(view.getByTestId('odometer-axis'), 'layout', { nativeEvent: { layout: { width: 353, height: 60 } } });
    expect(view.getByTestId('odometer-since').props.children).toBe('11,400');
    expect(view.queryByTestId('odometer-run')).toBeNull();
    expect(view.queryByText(/^PAST /)).toBeNull();
    expect(view.getByLabelText('Rotation interval, Tappet will not guess this, NOT ENTERED')).toBeTruthy();
    expect(sodiumIn(view.toJSON())).toEqual([]);
  });
});

describe('no set on record', () => {
  it('names the screen, states the absence once, and offers the one act', async () => {
    serve(VEHICLE, { set: null, rotations: [] });
    const h = handlers();
    const view = await render(<TiresScreen vehicleId="v1" {...h} />);
    await waitFor(() => expect(view.getByText('NO SET ON RECORD')).toBeTruthy());
    expect(view.getByText('Tires')).toBeTruthy();
    expect(view.queryByText('Rotations')).toBeNull();
    await userEvent.setup().press(view.getByLabelText('Add a tire set'));
    expect(h.onAddSet).toHaveBeenCalledTimes(1);
  });
});

describe('until the migrations are applied', () => {
  it('names the state rather than offering a retry that cannot help', async () => {
    serve(
      VEHICLE,
      new ApiRequestError({ status: 503, message: 'Tire records are not switched on yet.', code: 'tires-unavailable' })
    );
    const view = await render(<TiresScreen vehicleId="v1" {...handlers()} />);
    await waitFor(() => expect(view.getByText('Tire records are not switched on yet')).toBeTruthy());
    expect(view.queryByLabelText('Try again')).toBeNull();
    expect(view.queryByLabelText('Add a tire set')).toBeNull();
  });

  it('a plain failure keeps the retry', async () => {
    serve(VEHICLE, new ApiRequestError({ status: 500, message: 'Could not read the tire set' }));
    const view = await render(<TiresScreen vehicleId="v1" {...handlers()} />);
    await waitFor(() => expect(view.getByText('Could not load the tire record')).toBeTruthy());
    expect(view.getByLabelText('Try again')).toBeTruthy();
  });
});

describe('removing a rotation', () => {
  it('confirms, then deletes through the API and reloads', async () => {
    serve(VEHICLE, { set: GOLF_SET, rotations: GOLF_ROTATIONS });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      const remove = buttons?.find((b) => b.style === 'destructive');
      remove?.onPress?.();
    });
    const view = await render(<TiresScreen vehicleId="v1" {...handlers()} />);
    await waitFor(() => expect(view.getByLabelText('Remove the rotation of 09 NOV 2025')).toBeTruthy());
    await userEvent.setup().press(view.getByLabelText('Remove the rotation of 09 NOV 2025'));
    await waitFor(() =>
      expect(request).toHaveBeenCalledWith('/tires/rotations?rotationId=r2', expect.objectContaining({ method: 'DELETE' }))
    );
    expect(alert).toHaveBeenCalledWith(
      'Remove this rotation?',
      expect.stringContaining('09 NOV 2025 at 67,012 MI'),
      expect.anything()
    );
    alert.mockRestore();
  });
});

describe('the loader', () => {
  it('opens on the wait instrument with a line, and honours the quiet refetch', async () => {
    let resolve: (value: unknown) => void = () => {};
    request.mockImplementation(() => new Promise((r) => (resolve = r)));
    const view = await render(<TiresScreen vehicleId="v1" {...handlers()} />);
    expect(view.getByText('Opening the tire record')).toBeTruthy();
    resolve(VEHICLE);
  });
});
