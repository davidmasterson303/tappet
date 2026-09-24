import { render, userEvent } from '@testing-library/react-native';

import { AddVehicleScreen } from '../AddVehicleScreen';
import { TypeVinScreen } from '../TypeVinScreen';
import { decodeVin } from '../../api/vpic';

/**
 * The first screen of adding a car, and the typed door.
 *
 * ── What is worth asserting here ────────────────────────────────────────────
 *
 * The rebuild (20 Sep) has one structural claim and one narrative one. The
 * structural claim is that **screen one carries no form field in any state**
 * — three doors and nothing else — which is asserted by rendering it and
 * finding no input, in both the presence form (the doors are there) and the
 * absence form (nothing typeable is). The narrative claim is that the decode
 * is told as steps that completed, and that every path ends in a named car
 * or a stated failure with two ways on. `decode-stages.test.ts` holds the
 * model; this walks the screens.
 *
 * ── The lesson this file carries forward ────────────────────────────────────
 *
 * A version of the old add-form suite was written on 8 Aug and deleted rather
 * than left broken: `fireEvent` "did not reach the handlers". The real fault
 * was the missing `await` — in RNTL 14 `render`, `fireEvent` and `userEvent`
 * are all async, and an un-awaited one leaves React's act scope open, after
 * which **no later render in that file commits at all**. `jest.setup.js`
 * fails on it now. **Use `userEvent` in every screen test in this app, and
 * await it.**
 */

jest.mock('../../api/vpic', () => ({
  decodeVin: jest.fn(),
  fetchModels: jest.fn().mockResolvedValue([]),
}));

const mockDecode = decodeVin as jest.MockedFunction<typeof decodeVin>;

const ACCORD = '1HGCM82633A004352';
const ACCORD_DECODE = {
  status: 'decoded' as const,
  car: { year: 2003, make: 'Honda', model: 'Accord', trim: 'EX-V6', confidence: 'clean' as const, engine: '3.0L V6' },
};

beforeEach(() => {
  mockDecode.mockReset();
});

describe('screen one: the doors', () => {
  it('offers the sticker and the keyboard, and each door opens', async () => {
    const user = userEvent.setup();
    const onScan = jest.fn();
    const onType = jest.fn();
    const view = await render(<AddVehicleScreen onScan={onScan} onType={onType} />);

    await user.press(view.getByText('Scan the sticker'));
    await user.press(view.getByText('Type it'));

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onType).toHaveBeenCalledTimes(1);
  });

  it('carries no form field — no input of any kind, and none of the old labels', async () => {
    const view = await render(<AddVehicleScreen onScan={jest.fn()} onType={jest.fn()} />);

    /*
      The presence half first, so the absence half cannot pass on an empty
      render: the doors are there. Then nothing typeable is — no `TextInput`
      in the tree, and none of the labels the old form asked through.
    */
    expect(view.getByText('Scan the sticker')).toBeTruthy();
    /*
      Every `TextInput` in this app renders with `accessibilityLabel` or a
      placeholder, but the rule here is broader than either: nothing in the
      rendered tree is a text input at all. `toJSON()` is the host tree, so
      a native input by any name shows up as its host type.
    */
    const hostTypes: string[] = [];
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const element = node as { type?: string; children?: unknown[] };
      if (element.type) hostTypes.push(element.type);
      element.children?.forEach(walk);
    };
    walk(view.toJSON());
    expect(hostTypes.length).toBeGreaterThan(5);
    expect(hostTypes.filter((type) => /TextInput/i.test(type))).toHaveLength(0);

    // The control: the same walk over the typed door finds its one input, so
    // the absence above is a finding and not a walker that sees nothing.
    hostTypes.length = 0;
    walk((await render(<TypeVinScreen onIdentified={jest.fn()} onDescribe={jest.fn()} />)).toJSON());
    expect(hostTypes.filter((type) => /TextInput/i.test(type))).toHaveLength(1);
    for (const label of ['Model year', 'Make', 'Model', 'Trim', 'VIN', 'Current mileage']) {
      expect(view.queryByLabelText(label)).toBeNull();
    }
    expect(view.queryByText(/enter manually/i)).toBeNull();
    expect(view.queryByText(/don't have the VIN/i)).toBeNull();
  });
});

describe('the typed door', () => {
  function mount(overrides: Partial<Parameters<typeof TypeVinScreen>[0]> = {}) {
    const props = { onIdentified: jest.fn(), onDescribe: jest.fn(), ...overrides };
    return { props, view: render(<TypeVinScreen {...props} />) };
  }

  it('counts on the ramp, which is a real progressbar, and normalises what is typed', async () => {
    const user = userEvent.setup();
    const { view } = mount();
    const field = (await view).getByLabelText('VIN');

    await user.type(field, '1hg cm-826');
    expect(field.props.value).toBe('1HGCM826');
    expect((await view).getByTestId('vin-ramp').props.accessibilityValue).toEqual({ min: 0, max: 17, now: 8 });
    // Nothing to read yet, and no count-down sentence — the ramp is the count.
    expect((await view).getByLabelText('Read the car off it').props.accessibilityState).toMatchObject({ disabled: true });
    expect((await view).queryByText(/to go/)).toBeNull();
  });

  it('names the three characters a VIN cannot contain, the moment one lands', async () => {
    const user = userEvent.setup();
    const { view } = mount();

    await user.type((await view).getByLabelText('VIN'), '1HGCM82633A0O4352');
    expect((await view).getByText(/never contains I, O or Q/)).toBeTruthy();
    expect((await view).getByLabelText('Read the car off it').props.accessibilityState).toMatchObject({ disabled: true });
  });

  it('narrates the decode and hands the named car on once the owner confirms it', async () => {
    const user = userEvent.setup();
    mockDecode.mockResolvedValue(ACCORD_DECODE);
    const { props, view } = mount();

    await user.type((await view).getByLabelText('VIN'), ACCORD);
    await user.press((await view).getByLabelText('Read the car off it'));

    expect(mockDecode).toHaveBeenCalledWith(ACCORD, expect.anything());
    await (await view).findByText('→ Check digit agrees.');
    await (await view).findByText('→ 2003 Honda Accord EX-V6, 3.0L V6.');
    expect((await view).getByText('Identified')).toBeTruthy();

    // Not handed on until it is confirmed — the sentence is read first.
    expect(props.onIdentified).not.toHaveBeenCalled();
    await user.press((await view).getByLabelText("That's my car"));
    expect(props.onIdentified).toHaveBeenCalledWith({
      vin: ACCORD,
      year: 2003,
      make: 'Honda',
      model: 'Accord',
      trim: 'EX-V6',
      engine: '3.0L V6',
      source: 'typed',
    });
  });

  it('says a check digit does not agree, and asks NHTSA anyway', async () => {
    const user = userEvent.setup();
    const importVin = 'JF1VA1E60G9800001';
    mockDecode.mockResolvedValue({
      status: 'decoded',
      car: { year: 2016, make: 'Subaru', model: 'WRX', trim: 'Premium + MR', confidence: 'suspect', engine: '2.0L 4-cylinder' },
    });
    const { view } = mount();

    await user.type((await view).getByLabelText('VIN'), importVin);
    await user.press((await view).getByLabelText('Read the car off it'));

    await (await view).findByText(/Check digit does not agree — read it over. Asking NHTSA anyway./);
    await (await view).findByText('→ 2016 Subaru WRX Premium + MR, 2.0L 4-cylinder.');
    expect(mockDecode).toHaveBeenCalledWith(importVin, expect.anything());
  });

  it('states a failure NHTSA answered, and offers the described car with the number carried', async () => {
    const user = userEvent.setup();
    mockDecode.mockResolvedValue({ status: 'unplaced' });
    const { props, view } = mount();

    await user.type((await view).getByLabelText('VIN'), 'ZZZZZZZZZZZZZZZZZ');
    await user.press((await view).getByLabelText('Read the car off it'));

    await (await view).findByText('→ NHTSA has nothing for that number. Read it over, or describe the car instead.');
    expect((await view).getByText('Not identified')).toBeTruthy();
    expect((await view).queryByLabelText("That's my car")).toBeNull();

    await user.press((await view).getByLabelText('Describe the car instead'));
    expect(props.onDescribe).toHaveBeenCalledWith({ vin: 'ZZZZZZZZZZZZZZZZZ', prefill: undefined });
    expect(props.onIdentified).not.toHaveBeenCalled();
  });

  it('states a failure NHTSA did not answer differently, because the next move differs', async () => {
    const user = userEvent.setup();
    mockDecode.mockResolvedValue({ status: 'unreachable' });
    const { view } = mount();

    await user.type((await view).getByLabelText('VIN'), ACCORD);
    await user.press((await view).getByLabelText('Read the car off it'));

    await (await view).findByText(/NHTSA did not answer. Check the connection and try again/);
  });

  it('carries a partial decode to the described car rather than saving half of one', async () => {
    const user = userEvent.setup();
    mockDecode.mockResolvedValue({
      status: 'decoded',
      car: { year: null, make: 'Honda', model: 'Accord', trim: null, confidence: 'suspect', engine: null },
    });
    const { props, view } = mount();

    await user.type((await view).getByLabelText('VIN'), ACCORD);
    await user.press((await view).getByLabelText('Read the car off it'));

    await (await view).findByText(/NHTSA could only place it as "Honda Accord"/);
    await user.press((await view).getByLabelText('Describe the car instead'));
    expect(props.onDescribe).toHaveBeenCalledWith({ vin: ACCORD, prefill: { make: 'Honda', model: 'Accord' } });
  });

  it('lets the number be edited after a failure, and the log goes away', async () => {
    const user = userEvent.setup();
    mockDecode.mockResolvedValue({ status: 'unplaced' });
    const { view } = mount();

    await user.type((await view).getByLabelText('VIN'), 'ZZZZZZZZZZZZZZZZZ');
    await user.press((await view).getByLabelText('Read the car off it'));
    await (await view).findByText('Not identified');

    await user.press((await view).getByLabelText('Edit the number'));
    expect((await view).queryByTestId('decode-log')).toBeNull();
    expect((await view).getByLabelText('Read the car off it')).toBeTruthy();
  });

  it('reaches the described car from "I don\'t have the VIN", carrying nothing', async () => {
    const user = userEvent.setup();
    const { props, view } = mount();

    await user.press((await view).getByLabelText("I don't have the VIN"));
    expect(props.onDescribe).toHaveBeenCalledWith({});
  });
});
